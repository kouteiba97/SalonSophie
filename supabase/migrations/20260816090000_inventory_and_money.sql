-- Products, stock and the other half of the money
--
-- Phase 7. Three things the brief never named but the business plainly has: the products a
-- salon consumes doing the work, the stock of them, and the money going out as well as in.
--
-- Money stays integers in centimes throughout (§7). Every table follows the standard column
-- set, gets RLS, and the ones that move money get an audit trigger — the same rules as the rest
-- of the schema, because a table added later is exactly the one that quietly ends up unprotected.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Suppliers
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Products
--
-- A product is a thing on a shelf: colour, shampoo, gel, wax, a box of lash adhesive. Quantity
-- is deliberately NOT a column here — it is derived from stock_movements, so the number on the
-- screen and the history that explains it can never disagree. A stored counter and a movement
-- log drift the first time anything fails halfway.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create type public.product_unit as enum ('piece', 'ml', 'l', 'g', 'kg', 'application');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  slug text not null,
  name text not null,
  brand text,
  -- Which side of the business consumes it. Null means shared across all three.
  line public.business_line,
  unit public.product_unit not null default 'piece',
  /*
   * What a unit costs to buy, in centimes. Null when nobody has told us — the same rule the
   * tariff follows. A zero here would quietly report 100% margin.
   */
  unit_cost bigint check (unit_cost is null or unit_cost >= 0),
  -- Warn below this. Null means no threshold has been set rather than "never warn".
  reorder_level numeric(12, 2) check (reorder_level is null or reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index products_tenant_idx on public.products (tenant_id) where is_active;
create index products_line_idx on public.products (tenant_id, line);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Stock movements
--
-- Every change in quantity is a row, signed: a delivery is positive, use is negative, a stock
-- count correction is whatever makes the books true. The current level is the sum. That makes
-- "why is there only one box left" answerable, which a bare counter never is.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create type public.stock_reason as enum ('delivery', 'usage', 'correction', 'loss', 'return');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  -- Signed. Negative takes stock off the shelf.
  quantity numeric(12, 2) not null check (quantity <> 0),
  reason public.stock_reason not null,
  -- What it was used on, when that is known. Lets a service's real product cost be traced.
  appointment_id uuid references public.appointments(id) on delete set null,
  -- What the delivery cost in total, in centimes. Only meaningful for a delivery.
  total_cost bigint check (total_cost is null or total_cost >= 0),
  note text,
  recorded_by uuid references public.users(id) on delete set null,
  occurred_on date not null default (now() at time zone 'Africa/Algiers')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A delivery adds, usage and loss remove. Enforced so the sign cannot contradict the reason.
  constraint stock_movements_sign_matches_reason check (
    case reason
      when 'delivery' then quantity > 0
      when 'return'   then quantity > 0
      when 'usage'    then quantity < 0
      when 'loss'     then quantity < 0
      else true -- a correction may go either way
    end
  )
);

create index stock_movements_product_idx on public.stock_movements (product_id, occurred_on desc);
create index stock_movements_tenant_date_idx on public.stock_movements (tenant_id, occurred_on desc);
create trigger stock_movements_touch before update on public.stock_movements
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Expenses
--
-- Without these, "which business earns most" is only half a sentence. Rent and electricity are
-- shared and belong to no single line, which is why `line` is nullable rather than defaulted to
-- salon — attributing the rent to hair would make the bridal line look better than it is.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create type public.expense_category as enum (
  'stock', 'rent', 'utilities', 'salary', 'marketing', 'equipment', 'maintenance', 'other'
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category public.expense_category not null,
  -- Null means shared across the business rather than belonging to one line.
  line public.business_line,
  label text not null,
  amount bigint not null check (amount >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  -- Set when the expense was generated by a stock delivery, so it is never double counted.
  stock_movement_id uuid unique references public.stock_movements(id) on delete set null,
  incurred_on date not null,
  note text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_tenant_date_idx on public.expenses (tenant_id, incurred_on desc);
create index expenses_line_idx on public.expenses (tenant_id, line, incurred_on desc);
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- Money moving is money moving: the same audit rule as payments and deposits (§12.9).
create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function public.write_audit_log();

create trigger stock_movements_audit
  after insert or update or delete on public.stock_movements
  for each row execute function public.write_audit_log();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Current stock, derived
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace view public.product_stock as
  select
    p.id            as product_id,
    p.tenant_id,
    p.slug,
    p.name,
    p.brand,
    p.line,
    p.unit,
    p.unit_cost,
    p.reorder_level,
    p.is_active,
    coalesce(sum(m.quantity), 0)::numeric(12, 2) as on_hand,
    -- Null threshold means nobody set one, which is not the same as "stock is fine".
    case
      when p.reorder_level is null then false
      else coalesce(sum(m.quantity), 0) <= p.reorder_level
    end as needs_reorder,
    max(m.occurred_on) as last_movement_on
  from public.products p
  left join public.stock_movements m on m.product_id = p.id
  group by p.id;

-- The view runs as the caller, so the RLS on products and stock_movements still applies.
alter view public.product_stock set (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Stock and money are the owner's business. Reception records usage — they are the ones who
-- notice a bottle running out — so they may write movements, but not change what a product
-- costs or what the business spends.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'products', 'stock_movements', 'expenses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

create policy suppliers_owner_all on public.suppliers
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy products_front_desk_read on public.products
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

create policy products_owner_write on public.products
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy stock_movements_front_desk_read on public.stock_movements
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

-- Reception may record what was used or delivered; only an owner may rewrite history.
create policy stock_movements_front_desk_insert on public.stock_movements
  for insert to authenticated with check (public.is_front_desk() and public.same_tenant(tenant_id));

create policy stock_movements_owner_write on public.stock_movements
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy expenses_owner_all on public.expenses
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- Grants: the API roles need the table privilege before RLS can narrow it. Nothing here is
-- public — `anon` gets nothing at all, unlike the catalogue.
grant select, insert, update, delete on public.suppliers, public.products, public.stock_movements, public.expenses to authenticated;
grant select on public.product_stock to authenticated;
revoke all on public.suppliers, public.products, public.stock_movements, public.expenses from anon;
