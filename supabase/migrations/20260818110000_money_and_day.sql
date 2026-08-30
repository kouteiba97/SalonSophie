-- Recording the day and the money that comes with it
--
-- `payments` and `invoices` have been read-only since Phase 2: `/finances` reads them and nothing
-- ever wrote one. A salon could complete a hundred appointments and the revenue screen would still
-- say 0 DA — a reporting layer over a table nobody fills. This closes that.
--
-- It also settles the question the RLS migration deferred in a comment: "Reception takes payments
-- in person; recording them is Phase 4's decision."

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Reception may record a payment, but not read the ledger
--
-- The same shape as stock: whoever is at the desk takes the cash, so they must be able to write
-- it down — but the totals, the comparison between the three businesses, and every other client's
-- history stay owner-only. Insert is not select, and RLS is happy to grant one without the other.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create policy payments_front_desk_insert on public.payments
  for insert to authenticated
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

/*
 * Takes the money against an appointment, in one place so it cannot be recorded twice.
 *
 * The amount is passed rather than read from the tariff on purpose: most of the published prices
 * are ranges and floors ("14 000 – 35 000", "à partir de 16 000"), so what a client actually paid
 * is settled at the chair and is not derivable from the service. Guessing it from `price_min`
 * would under-report every range in the book.
 */
create or replace function public.record_payment(
  p_appointment_id uuid,
  p_amount bigint,
  p_method text default 'cash',
  p_paid_at timestamptz default null
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_client uuid;
  v_id     uuid := gen_random_uuid();
begin
  if v_tenant is null then raise exception 'payment_forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'payment_invalid_amount'; end if;

  select a.client_id into v_client
  from public.appointments a
  where a.id = p_appointment_id and a.tenant_id = v_tenant;

  if not found then raise exception 'payment_unknown_appointment'; end if;

  /*
   * The id is generated above and inserted, rather than read back with RETURNING.
   *
   * `INSERT ... RETURNING` makes Postgres apply the *SELECT* policies to the new row, and
   * reception deliberately has none on `payments`: they take the cash and write it down, they do
   * not get the ledger. So the obvious spelling fails with "new row violates row-level security
   * policy" — which reads like the insert was refused, when what was refused was reading it back.
   * That cost an hour to find, because every check on the write path looked correct.
   */
  insert into public.payments (
    id, tenant_id, client_id, appointment_id, amount, method, status, paid_at
  )
  values (
    v_id, v_tenant, v_client, p_appointment_id, p_amount,
    coalesce(nullif(p_method, ''), 'cash')::public.payment_method,
    'paid'::public.payment_status,
    coalesce(p_paid_at, now())
  );

  /*
   * What was actually charged belongs on the booked service too, so `service_performance` stops
   * reporting the tariff floor and starts reporting the till. Only filled when it is still blank —
   * a correction made by hand should not be silently overwritten by the next payment.
   */
  update public.appointment_services
     set price_charged = p_amount
   where appointment_id = p_appointment_id
     and price_charged is null
     and id = (
       select id from public.appointment_services
        where appointment_id = p_appointment_id order by created_at limit 1
     );

  return v_id;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Moving an appointment through its day
--
-- SECURITY INVOKER, so the policies decide: `appointments_front_desk_write` gives owner and
-- reception any appointment, `appointments_stylist_update` gives a stylist their own and no one
-- else's. A definer function here would hand a stylist the run of the book.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.set_appointment_status(p_appointment_id uuid, p_status text)
returns text
language plpgsql
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null then raise exception 'appointment_forbidden'; end if;

  if p_status not in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') then
    raise exception 'appointment_invalid_status';
  end if;

  update public.appointments
     set status = p_status::public.appointment_status
   where id = p_appointment_id and tenant_id = v_tenant;

  -- RLS refuses by matching no row rather than raising, so "not found" is the refusal.
  if not found then raise exception 'appointment_forbidden'; end if;

  return p_status;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The creator brand's money
--
-- A collaboration only reaches `revenue_by_line` through a paid invoice — that is how the brand
-- line earns, since it has no appointments. Without these two functions the brand column on the
-- finances screen could only ever read zero.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.record_invoice(
  p_deal_id uuid,
  p_amount bigint,
  p_issued_on date default null,
  p_reference text default null
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_ref    text;
  v_id     uuid;
begin
  if v_tenant is null or not public.is_owner() then raise exception 'invoice_forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invoice_invalid_amount'; end if;

  if p_deal_id is not null then
    perform 1 from public.brand_deals where id = p_deal_id and tenant_id = v_tenant;
    if not found then raise exception 'invoice_unknown_deal'; end if;
  end if;

  v_ref := coalesce(
    nullif(btrim(coalesce(p_reference, '')), ''),
    'F' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
  );

  insert into public.invoices (tenant_id, deal_id, reference, amount, status, issued_on)
  values (
    v_tenant, p_deal_id, v_ref, p_amount,
    'pending'::public.payment_status,
    coalesce(p_issued_on, (now() at time zone 'Africa/Algiers')::date)
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

create or replace function public.set_invoice_paid(p_invoice_id uuid, p_paid_on date default null)
returns void
language plpgsql
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.is_owner() then raise exception 'invoice_forbidden'; end if;

  update public.invoices
     set status = 'paid'::public.payment_status,
         paid_on = coalesce(p_paid_on, (now() at time zone 'Africa/Algiers')::date)
   where id = p_invoice_id and tenant_id = v_tenant;

  if not found then raise exception 'invoice_not_found'; end if;
end;
$fn$;

/** Editing a collaboration after it is created — value agreed, contact, what happens next. */
create or replace function public.update_deal(
  p_deal_id uuid,
  p_brand_name text,
  p_value_amount bigint default null,
  p_contact_name text default null,
  p_contact_handle text default null,
  p_next_action text default null,
  p_next_action_due date default null
)
returns void
language plpgsql
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.is_owner() then raise exception 'deal_forbidden'; end if;
  if coalesce(btrim(p_brand_name), '') = '' then raise exception 'deal_invalid_name'; end if;

  update public.brand_deals
     set brand_name     = btrim(p_brand_name),
         value_amount   = p_value_amount,
         contact_name   = nullif(btrim(coalesce(p_contact_name, '')), ''),
         contact_handle = nullif(btrim(coalesce(p_contact_handle, '')), ''),
         next_action    = nullif(btrim(coalesce(p_next_action, '')), ''),
         next_action_due = p_next_action_due
   where id = p_deal_id and tenant_id = v_tenant;

  if not found then raise exception 'deal_not_found'; end if;
end;
$fn$;

revoke execute on function
  public.record_payment(uuid, bigint, text, timestamptz),
  public.set_appointment_status(uuid, text),
  public.record_invoice(uuid, bigint, date, text),
  public.set_invoice_paid(uuid, date),
  public.update_deal(uuid, text, bigint, text, text, text, date)
  from public, anon;

grant execute on function
  public.record_payment(uuid, bigint, text, timestamptz),
  public.set_appointment_status(uuid, text),
  public.record_invoice(uuid, bigint, date, text),
  public.set_invoice_paid(uuid, date),
  public.update_deal(uuid, text, bigint, text, text, text, date)
  to authenticated;
