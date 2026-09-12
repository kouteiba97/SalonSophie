-- The console was inventing a price

-- `book_appointment_as_staff` snapshotted `price_min` for every tariff kind except `free`. For a
-- fixed price that is right. For a range it is a guess, and for a "from" price it is a floor
-- presented as a bill.
--
-- `book_appointment` has always got this right, and the reasoning is in a comment there: a range
-- like "14 000 – 35 000 DA" depends on her hair, so settling it before anyone has seen her would
-- let the revenue report quietly state the cheapest possible day as fact. NULL means "not settled
-- yet", which is what the console renders and what /finances counts as unbilled.
--
-- The staff path is the one reception uses all day, so in production it would have been the
-- dominant source of revenue data — the wrong number, on the screen built to answer which of the
-- three businesses earns most.
--
-- Found by booking a soins-capillaires through the console against the live database and reading
-- the row back: price_charged was 1 400 000 centimes, the floor of a range whose ceiling is two
-- and a half times higher. The row has been corrected.

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
      /*
       * Only a settled price is recorded. Same rule as the public path, and it was missing here:
       *   fixed  the published price
       *   free   0
       *   range  NULL — "14 000 – 35 000 DA" depends on her hair
       *   from   NULL — a floor is not a price
       *   addon  NULL — a supplement to something else, meaningless alone
       */
      case v_service.kind
        when 'fixed'::public.price_kind then v_service.price_min
        when 'free'::public.price_kind then 0
        else null
      end,
      v_service.duration_minutes
    );
  end if;

  return (v_reference, v_id, v_staff_slug, v_requested is not null)::public.booking_result;
end;
$$;

