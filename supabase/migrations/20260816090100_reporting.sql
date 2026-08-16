-- Reporting
--
-- "See and follow the money flow, and which of the three businesses is bringing more money."
--
-- Every function here is SECURITY INVOKER, deliberately. Payments and expenses are owner-only
-- under RLS, so these return nothing to reception rather than quietly widening access — a
-- reporting layer is the classic place a `security definer` leaks the whole ledger.
--
-- All amounts are centimes.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Which business earns
--
-- Three businesses share one address (§1): the salon, the bridal atelier, and Sophie's creator
-- brand. They earn through different tables, so the union is the whole point of this function —
-- without it nobody can answer the question at all.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.revenue_by_line(p_from date, p_to date)
returns table (line text, revenue bigint, transactions integer)
language sql
stable
set search_path = ''
as $$
  with earned as (
    -- Salon, bridal and makeup: money taken against an appointment or a gown reservation.
    select
      coalesce(
        a.line::text,
        case when p.reservation_id is not null then 'bridal' else 'salon' end
      ) as line,
      p.amount
    from public.payments p
    left join public.appointments a on a.id = p.appointment_id
    where p.status = 'paid'
      and coalesce(p.paid_at::date, p.created_at::date) between p_from and p_to

    union all

    -- The creator brand earns through invoiced collaborations, not appointments.
    select 'creator', i.amount
    from public.invoices i
    where i.status = 'paid'
      and coalesce(i.paid_on, i.issued_on) between p_from and p_to
  )
  select line, sum(amount)::bigint, count(*)::int
  from earned
  group by line
  order by 2 desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Money in and out, day by day
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.cash_flow(p_from date, p_to date)
returns table (on_date date, revenue bigint, spend bigint)
language sql
stable
set search_path = ''
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as on_date
  ),
  income as (
    select coalesce(p.paid_at::date, p.created_at::date) as on_date, sum(p.amount) as total
    from public.payments p
    where p.status = 'paid'
      and coalesce(p.paid_at::date, p.created_at::date) between p_from and p_to
    group by 1
  ),
  invoiced as (
    select coalesce(i.paid_on, i.issued_on) as on_date, sum(i.amount) as total
    from public.invoices i
    where i.status = 'paid' and coalesce(i.paid_on, i.issued_on) between p_from and p_to
    group by 1
  ),
  outgoing as (
    select e.incurred_on as on_date, sum(e.amount) as total
    from public.expenses e
    where e.incurred_on between p_from and p_to
    group by 1
  )
  select
    d.on_date,
    (coalesce(income.total, 0) + coalesce(invoiced.total, 0))::bigint,
    coalesce(outgoing.total, 0)::bigint
  from days d
  left join income   on income.on_date = d.on_date
  left join invoiced on invoiced.on_date = d.on_date
  left join outgoing on outgoing.on_date = d.on_date
  order by d.on_date;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Which services actually earn
--
-- Booking count and revenue are different questions: the 200 DA lip wax may be the most booked
-- service in the salon and among the least profitable, and a ranking by either alone hides that.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.service_performance(p_from date, p_to date)
returns table (
  service_slug text,
  service_name text,
  category_name text,
  bookings integer,
  revenue bigint
)
language sql
stable
set search_path = ''
as $$
  select
    s.slug,
    s.name,
    c.name,
    count(*)::int,
    coalesce(sum(aps.price_charged), 0)::bigint
  from public.appointment_services aps
  join public.services s on s.id = aps.service_id
  join public.service_categories c on c.id = s.category_id
  join public.appointments a on a.id = aps.appointment_id
  where a.status in ('confirmed', 'completed')
    and coalesce(lower(a.period)::date, a.requested_start::date) between p_from and p_to
  group by s.slug, s.name, c.name
  order by 5 desc, 4 desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Where the money goes
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.expense_summary(p_from date, p_to date)
returns table (category text, line text, total bigint, entries integer)
language sql
stable
set search_path = ''
as $$
  select
    e.category::text,
    -- Null line means shared: rent belongs to the business, not to hair.
    coalesce(e.line::text, 'shared'),
    sum(e.amount)::bigint,
    count(*)::int
  from public.expenses e
  where e.incurred_on between p_from and p_to
  group by 1, 2
  order by 3 desc;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- What is running out
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.stock_alerts()
returns table (
  product_id uuid,
  slug text,
  name text,
  line text,
  unit text,
  on_hand numeric,
  reorder_level numeric
)
language sql
stable
set search_path = ''
as $$
  select
    ps.product_id, ps.slug, ps.name, ps.line::text, ps.unit::text, ps.on_hand, ps.reorder_level
  from public.product_stock ps
  where ps.is_active and ps.needs_reorder
  order by (ps.on_hand - ps.reorder_level), ps.name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- What the console still does not know
--
-- The unknowns are not a footnote; they are the reason most bookings are requests rather than
-- appointments. Surfacing the counts turns "we are waiting on Nour and Sophie" into a number
-- that goes down as they fill things in.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.data_gaps()
returns table (gap text, missing integer)
language sql
stable
set search_path = ''
as $$
  select 'service_duration', count(*)::int
    from public.services where is_active and duration_minutes is null
  union all
  select 'service_price', count(*)::int
    from public.services where is_active and kind <> 'free' and price_min is null
  union all
  select 'opening_hours', case when exists (select 1 from public.business_hours) then 0 else 1 end
  union all
  select 'gown_rental_price', count(*)::int
    from public.gowns where is_active and rental_price is null
  union all
  select 'product_cost', count(*)::int
    from public.products where is_active and unit_cost is null;
$$;

grant execute on function
  public.revenue_by_line(date, date),
  public.cash_flow(date, date),
  public.service_performance(date, date),
  public.expense_summary(date, date),
  public.stock_alerts(),
  public.data_gaps()
  to authenticated;
