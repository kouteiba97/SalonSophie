-- Bridal atelier: gowns, reservations, accessories, money
--
-- This file carries non-negotiable #1. An appointment is a point in time; a gown rental is an
-- interval, and one physical gown cannot be out twice at once. A double-booking is discovered
-- on the wedding day and cannot be fixed, so it is prevented by Postgres, not by application
-- code that races.

-- Four states, not two (§7). A gown in cleaning neither earns nor books.
create type public.gown_state as enum ('available', 'rented', 'cleaning', 'repair');

create type public.gown_tier as enum ('Essential', 'Signature', 'Couture');

create table public.gowns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  tier public.gown_tier not null,
  silhouette text,
  state public.gown_state not null default 'available',
  -- Displayed on every card: §6 calls it the most frequently asked question.
  size_min smallint not null check (size_min between 30 and 70),
  size_max smallint not null check (size_max between 30 and 70),
  /*
   * Rental price is unknown (§6) and stays null until supplied. The design invented
   * 38 000 / 45 000 / 55 000 DA; those are not reproduced. Null renders "Sur devis".
   */
  rental_price bigint check (rental_price is null or rental_price >= 0),
  image_id text,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  constraint gowns_size_range_valid check (size_min <= size_max)
);

create index gowns_tenant_idx on public.gowns (tenant_id);
create trigger gowns_touch before update on public.gowns
  for each row execute function public.touch_updated_at();

-- The discrete sizes a gown actually exists in — a gown may skip a size, so a min/max pair
-- alone would overpromise.
create table public.gown_sizes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gown_id uuid not null references public.gowns(id) on delete cascade,
  size smallint not null check (size between 30 and 70),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gown_id, size)
);

create trigger gown_sizes_touch before update on public.gown_sizes
  for each row execute function public.touch_updated_at();

create type public.reservation_status as enum ('held', 'confirmed', 'returned', 'cancelled');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The constraint that matters most
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table public.gown_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gown_id uuid not null references public.gowns(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  /*
   * Cleaning buffer days live INSIDE this range (§7). The gown is genuinely unavailable while
   * it is being cleaned, so the range a bride occupies is the range the constraint must see —
   * keeping the buffer outside it would let the next reservation start the morning the dress
   * comes back dirty.
   *
   * daterange is half-open: [2026-09-01, 2026-09-06) covers the 1st through the 5th, so an
   * adjacent reservation may legitimately start on the 6th.
   */
  period daterange not null,
  -- Recorded for transparency; the days are already included in `period`.
  cleaning_buffer_days smallint not null default 0 check (cleaning_buffer_days >= 0),
  status public.reservation_status not null default 'confirmed',
  deposit_amount bigint check (deposit_amount is null or deposit_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gown_reservations_period_not_empty check (not isempty(period)),

  /*
   * NON-NEGOTIABLE #1 — gown double-booking impossible at the database level.
   *
   * A GiST index over (gown_id =, period &&) rejects any second row for the same gown whose
   * dates overlap. btree_gist supplies the equality operator class for uuid; without it these
   * two operators cannot share one index.
   *
   * The WHERE clause is what makes the four states work: only 'held' and 'confirmed' occupy
   * the gown. A 'returned' or 'cancelled' reservation releases those dates immediately.
   */
  constraint gown_reservations_no_overlap
    exclude using gist (gown_id with =, period with &&)
    where (status in ('held', 'confirmed'))
);

create index gown_reservations_tenant_idx on public.gown_reservations (tenant_id);
create index gown_reservations_gown_idx on public.gown_reservations (gown_id);
create index gown_reservations_client_idx on public.gown_reservations (client_id);
create trigger gown_reservations_touch before update on public.gown_reservations
  for each row execute function public.touch_updated_at();

-- Every state transition is logged (§7), so utilisation and disputes both have a record.
create table public.gown_status_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gown_id uuid not null references public.gowns(id) on delete cascade,
  from_state public.gown_state,
  to_state public.gown_state not null,
  changed_by uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index gown_status_log_gown_idx on public.gown_status_log (gown_id, created_at desc);

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

  insert into public.gown_status_log (tenant_id, gown_id, from_state, to_state, changed_by)
  values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.state else null end,
    new.state,
    auth.uid()
  );
  return new;
end;
$$;

create trigger gowns_log_state
  after insert or update of state on public.gowns
  for each row execute function public.log_gown_state_change();

-- ── accessories ──────────────────────────────────────────────────────────────────────────────
-- Barnous, diadème, veil (§6): separate stock, rentable alongside a gown.
create table public.accessories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  stock_total integer not null default 0 check (stock_total >= 0),
  rental_price bigint check (rental_price is null or rental_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create trigger accessories_touch before update on public.accessories
  for each row execute function public.touch_updated_at();

create table public.accessory_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  accessory_id uuid not null references public.accessories(id) on delete restrict,
  reservation_id uuid references public.gown_reservations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  period daterange not null,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accessory_loans_accessory_idx on public.accessory_loans (accessory_id);
create trigger accessory_loans_touch before update on public.accessory_loans
  for each row execute function public.touch_updated_at();

-- ── contracts, deposits, payments ────────────────────────────────────────────────────────────
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid not null references public.gown_reservations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  reference text not null,
  signed_at timestamptz,
  document_path text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference)
);

create trigger contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();

create type public.payment_method as enum ('cash', 'transfer', 'cib', 'edahabia', 'other');
create type public.payment_status as enum ('pending', 'paid', 'refunded', 'failed');

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid references public.gown_reservations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  amount bigint not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A deposit secures something; it cannot float free of both a reservation and an appointment.
  constraint deposits_has_subject check (reservation_id is not null or appointment_id is not null)
);

create trigger deposits_touch before update on public.deposits
  for each row execute function public.touch_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  reservation_id uuid references public.gown_reservations(id) on delete set null,
  amount bigint not null check (amount >= 0),
  method public.payment_method not null default 'cash',
  status public.payment_status not null default 'paid',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_tenant_idx on public.payments (tenant_id);
create index payments_client_idx on public.payments (client_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
