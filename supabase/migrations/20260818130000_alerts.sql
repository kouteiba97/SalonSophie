-- Things somebody needs to look at
--
-- The console can already *derive* several kinds of trouble — stock below its reorder level, an
-- unanswered message, a booking request nobody confirmed. What it could not carry is the kind that
-- only a person standing in the room knows: "we are nearly out of the 7.3", said before any counter
-- says so, by whoever opened the last box.
--
-- Deliberately one small table rather than one per kind. A worker raising a flag and the system
-- noticing a threshold are the same event to whoever has to act on it, and a notification centre
-- assembled from six differently-shaped tables is one nobody finishes building.
--
-- Derived alerts are NOT stored here. Stock below its threshold is a query, and a query cannot go
-- stale; a row copied from it can, and then the console shows a warning about a bottle that was
-- restocked last week. This table holds only what a person said.

create type public.alert_kind as enum ('stock_low', 'equipment', 'other');

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind public.alert_kind not null default 'other',
  /** The product this is about, when it is about one. */
  product_id uuid references public.products(id) on delete set null,
  /** What was said. Free text, because the useful part is usually not in a dropdown. */
  note text,
  raised_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index alerts_open_idx on public.alerts (tenant_id, created_at desc) where resolved_at is null;
create trigger alerts_touch before update on public.alerts
  for each row execute function public.touch_updated_at();

alter table public.alerts enable row level security;
alter table public.alerts force row level security;

/*
 * Anyone signed in may raise one, and see the ones still open.
 *
 * A stylist is exactly the person who notices a product running out, so restricting this to the
 * front desk would remove the only people with the information. Nothing in an alert is client
 * data — it is a product and a sentence about it.
 */
create policy alerts_read on public.alerts
  for select to authenticated using (public.same_tenant(tenant_id));

create policy alerts_insert on public.alerts
  for insert to authenticated with check (public.same_tenant(tenant_id));

/** Resolving is the owner's, so a flag cannot be quietly cleared by whoever finds it annoying. */
create policy alerts_owner_write on public.alerts
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

grant select, insert on public.alerts to authenticated;
grant update, delete on public.alerts to authenticated;
revoke all on public.alerts from anon;

/**
 * Raising a flag.
 *
 * Open flags for the same product are collapsed rather than duplicated: three stylists noticing
 * the same empty shelf on the same morning is one problem, and a list that shows it three times
 * is a list people stop reading.
 */
create or replace function public.raise_alert(
  p_kind text,
  p_product_slug text default null,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = ''
as $fn$
declare
  v_tenant  uuid := public.auth_tenant_id();
  v_product uuid;
  v_id      uuid := gen_random_uuid();
  v_open    uuid;
begin
  if v_tenant is null then raise exception 'alert_forbidden'; end if;

  if p_kind not in ('stock_low', 'equipment', 'other') then
    raise exception 'alert_invalid_kind';
  end if;

  if p_product_slug is not null and btrim(p_product_slug) <> '' then
    select id into v_product from public.products
     where tenant_id = v_tenant and slug = btrim(p_product_slug);
    if not found then raise exception 'alert_unknown_product'; end if;

    select id into v_open from public.alerts
     where tenant_id = v_tenant and product_id = v_product and resolved_at is null
     limit 1;

    if v_open is not null then return v_open; end if;
  end if;

  insert into public.alerts (id, tenant_id, kind, product_id, note, raised_by)
  values (
    v_id, v_tenant, p_kind::public.alert_kind, v_product,
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  );

  return v_id;
end;
$fn$;

create or replace function public.resolve_alert(p_alert_id uuid)
returns void
language plpgsql
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.is_owner() then raise exception 'alert_forbidden'; end if;

  update public.alerts
     set resolved_at = now(), resolved_by = (select auth.uid())
   where id = p_alert_id and tenant_id = v_tenant and resolved_at is null;

  if not found then raise exception 'alert_not_found'; end if;
end;
$fn$;

revoke execute on function
  public.raise_alert(text, text, text), public.resolve_alert(uuid) from public, anon;
grant execute on function
  public.raise_alert(text, text, text), public.resolve_alert(uuid) to authenticated;
