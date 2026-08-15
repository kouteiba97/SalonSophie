-- Core: tenancy, locations, hours, people
--
-- Standard columns on every table (BUILD_BRIEF §7): id uuid pk, tenant_id uuid, created_at,
-- updated_at. There is one tenant today; the column exists so a second location is a row, not
-- a rewrite.

-- ── updated_at ───────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── tenants ──────────────────────────────────────────────────────────────────────────────────
-- Not named in §7's list, but tenant_id is on every table and a uuid needs something to
-- reference. One row today: The Sisters N&S.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();

-- ── locations ────────────────────────────────────────────────────────────────────────────────
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  street text,
  landmark text,
  city text not null default 'Constantine',
  country char(2) not null default 'DZ',
  phone text,
  -- Latitude/longitude are deliberately nullable and unset: they were never surveyed, and a
  -- wrong pin sends a bride to the wrong side of Ali Mendjeli (§6, unknown data).
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_tenant_idx on public.locations (tenant_id);
create trigger locations_touch before update on public.locations
  for each row execute function public.touch_updated_at();

-- ── business_hours ───────────────────────────────────────────────────────────────────────────
-- §5.3 item 7: the design hardcoded `d.getDay()===5` to close Fridays. Which days the salon
-- closes is data, not a constant in a calendar widget — and it is currently unknown, so this
-- table ships empty rather than seeded with a guess.
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay().
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, weekday),
  -- An open day needs both ends, and they must be the right way round.
  constraint business_hours_range_valid check (
    is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create trigger business_hours_touch before update on public.business_hours
  for each row execute function public.touch_updated_at();

-- Exception dates: public holidays, a wedding the sisters are working, an unplanned closure.
create table public.business_hour_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  on_date date not null,
  opens_at time,
  closes_at time,
  is_closed boolean not null default true,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, on_date)
);

create trigger business_hour_exceptions_touch before update on public.business_hour_exceptions
  for each row execute function public.touch_updated_at();

-- ── roles ────────────────────────────────────────────────────────────────────────────────────
-- Three roles (§7). Kept as a table so a policy can join it and a fourth role is a row.
create table public.roles (
  key text primary key,
  label text not null
);

insert into public.roles (key, label) values
  ('owner', 'Propriétaire'),
  ('reception', 'Réception'),
  ('stylist', 'Styliste')
on conflict (key) do nothing;

-- ── users ────────────────────────────────────────────────────────────────────────────────────
-- Mirrors auth.users. The id IS the Supabase auth id, so policies can compare against
-- auth.uid() without a join.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_key text not null references public.roles(key),
  full_name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_tenant_idx on public.users (tenant_id);
create index users_role_idx on public.users (role_key);
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ── staff ────────────────────────────────────────────────────────────────────────────────────
-- The bookable people. A staff row may exist without a login (someone who does not use the
-- console), which is why user_id is nullable.
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  user_id uuid unique references public.users(id) on delete set null,
  display_name text not null,
  slug text not null,
  -- Free text, e.g. "Coiffure & mariée". Not a claim about qualifications.
  specialty text,
  is_bookable boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index staff_tenant_idx on public.staff (tenant_id);
create trigger staff_touch before update on public.staff
  for each row execute function public.touch_updated_at();

-- ── staff_schedules ──────────────────────────────────────────────────────────────────────────
-- Recurring weekly availability. Phase 3's availability engine reads this, existing
-- appointments, staff_time_off and the service's real duration — never a string hash.
create table public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_schedules_range_valid check (starts_at < ends_at)
);

create index staff_schedules_staff_idx on public.staff_schedules (staff_id, weekday);
create trigger staff_schedules_touch before update on public.staff_schedules
  for each row execute function public.touch_updated_at();

-- ── staff_time_off ───────────────────────────────────────────────────────────────────────────
create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  period tstzrange not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One person cannot be off twice over the same hours; overlapping leave is a data entry error.
  exclude using gist (staff_id with =, period with &&)
);

create index staff_time_off_staff_idx on public.staff_time_off (staff_id);
create trigger staff_time_off_touch before update on public.staff_time_off
  for each row execute function public.touch_updated_at();
