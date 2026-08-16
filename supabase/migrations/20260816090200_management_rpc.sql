-- Management write paths
--
-- Everything the sisters can now change: the tariff, opening hours, products, stock, spending.
--
-- None of these is `security definer`, deliberately — the same reasoning as the atelier's
-- functions. The caller is a signed-in owner, RLS already refuses anyone else, and a definer
-- function here would hand reception the owner's permissions while leaving the policies looking
-- correct. `book_appointment` is definer only because its caller is `anon`, which has no policy
-- to run under at all.
--
-- They raise named exceptions so the console can say what went wrong in the brand's voice
-- rather than surfacing a constraint name.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The tariff
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_service(
  p_slug text,
  p_category_slug text,
  p_name text,
  p_kind text,
  p_price_min bigint,
  p_price_max bigint,
  p_duration_minutes integer,
  p_buffer_minutes integer default 0,
  p_is_active boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant   uuid := public.auth_tenant_id();
  v_category uuid;
  v_id       uuid;
begin
  if v_tenant is null then raise exception 'service_forbidden'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'service_invalid_name'; end if;

  select id into v_category from public.service_categories
    where tenant_id = v_tenant and slug = p_category_slug;
  if not found then raise exception 'service_unknown_category'; end if;

  /*
   * The price shape is checked here as well as by the table constraint. The constraint is the
   * guarantee; this is so the console can say "a range needs an upper bound" instead of
   * "services_price_shape".
   */
  if p_kind = 'range' and (p_price_min is null or p_price_max is null or p_price_min >= p_price_max) then
    raise exception 'service_invalid_range';
  end if;
  if p_kind <> 'free' and p_price_min is null then
    raise exception 'service_price_required';
  end if;
  if p_kind = 'free' and (p_price_min is not null or p_price_max is not null) then
    raise exception 'service_free_has_price';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'service_invalid_duration';
  end if;

  insert into public.services as s (
    tenant_id, category_id, slug, name, kind, price_min, price_max,
    duration_minutes, buffer_minutes, is_active
  )
  values (
    v_tenant, v_category, p_slug, btrim(p_name), p_kind::public.price_kind,
    p_price_min, case when p_kind = 'range' then p_price_max else null end,
    p_duration_minutes, coalesce(p_buffer_minutes, 0), p_is_active
  )
  on conflict (tenant_id, slug) do update set
    category_id      = excluded.category_id,
    name             = excluded.name,
    kind             = excluded.kind,
    price_min        = excluded.price_min,
    price_max        = excluded.price_max,
    duration_minutes = excluded.duration_minutes,
    buffer_minutes   = excluded.buffer_minutes,
    is_active        = excluded.is_active
  returning s.id into v_id;

  return v_id;
end;
$$;

/*
 * Archive rather than delete.
 *
 * A service that has been booked is referenced by appointment_services, and those rows are the
 * record of what a client was actually charged. Deleting the service would either fail on the
 * foreign key or rewrite history; `is_active = false` takes it off the tariff and leaves the
 * past intact.
 */
create or replace function public.archive_service(p_slug text, p_archived boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null then raise exception 'service_forbidden'; end if;
  update public.services set is_active = not p_archived
    where tenant_id = v_tenant and slug = p_slug;
  if not found then raise exception 'service_not_found'; end if;
end;
$$;

create or replace function public.upsert_category(
  p_slug text,
  p_name text,
  p_sort_order smallint default 0,
  p_is_active boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_id uuid;
begin
  if v_tenant is null then raise exception 'category_forbidden'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'category_invalid_name'; end if;

  insert into public.service_categories as c (tenant_id, slug, name, sort_order, is_active)
  values (v_tenant, p_slug, btrim(p_name), coalesce(p_sort_order, 0), p_is_active)
  on conflict (tenant_id, slug) do update set
    name = excluded.name, sort_order = excluded.sort_order, is_active = excluded.is_active
  returning c.id into v_id;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Opening hours
--
-- Replaces the whole week in one transaction. A partial update is how a salon ends up open on a
-- day it is shut, and the availability engine reads this table as the truth.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.set_business_hours(p_days jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_tenant   uuid := public.auth_tenant_id();
  v_location uuid;
  v_day      jsonb;
  v_count    integer := 0;
begin
  if v_tenant is null then raise exception 'hours_forbidden'; end if;

  select id into v_location from public.locations where tenant_id = v_tenant order by created_at limit 1;
  if not found then raise exception 'hours_no_location'; end if;

  if jsonb_typeof(p_days) <> 'array' then raise exception 'hours_invalid'; end if;

  delete from public.business_hours where location_id = v_location;

  for v_day in select * from jsonb_array_elements(p_days)
  loop
    if (v_day ->> 'is_closed')::boolean is not true then
      if (v_day ->> 'opens_at') is null or (v_day ->> 'closes_at') is null then
        raise exception 'hours_incomplete';
      end if;
      if (v_day ->> 'opens_at')::time >= (v_day ->> 'closes_at')::time then
        raise exception 'hours_backwards';
      end if;
    end if;

    insert into public.business_hours (tenant_id, location_id, weekday, opens_at, closes_at, is_closed)
    values (
      v_tenant,
      v_location,
      (v_day ->> 'weekday')::smallint,
      nullif(v_day ->> 'opens_at', '')::time,
      nullif(v_day ->> 'closes_at', '')::time,
      coalesce((v_day ->> 'is_closed')::boolean, false)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Products and stock
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.upsert_product(
  p_slug text,
  p_name text,
  p_brand text default null,
  p_line text default null,
  p_unit text default 'piece',
  p_unit_cost bigint default null,
  p_reorder_level numeric default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_id uuid;
begin
  if v_tenant is null then raise exception 'product_forbidden'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'product_invalid_name'; end if;
  if p_unit_cost is not null and p_unit_cost < 0 then raise exception 'product_invalid_cost'; end if;

  insert into public.products as p (
    tenant_id, slug, name, brand, line, unit, unit_cost, reorder_level, is_active
  )
  values (
    v_tenant, p_slug, btrim(p_name), nullif(btrim(coalesce(p_brand, '')), ''),
    nullif(p_line, '')::public.business_line, p_unit::public.product_unit,
    p_unit_cost, p_reorder_level, p_is_active
  )
  on conflict (tenant_id, slug) do update set
    name = excluded.name, brand = excluded.brand, line = excluded.line, unit = excluded.unit,
    unit_cost = excluded.unit_cost, reorder_level = excluded.reorder_level,
    is_active = excluded.is_active
  returning p.id into v_id;

  return v_id;
end;
$$;

/*
 * Records a movement, and — for a delivery with a cost — the expense that paid for it.
 *
 * Both in one transaction, linked by `expenses.stock_movement_id`, so restocking cannot show up
 * in the stock history without also showing up in the money going out. That link is unique, so
 * the same delivery can never be counted twice.
 */
create or replace function public.record_stock_movement(
  p_product_slug text,
  p_quantity numeric,
  p_reason text,
  p_total_cost bigint default null,
  p_note text default null,
  p_occurred_on date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant  uuid := public.auth_tenant_id();
  v_product public.products%rowtype;
  v_id      uuid;
  v_on      date := coalesce(p_occurred_on, (now() at time zone 'Africa/Algiers')::date);
begin
  if v_tenant is null then raise exception 'stock_forbidden'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'stock_invalid_quantity'; end if;

  select * into v_product from public.products
    where tenant_id = v_tenant and slug = p_product_slug;
  if not found then raise exception 'stock_unknown_product'; end if;

  insert into public.stock_movements (
    tenant_id, product_id, quantity, reason, total_cost, note, recorded_by, occurred_on
  )
  values (
    v_tenant, v_product.id, p_quantity, p_reason::public.stock_reason,
    p_total_cost, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()), v_on
  )
  returning id into v_id;

  if p_reason = 'delivery' and coalesce(p_total_cost, 0) > 0 then
    insert into public.expenses (
      tenant_id, category, line, label, amount, stock_movement_id, incurred_on, recorded_by
    )
    values (
      v_tenant, 'stock', v_product.line, v_product.name, p_total_cost, v_id, v_on,
      (select auth.uid())
    );
  end if;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Spending
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.record_expense(
  p_category text,
  p_label text,
  p_amount bigint,
  p_incurred_on date,
  p_line text default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_id uuid;
begin
  if v_tenant is null then raise exception 'expense_forbidden'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'expense_invalid_label'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'expense_invalid_amount'; end if;
  if p_incurred_on is null then raise exception 'expense_invalid_date'; end if;

  insert into public.expenses (
    tenant_id, category, line, label, amount, incurred_on, note, recorded_by
  )
  values (
    v_tenant, p_category::public.expense_category, nullif(p_line, '')::public.business_line,
    btrim(p_label), p_amount, p_incurred_on, nullif(btrim(coalesce(p_note, '')), ''),
    (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function
  public.upsert_service(text, text, text, text, bigint, bigint, integer, integer, boolean),
  public.archive_service(text, boolean),
  public.upsert_category(text, text, smallint, boolean),
  public.set_business_hours(jsonb),
  public.upsert_product(text, text, text, text, text, bigint, numeric, boolean),
  public.record_stock_movement(text, numeric, text, bigint, text, date),
  public.record_expense(text, text, bigint, date, text, text)
  to authenticated;
