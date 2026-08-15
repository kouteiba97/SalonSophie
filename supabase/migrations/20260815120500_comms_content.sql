-- Inbox, content and brand deals
--
-- These tables exist now so tenancy and RLS are uniform across the schema, but they are only
-- populated from Phase 6. Everything here must work with zero social integration (§10): Meta
-- approval can take weeks and the core — bookings, gowns, clients — cannot wait on it. Hence
-- `channel` allows a manually logged conversation, and external ids are always nullable.

create type public.message_channel as enum ('whatsapp', 'instagram', 'phone', 'walk_in', 'other');
create type public.message_direction as enum ('inbound', 'outbound');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  channel public.message_channel not null default 'whatsapp',
  external_id text,
  subject text,
  -- The staff console surfaces unanswered messages as an alert (§13): a known failure mode.
  is_answered boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_tenant_idx on public.conversations (tenant_id, is_answered);
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text,
  external_id text,
  sent_by uuid references public.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, sent_at desc);
create trigger messages_touch before update on public.messages
  for each row execute function public.touch_updated_at();

create table public.saved_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shortcut text not null,
  body text not null,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, shortcut, locale)
);

create trigger saved_replies_touch before update on public.saved_replies
  for each row execute function public.touch_updated_at();

-- ── content and brand deals ──────────────────────────────────────────────────────────────────
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text,
  permalink text,
  caption text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_posts_touch before update on public.content_posts
  for each row execute function public.touch_updated_at();

create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  post_id uuid not null references public.content_posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  reach integer,
  likes integer,
  comments integer,
  saves integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_metrics_post_idx on public.post_metrics (post_id, captured_at desc);
create trigger post_metrics_touch before update on public.post_metrics
  for each row execute function public.touch_updated_at();

-- Four-column kanban (§13): pitched → negotiating → contracted → delivered.
create type public.deal_stage as enum ('pitched', 'negotiating', 'contracted', 'delivered');

create table public.brand_deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_name text not null,
  stage public.deal_stage not null default 'pitched',
  value_amount bigint check (value_amount is null or value_amount >= 0),
  contact_name text,
  contact_handle text,
  next_action text,
  next_action_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_deals_tenant_stage_idx on public.brand_deals (tenant_id, stage);
create trigger brand_deals_touch before update on public.brand_deals
  for each row execute function public.touch_updated_at();

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid not null references public.brand_deals(id) on delete cascade,
  description text not null,
  due_on date,
  delivered_at timestamptz,
  post_id uuid references public.content_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deliverables_deal_idx on public.deliverables (deal_id);
create trigger deliverables_touch before update on public.deliverables
  for each row execute function public.touch_updated_at();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid references public.brand_deals(id) on delete set null,
  reference text not null,
  amount bigint not null check (amount >= 0),
  status public.payment_status not null default 'pending',
  issued_on date,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference)
);

create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ── reviews ──────────────────────────────────────────────────────────────────────────────────
/*
 * Ships empty, deliberately.
 *
 * The design carried three testimonials attributed to named clients with specific dates and
 * stories. Publishing invented quotes under real-sounding names is the same failure as
 * inventing a price, with consumer-protection consequences attached. `is_published` and
 * `consent_given` are separate on purpose: a review may exist without permission to show it.
 */
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  author_display_name text not null,
  context_label text,
  body text not null,
  rating smallint check (rating between 1 and 5),
  consent_given boolean not null default false,
  is_published boolean not null default false,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nothing reaches the public site without recorded consent.
  constraint reviews_published_requires_consent check (not is_published or consent_given)
);

create index reviews_published_idx on public.reviews (tenant_id, is_published);
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();
