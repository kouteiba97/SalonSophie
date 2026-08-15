-- Bridal atelier — Phase 4
--
-- The tables landed in 20260815120400_bridal.sql, carrying non-negotiable #1 in an exclusion
-- constraint. This file adds the operations the console performs on them: taking a reservation,
-- moving it through its four states, moving a gown through its four states, and reporting how
-- hard each gown actually works.
--
-- None of these functions is `security definer`.
--
-- That is the difference between this file and `book_appointment`. The public booking function
-- has to be definer because the caller is `anon`, who quite correctly has no policy allowing an
-- insert. Here the caller is a signed-in member of staff, and the RLS policies written in
-- 20260815120700_rls.sql already say exactly who may do what: reception reads the atelier to
-- answer "is it free?", and only an owner writes to it. A definer function would quietly hand
-- reception the owner's permissions — the policies would still be there, and would no longer
-- mean anything.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A reservation needs a name a bride can quote on the phone
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.gown_reservations
  add column reference text not null
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

alter table public.gown_reservations
  add constraint gown_reservations_reference_unique unique (tenant_id, reference);

comment on column public.gown_reservations.reference is
  'Short human-quotable code, generated like appointments.reference.';

/*
 * An unbounded range would occupy the gown forever, and `&&` against infinity is true for every
 * future reservation — one bad row would make the dress permanently unbookable with no obvious
 * cause. The exclusion constraint would be working perfectly; the data would be wrong.
 */
alter table public.gown_reservations
  add constraint gown_reservations_period_bounded
  check (not lower_inf(period) and not upper_inf(period));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Why a gown changed state
--
-- `log_gown_state_change` already records every transition; it had nowhere to put the reason.
-- The reason arrives through a transaction-local setting rather than a new column on `gowns`,
-- because it belongs to the *event*, not to the dress.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.log_gown_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.state is not distinct from old.state then
    return new;
  end if;

  insert into public.gown_status_log (tenant_id, gown_id, from_state, to_state, changed_by, reason)
  values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.state else null end,
    new.state,
    auth.uid(),
    nullif(btrim(coalesce(current_setting('ns.gown_state_reason', true), '')), '')
  );
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Accessory stock
--
-- Barnous, diadème and veil are counted stock, not unique items, so the gown's exclusion
-- constraint is the wrong shape: two brides may borrow two veils on the same weekend if two
-- veils exist. A trigger is the honest tool here, and it is worth being explicit that it is
-- weaker than a constraint — two concurrent transactions can each pass this check and commit.
-- The salon has one person at the desk and three accessory lines; the race is theoretical. The
-- gown rule, which is not, is enforced by Postgres itself.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.check_accessory_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total  integer;
  v_loaned integer;
begin
  select a.stock_total into v_total
  from public.accessories a
  where a.id = new.accessory_id;

  /*
   * stock_total is 0 for every row the seed created, because the real counts were never supplied
   * (§6). Zero here means "not counted yet", not "we own none" — enforcing a limit of zero would
   * be inventing a business fact, and it would block every loan the salon actually makes.
   */
  if coalesce(v_total, 0) = 0 then
    return new;
  end if;

  select coalesce(sum(l.quantity), 0) into v_loaned
  from public.accessory_loans l
  where l.accessory_id = new.accessory_id
    and l.id is distinct from new.id
    and l.returned_at is null
    and l.period && new.period;

  if v_loaned + new.quantity > v_total then
    raise exception 'accessory_out_of_stock'
      using hint = 'Loaned over this period would exceed accessories.stock_total';
  end if;

  return new;
end;
$$;

create trigger accessory_loans_stock
  before insert or update on public.accessory_loans
  for each row execute function public.check_accessory_stock();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- reserve_gown
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create type public.reservation_result as (
  reservation_id uuid,
  reference text,
  client_id uuid
);

/*
 * Takes a reservation, its client and its accessories in one transaction.
 *
 * `p_to` is the last day the bride has the dress, because that is the question the front desk
 * asks her. The stored range is half-open, so it is stored as p_to + 1 — which is also why an
 * adjacent reservation may legitimately begin the following morning.
 *
 * Cleaning buffer days extend the *stored* range, so the exclusion constraint protects the
 * turnaround exactly as it protects the wedding. Recorded separately only so the console can
 * show a bride why the dress is unavailable on a day nobody is wearing it. How many days a gown
 * actually needs is unknown (§6, open question 11): the parameter defaults to 0 and the console
 * asks rather than assuming.
 */
create or replace function public.reserve_gown(
  p_gown_slug text,
  p_client_name text,
  p_client_phone text,
  p_from date,
  p_to date,
  p_cleaning_buffer_days smallint default 0,
  p_status public.reservation_status default 'held',
  p_deposit_amount bigint default null,
  p_notes text default null,
  p_accessory_slugs text[] default '{}'
)
returns public.reservation_result
language plpgsql
set search_path = ''
as $$
declare
  v_gown      public.gowns%rowtype;
  v_client    uuid;
  v_period    daterange;
  v_buffer    smallint := coalesce(p_cleaning_buffer_days, 0);
  v_id        uuid;
  v_reference text;
  v_phone     text;
  v_slug      text;
  v_accessory uuid;
begin
  -- ── the gown ─────────────────────────────────────────────────────────────────────────────
  select * into v_gown from public.gowns
    where slug = p_gown_slug and is_active limit 1;
  if not found then
    raise exception 'reservation_unknown_gown';
  end if;

  -- ── the dates ────────────────────────────────────────────────────────────────────────────
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'reservation_invalid_period';
  end if;

  if v_buffer < 0 then
    raise exception 'reservation_invalid_buffer';
  end if;

  /*
   * A rental in the past is a data-entry slip, not a booking. Recorded history is entered by
   * editing a row, not by taking a reservation, so the function refuses it rather than silently
   * accepting a wedding that already happened.
   */
  if p_from < (now() at time zone 'Africa/Algiers')::date then
    raise exception 'reservation_in_the_past';
  end if;

  v_period := daterange(p_from, (p_to + 1 + v_buffer)::date, '[)');

  -- ── the bride ────────────────────────────────────────────────────────────────────────────
  v_phone := regexp_replace(coalesce(p_client_phone, ''), '[\s.-]', '', 'g');
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'reservation_invalid_phone';
  end if;

  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'reservation_invalid_name';
  end if;

  -- is_bride is a fact about the person, not a guess: she is renting a wedding gown.
  insert into public.clients (tenant_id, full_name, phone, is_bride)
  values (v_gown.tenant_id, btrim(p_client_name), v_phone, true)
  on conflict (tenant_id, phone) do update
    set full_name = excluded.full_name, is_bride = true
  returning id into v_client;

  -- ── the reservation ──────────────────────────────────────────────────────────────────────
  begin
    insert into public.gown_reservations (
      tenant_id, gown_id, client_id, period, cleaning_buffer_days, status, deposit_amount, notes
    )
    values (
      v_gown.tenant_id,
      v_gown.id,
      v_client,
      v_period,
      v_buffer,
      coalesce(p_status, 'held'::public.reservation_status),
      p_deposit_amount,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning id, reference into v_id, v_reference;
  exception
    /*
     * 23P01 — the constraint from 20260815120400 fired. This is non-negotiable #1 doing its job:
     * whatever the console believed when it drew the calendar, the dress is already promised.
     * The race is lost here, in a transaction, rather than on a wedding day.
     */
    when exclusion_violation then
      raise exception 'gown_double_booked';
    -- RLS refused the insert: the caller is signed in but is not an owner.
    when insufficient_privilege then
      raise exception 'reservation_forbidden';
  end;

  -- ── accessories ──────────────────────────────────────────────────────────────────────────
  foreach v_slug in array coalesce(p_accessory_slugs, '{}'::text[])
  loop
    select a.id into v_accessory from public.accessories a
      where a.tenant_id = v_gown.tenant_id and a.slug = v_slug and a.is_active limit 1;
    if not found then
      raise exception 'reservation_unknown_accessory';
    end if;

    insert into public.accessory_loans (
      tenant_id, accessory_id, reservation_id, client_id, quantity, period
    )
    values (v_gown.tenant_id, v_accessory, v_id, v_client, 1, v_period);
  end loop;

  return (v_id, v_reference, v_client)::public.reservation_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- set_reservation_status
--
-- The four states are a lifecycle, not a dropdown. `returned` and `cancelled` are terminal on
-- purpose: both release the dates immediately (the exclusion constraint only counts held and
-- confirmed), so re-opening one would need the overlap re-checked, and by then someone else may
-- hold the week. Take a new reservation instead — it goes through the constraint.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.set_reservation_status(
  p_reservation_id uuid,
  p_status public.reservation_status,
  p_reason text default null
)
returns public.reservation_status
language plpgsql
set search_path = ''
as $$
declare
  v_current public.reservation_status;
  v_gown    uuid;
  v_allowed boolean;
begin
  select r.status, r.gown_id into v_current, v_gown
  from public.gown_reservations r
  where r.id = p_reservation_id;

  -- Either it does not exist, or RLS says it does not exist for you. Same answer either way.
  if not found then
    raise exception 'reservation_not_found';
  end if;

  v_allowed := case v_current
    when 'held'::public.reservation_status then
      p_status in ('confirmed'::public.reservation_status, 'cancelled'::public.reservation_status)
    when 'confirmed'::public.reservation_status then
      p_status in ('returned'::public.reservation_status, 'cancelled'::public.reservation_status)
    else false
  end;

  if not v_allowed then
    raise exception 'reservation_invalid_transition'
      using hint = format('%s -> %s', v_current, p_status);
  end if;

  update public.gown_reservations
     set status = p_status,
         notes = case
           when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
           else concat_ws(E'\n', notes, btrim(p_reason))
         end
   where id = p_reservation_id;

  if not found then
    raise exception 'reservation_forbidden';
  end if;

  /*
   * A returned gown is physically back and has been worn. Moving it to `cleaning` is the one
   * state change that follows from a fact rather than a policy — and it is one click to move it
   * back to `available` once it is done, because how long cleaning takes is not known (§6).
   */
  if p_status = 'returned'::public.reservation_status then
    perform set_config('ns.gown_state_reason', 'return', true);
    update public.gowns
       set state = 'cleaning'::public.gown_state
     where id = v_gown and state = 'rented'::public.gown_state;
  end if;

  return p_status;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- set_gown_state
--
-- The physical condition of a dress, which is not the same question as whether it is reserved.
-- A gown can be booked for June and sitting on the rail today; it can also be in repair with no
-- reservation against it at all. Occupancy is derived from `gown_reservations`; this column is
-- what the sisters can see when they look at the rail.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.set_gown_state(
  p_gown_id uuid,
  p_state public.gown_state,
  p_reason text default null
)
returns public.gown_state
language plpgsql
set search_path = ''
as $$
begin
  -- Read by the trigger that writes gown_status_log. Transaction-local.
  perform set_config('ns.gown_state_reason', coalesce(btrim(p_reason), ''), true);

  update public.gowns
     set state = p_state
   where id = p_gown_id;

  -- No row updated means RLS refused it: only an owner writes the atelier.
  if not found then
    raise exception 'gown_forbidden';
  end if;

  return p_state;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- gown_utilisation
--
-- §13 asks for utilisation per gown. Aggregated in Postgres rather than by pulling every
-- reservation into Node: the console shows one number per dress, and the console should not
-- need to see every bride's booking to compute it.
--
-- Overlapping ranges are clipped to the window, so a reservation running from before p_from to
-- after p_to counts the window's length and not its own.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.gown_utilisation(p_from date, p_to date)
returns table (
  gown_id uuid,
  slug text,
  name text,
  state public.gown_state,
  days_reserved integer,
  reservation_count integer
)
language sql
stable
set search_path = ''
as $$
  select
    g.id,
    g.slug,
    g.name,
    g.state,
    /*
     * The `filter` is not tidiness — it is the correctness of the whole function.
     *
     * `least` and `greatest` in Postgres *skip* null arguments rather than returning null. On the
     * unmatched side of the left join, `least(upper(null_period), p_to + 1)` therefore quietly
     * returns p_to + 1, and a gown nobody has reserved reports the entire window as booked. The
     * filter drops those rows before they reach the sum, so an idle dress reads as idle.
     */
    coalesce(sum(
      greatest(
        0,
        least(upper(r.period), (p_to + 1)) - greatest(lower(r.period), p_from)
      )
    ) filter (where r.id is not null), 0)::integer,
    count(r.id)::integer
  from public.gowns g
  left join public.gown_reservations r
    on r.gown_id = g.id
   and r.status in ('held'::public.reservation_status, 'confirmed'::public.reservation_status)
   and r.period && daterange(p_from, (p_to + 1)::date, '[)')
  where g.is_active
  group by g.id, g.slug, g.name, g.state, g.sort_order
  order by g.sort_order, g.name
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Grants
--
-- Postgres grants EXECUTE to PUBLIC by default, which would put every one of these on the
-- anonymous API surface. RLS would still refuse the writes, but an anonymous caller should not
-- be able to reach the atelier's functions at all — revoke first, then grant narrowly.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

revoke execute on function
  public.reserve_gown(text, text, text, date, date, smallint, public.reservation_status, bigint, text, text[]),
  public.set_reservation_status(uuid, public.reservation_status, text),
  public.set_gown_state(uuid, public.gown_state, text),
  public.gown_utilisation(date, date)
  from public;

grant execute on function
  public.reserve_gown(text, text, text, date, date, smallint, public.reservation_status, bigint, text, text[]),
  public.set_reservation_status(uuid, public.reservation_status, text),
  public.set_gown_state(uuid, public.gown_state, text),
  public.gown_utilisation(date, date)
  to authenticated;
