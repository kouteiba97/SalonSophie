-- Public booking
--
-- BUILD_BRIEF §5.3 item 9: "optimistic UI is fine, but the server re-validates on submit inside
-- a transaction. Two clients must never take one slot."
--
-- The public site is anonymous, and RLS quite correctly forbids anonymous inserts into
-- `appointments`. The alternative to this function would be putting the service-role key in the
-- Next.js server and doing the work there — a key that bypasses RLS on every table, held by a
-- process that also renders HTML. A narrow `security definer` function is the smaller blast
-- radius: it can create a client and one appointment and do nothing else, and the transaction
-- lives where the constraint does.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A booking with an unknown duration is a *request*, not a held slot
--
-- Durations are unknown (§6), so for most services we cannot compute an end time. Rather than
-- invent one — a 30-minute default would silently become a promise — a request records the time
-- the client asked for and holds no space on the calendar. Reception confirms it by hand.
--
-- `period` therefore becomes nullable, and exactly one of period/requested_start must be set.
-- A NULL never conflicts in an exclusion constraint, so requests cannot block real bookings and
-- real bookings keep their guarantee untouched.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.appointments
  alter column period drop not null;

alter table public.appointments
  add column requested_start timestamptz;

alter table public.appointments
  add constraint appointments_scheduled_or_requested
  check ((period is not null) <> (requested_start is not null));

comment on column public.appointments.requested_start is
  'Set instead of `period` when the service duration is unknown: the client asked for this time and reception confirms it by hand. Holds no slot.';

create index appointments_requested_idx on public.appointments (requested_start)
  where requested_start is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- book_appointment
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create type public.booking_result as (
  reference text,
  appointment_id uuid,
  staff_slug text,
  is_request boolean
);

create or replace function public.book_appointment(
  p_service_slug text,
  p_gown_slug text,
  p_staff_slug text,
  p_start timestamptz,
  p_client_name text,
  p_client_phone text,
  p_notes text default null
)
returns public.booking_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant     uuid;
  v_service    public.services%rowtype;
  v_gown       public.gowns%rowtype;
  v_client     uuid;
  v_staff      uuid;
  v_staff_slug text;
  v_duration   integer;
  v_period     tstzrange;
  v_requested  timestamptz;
  v_id         uuid;
  v_reference  text;
  v_phone      text;
begin
  -- ── validate the subject ─────────────────────────────────────────────────────────────────
  if (p_service_slug is null) = (p_gown_slug is null) then
    raise exception 'booking_invalid_subject'
      using hint = 'Provide exactly one of p_service_slug or p_gown_slug';
  end if;

  if p_gown_slug is not null then
    select * into v_gown from public.gowns
      where slug = p_gown_slug and is_active limit 1;
    if not found then
      raise exception 'booking_unknown_gown';
    end if;
    v_tenant := v_gown.tenant_id;
    -- Choosing a gown books a FITTING, never the rental (§5.3 item 10). Fitting length is not
    -- known either, so a gown always produces a request.
    v_duration := null;
  else
    select * into v_service from public.services
      where slug = p_service_slug and is_active limit 1;
    if not found then
      raise exception 'booking_unknown_service';
    end if;
    v_tenant := v_service.tenant_id;
    v_duration := v_service.duration_minutes;
  end if;

  -- ── validate the client ──────────────────────────────────────────────────────────────────
  v_phone := regexp_replace(coalesce(p_client_phone, ''), '[\s.-]', '', 'g');
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'booking_invalid_phone';
  end if;

  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'booking_invalid_name';
  end if;

  if p_start is null then
    raise exception 'booking_invalid_time';
  end if;

  -- The server decides the horizon too; a client that edits the payload gains nothing.
  if p_start < now() then
    raise exception 'booking_in_the_past';
  end if;
  if p_start > now() + interval '1 year' then
    raise exception 'booking_too_far';
  end if;

  -- ── the client record ────────────────────────────────────────────────────────────────────
  insert into public.clients (tenant_id, full_name, phone)
  values (v_tenant, btrim(p_client_name), v_phone)
  on conflict (tenant_id, phone) do update set full_name = excluded.full_name
  returning id into v_client;

  -- ── the staff member ─────────────────────────────────────────────────────────────────────
  if p_staff_slug is not null and p_staff_slug <> 'sans-preference' then
    select id, slug into v_staff, v_staff_slug from public.staff
      where tenant_id = v_tenant and slug = p_staff_slug and is_bookable limit 1;
    if not found then
      raise exception 'booking_unknown_staff';
    end if;
  end if;

  -- ── schedule or request ──────────────────────────────────────────────────────────────────
  if v_duration is null then
    -- Unknown duration: record the wish, hold nothing.
    v_requested := p_start;
    v_period := null;
  else
    v_period := tstzrange(p_start, p_start + make_interval(mins => v_duration), '[)');
    v_requested := null;

    -- No preference: take the first bookable staff member who is genuinely free. The exclusion
    -- constraint is still the authority — this only avoids an obvious collision up front.
    if v_staff is null then
      select s.id, s.slug into v_staff, v_staff_slug
      from public.staff s
      where s.tenant_id = v_tenant and s.is_bookable
        and not exists (
          select 1 from public.appointments a
          where a.staff_id = s.id
            and a.status in ('pending'::public.appointment_status, 'confirmed'::public.appointment_status)
            and a.period && v_period
        )
      order by s.sort_order, s.display_name
      limit 1;

      if v_staff is null then
        raise exception 'booking_slot_taken';
      end if;
    end if;
  end if;

  -- ── insert ───────────────────────────────────────────────────────────────────────────────
  begin
    insert into public.appointments (
      tenant_id, client_id, staff_id, line, status, period, requested_start, gown_id, notes
    )
    values (
      v_tenant,
      v_client,
      v_staff,
      -- Explicit casts: `search_path = ''` is set for safety, so unqualified enum literals get
      -- no implicit coercion and would fail as text.
      (case when p_gown_slug is not null then 'bridal' else 'salon' end)::public.business_line,
      'pending'::public.appointment_status,
      v_period,
      v_requested,
      case when p_gown_slug is not null then v_gown.id else null end,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id, reference into v_id, v_reference;
  exception
    -- 23P01: the exclusion constraint fired. Someone else took this slot between the client
    -- seeing it and pressing confirm. This is the race the constraint exists to lose safely.
    when exclusion_violation then
      raise exception 'booking_slot_taken';
  end;

  return (v_reference, v_id, v_staff_slug, v_requested is not null)::public.booking_result;
end;
$$;

-- Callable by the public site. The function's own validation is the boundary, not RLS.
grant execute on function public.book_appointment(text, text, text, timestamptz, text, text, text)
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Public availability
--
-- Reading raw appointment rows would leak who is booked with whom, so the anon role never sees
-- them. This returns busy spans only — start, end, staff — with no client attached.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.busy_spans(p_from date, p_to date)
returns table (staff_slug text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, lower(a.period), upper(a.period)
  from public.appointments a
  join public.staff s on s.id = a.staff_id
  where a.status in ('pending'::public.appointment_status, 'confirmed'::public.appointment_status)
    and a.period is not null
    and a.period && tstzrange(p_from::timestamptz, (p_to + 1)::timestamptz, '[)')
$$;

grant execute on function public.busy_spans(date, date) to anon, authenticated;
