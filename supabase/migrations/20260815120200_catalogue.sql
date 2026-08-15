-- Catalogue: categories, services, variants
--
-- Money is integers in centimes (BUILD_BRIEF §7). 700 DA is 70000. Never a float, never a
-- number that means "dinars".

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create trigger service_categories_touch before update on public.service_categories
  for each row execute function public.touch_updated_at();

-- The published tariff is not a flat list of numbers: it has ranges (14 000 – 35 000), open
-- floors (à partir de 6 000), an add-on (+ 500) and one service that is free with any massage.
-- Flattening those into a single price would misrepresent it, so the shape is explicit.
create type public.price_kind as enum ('fixed', 'range', 'from', 'addon', 'free');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  kind public.price_kind not null default 'fixed',
  -- Always the floor. Null only when the price is 'free'.
  price_min bigint check (price_min is null or price_min >= 0),
  -- Only set for 'range'.
  price_max bigint check (price_max is null or price_max >= 0),
  /*
   * Unknown for every service (§6). The design file invented "45 min", "2 h" and so on; those
   * are not reproduced. Nullable, and it stays null until Nour or Sophie supplies real values —
   * Phase 3's availability engine needs it, which is why it is modelled now.
   */
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),

  -- Each price kind implies which columns must be present; the database enforces it so a
  -- half-filled row cannot render as "0 DA" to a client.
  constraint services_price_shape check (
    case kind
      when 'free'  then price_min is null and price_max is null
      when 'range' then price_min is not null and price_max is not null and price_min < price_max
      else              price_min is not null and price_max is null
    end
  )
);

create index services_tenant_idx on public.services (tenant_id);
create index services_category_idx on public.services (category_id);
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();

-- Variants exist for services priced by length or complexity beyond the published lines.
create table public.service_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  slug text not null,
  name text not null,
  price bigint check (price is null or price >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, slug)
);

create trigger service_variants_touch before update on public.service_variants
  for each row execute function public.touch_updated_at();
