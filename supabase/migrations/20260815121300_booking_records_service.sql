-- Record which service was booked
--
-- `book_appointment` looked a service up to find its tenant and its duration, and then threw it
-- away. The appointment stored who, when and with whom — never what. Reception opening the
-- console saw "Amel Benali, 14:00" with no way to tell a brushing from a balayage, and §13's
-- day-line, which requires each block to show "client and service", could not be built at all.
--
-- `appointment_services` existed for this from the beginning and nothing ever wrote to it.
--
-- The fix is one insert, but the interesting part is what price to snapshot.

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
  v_charged    bigint;
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

  -- ── what was actually booked ─────────────────────────────────────────────────────────────
  if p_service_slug is not null then
    /*
     * The price is snapshotted so a later tariff change never rewrites history — but only where
     * a single number is genuinely implied.
     *
     *   fixed  the published price, and what she will be charged
     *   free   zero, which here is a real answer rather than a missing one
     *   range  NULL — "14 000 – 35 000 DA" depends on her hair, and picking either end would be
     *          inventing the bill before anyone has seen her
     *   from   NULL — a floor is not a price
     *   addon  NULL — a supplement to something else, meaningless alone
     *
     * NULL therefore means "not settled yet", which is what the console shows, and what keeps
     * the revenue KPI from quietly reporting the cheapest possible day.
     */
    v_charged := case v_service.kind
      when 'fixed'::public.price_kind then v_service.price_min
      when 'free'::public.price_kind then 0
      else null
    end;

    insert into public.appointment_services (
      tenant_id, appointment_id, service_id, price_charged, duration_minutes
    )
    values (v_tenant, v_id, v_service.id, v_charged, v_duration);
  end if;

  return (v_reference, v_id, v_staff_slug, v_requested is not null)::public.booking_result;
end;
$$;

grant execute on function public.book_appointment(text, text, text, timestamptz, text, text, text)
  to anon, authenticated;
