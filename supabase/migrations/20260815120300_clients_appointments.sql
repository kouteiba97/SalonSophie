-- Clients and appointments

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  -- Algerian mobile, stored normalised as typed locally: 0[5-7] then 8 digits (§7).
  phone text not null,
  email text,
  -- §13: a bride flag, because the bridal line asks different questions of the same person.
  is_bride boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_phone_algerian check (phone ~ '^0[5-7][0-9]{8}$'),
  unique (tenant_id, phone)
);

create index clients_tenant_idx on public.clients (tenant_id);
create index clients_name_idx on public.clients (tenant_id, full_name);
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- Colour formulas, allergies, wedding dates (§13). Attributed to an author so the console can
-- show who wrote what.
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes (client_id);
create trigger client_notes_touch before update on public.client_notes
  for each row execute function public.touch_updated_at();

-- The three lanes of the staff console's day-line view (§13).
create type public.business_line as enum ('salon', 'bridal', 'makeup');

create type public.appointment_status as enum (
  'pending', 'confirmed', 'completed', 'cancelled', 'no_show'
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  line public.business_line not null default 'salon',
  status public.appointment_status not null default 'pending',
  /*
   * Stored as a range rather than start+end so the database itself can reject a collision.
   * Timestamps are UTC; Africa/Algiers is a display concern (§7).
   */
  period tstzrange not null,
  /*
   * Choosing a gown books a FITTING, not a rental (§5.3 item 10). A fitting is a point in time
   * and belongs here; the rental is an interval over physical stock and lives in
   * gown_reservations. Conflating them is how a gown gets promised to two brides.
   */
  gown_id uuid,
  notes text,
  reference text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, reference),

  /*
   * Two clients must never take one slot (§5.3 item 9).
   *
   * The brief only requires database-level enforcement for gowns, but the same argument holds
   * here and the mechanism is identical: application-level checks race, this cannot. Cancelled
   * and no-show appointments fall outside the constraint so their slot is released.
   */
  constraint appointments_no_double_booking
    exclude using gist (staff_id with =, period with &&)
    where (status in ('pending', 'confirmed'))
);

create index appointments_tenant_idx on public.appointments (tenant_id);
create index appointments_client_idx on public.appointments (client_id);
create index appointments_staff_period_idx on public.appointments using gist (staff_id, period);
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- One appointment can carry several services. Price and duration are snapshotted at booking
-- time so a later tariff change never rewrites history.
create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  variant_id uuid references public.service_variants(id) on delete set null,
  price_charged bigint check (price_charged is null or price_charged >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointment_services_appt_idx on public.appointment_services (appointment_id);
create trigger appointment_services_touch before update on public.appointment_services
  for each row execute function public.touch_updated_at();
