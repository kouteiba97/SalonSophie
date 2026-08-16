-- Booking from the console
--
-- §13's last line: "New appointment: four-step modal — business line → service → staff → time
-- slot + client details." Until now the console could not create an appointment at all, which
-- meant §7's "primary daily user; optimise for booking speed" had to open the public website and
-- book as though they were the client.
--
-- ── Why this is not `book_appointment` ───────────────────────────────────────────────────────
-- The public function is `security definer` because its caller is `anon`, which has no policy to
-- run under. Reusing it here would run reception's write with the definer's privileges and quietly
-- take RLS out of the path — the boundary would still look correct while no longer being the
-- boundary. This one is invoker, so `appointments_front_desk_write` is what actually decides, and
-- a stylist calling it is refused by the same policy that governs every other write they make.

/*
 * Finding a client by phone, for reception.
 *
 * Speed matters here: most people booking are already in the book, and retyping a name is both
 * slower and how a second record for the same person gets created. Returns nothing to a stylist
 * unless they have served that client, because it reads through `clients_read` like everything
 * else.
 */
create or replace function public.search_clients(p_query text)
returns table (id uuid, full_name text, phone text, is_bride boolean, visits integer)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.full_name,
    c.phone,
    c.is_bride,
    (select count(*)::int from public.appointments a
      where a.client_id = c.id and a.status = 'completed')
  from public.clients c
  where length(btrim(coalesce(p_query, ''))) >= 2
    and (
      c.full_name ilike '%' || btrim(p_query) || '%'
      /*
       * Only match on phone when the query actually contains digits. Stripping non-digits from
       * a name leaves an empty string, and `phone like '%%'` matches every client the caller is
       * allowed to see — so a search for "Meriem" quietly returned the whole book.
       */
      or (
        length(regexp_replace(p_query, '[^0-9]', '', 'g')) >= 2
        and c.phone like '%' || regexp_replace(p_query, '[^0-9]', '', 'g') || '%'
      )
    )
  order by c.full_name
  limit 10;
$$;

create or replace function public.book_appointment_as_staff(
  p_line text,
  p_service_slug text,
  p_staff_slug text,
  p_start timestamptz,
  p_client_id uuid,
  p_client_name text,
  p_client_phone text,
  p_notes text default null,
  p_status text default 'confirmed'
)
returns public.booking_result
language plpgsql
set search_path = ''
as $$
declare
  v_tenant    uuid := public.auth_tenant_id();
  v_service   public.services%rowtype;
  v_client    uuid := p_client_id;
  v_staff     uuid;
  v_staff_slug text;
  v_period    tstzrange;
  v_requested timestamptz;
  v_phone     text;
  v_id        uuid;
  v_reference text;
begin
  if v_tenant is null then raise exception 'booking_forbidden'; end if;
  if p_start is null then raise exception 'booking_invalid_time'; end if;

  if p_service_slug is not null then
    select * into v_service from public.services
      where tenant_id = v_tenant and slug = p_service_slug and is_active;
    if not found then raise exception 'booking_unknown_service'; end if;
  end if;

  /*
   * An existing client is used as-is; a new one is created. Reception books for people who are
   * standing at the desk, so the phone is still validated — a booking nobody can be reached
   * about is barely a booking.
   */
  if v_client is null then
    v_phone := regexp_replace(coalesce(p_client_phone, ''), '[\s.-]', '', 'g');
    if v_phone !~ '^0[5-7][0-9]{8}$' then raise exception 'booking_invalid_phone'; end if;
    if coalesce(btrim(p_client_name), '') = '' then raise exception 'booking_invalid_name'; end if;

    insert into public.clients (tenant_id, full_name, phone)
    values (v_tenant, btrim(p_client_name), v_phone)
    on conflict (tenant_id, phone) do update set full_name = excluded.full_name
    returning id into v_client;
  else
    perform 1 from public.clients where id = v_client and tenant_id = v_tenant;
    if not found then raise exception 'booking_unknown_client'; end if;
  end if;

  if p_staff_slug is not null and p_staff_slug <> '' then
    select id, slug into v_staff, v_staff_slug from public.staff
      where tenant_id = v_tenant and slug = p_staff_slug and is_bookable;
    if not found then raise exception 'booking_unknown_staff'; end if;
  end if;

  -- Same rule as the public path: no duration, no slot. Reception may still take the booking,
  -- it is simply recorded as a request rather than pretending to hold the calendar.
  if v_service.duration_minutes is null then
    v_requested := p_start;
    v_period := null;
  else
    v_period := tstzrange(
      p_start,
      p_start + make_interval(mins => v_service.duration_minutes + coalesce(v_service.buffer_minutes, 0)),
      '[)'
    );
    v_requested := null;
  end if;

  begin
    insert into public.appointments (
      tenant_id, client_id, staff_id, line, status, period, requested_start, notes
    )
    values (
      v_tenant, v_client, v_staff,
      coalesce(nullif(p_line, ''), 'salon')::public.business_line,
      coalesce(nullif(p_status, ''), 'confirmed')::public.appointment_status,
      v_period, v_requested,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id, reference into v_id, v_reference;
  exception
    when exclusion_violation then
      raise exception 'booking_slot_taken';
  end;

  -- Record which service was booked, so the day-line and the revenue reports can name it.
  if v_service.id is not null then
    insert into public.appointment_services (
      tenant_id, appointment_id, service_id, price_charged, duration_minutes
    )
    values (
      v_tenant, v_id, v_service.id,
      case when v_service.kind = 'free' then 0 else v_service.price_min end,
      v_service.duration_minutes
    );
  end if;

  return (v_reference, v_id, v_staff_slug, v_requested is not null)::public.booking_result;
end;
$$;

grant execute on function public.search_clients(text) to authenticated;
grant execute on function
  public.book_appointment_as_staff(text, text, text, timestamptz, uuid, text, text, text, text)
  to authenticated;
