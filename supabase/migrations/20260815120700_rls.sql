-- Row Level Security
--
-- Non-negotiable #5: RLS on every table, enforced with policies — not middleware. Middleware
-- can be bypassed by any code path that forgets to call it; a policy cannot.
--
--   owner      Nour and Sophie. Everything.
--   reception  Books appointments, manages clients, reads all calendars and the inbox.
--              Cannot see brand deals, invoices or content metrics.
--   stylist    Own day and own clients only.
--
-- Plus `anon`: the public site is unauthenticated and needs to read the catalogue. That is the
-- only thing it may read.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Identity helpers
--
-- All security definer + stable + empty search_path. security definer matters twice over: it
-- lets a policy on `users` consult `users` without infinite recursion, and it keeps the lookup
-- cheap enough to sit in every policy on every table.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select tenant_id from public.users where id = (select auth.uid()) and is_active $$;

create or replace function public.auth_role()
returns text
language sql stable security definer set search_path = ''
as $$ select role_key from public.users where id = (select auth.uid()) and is_active $$;

create or replace function public.auth_staff_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select id from public.staff where user_id = (select auth.uid()) $$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.auth_role() = 'owner', false) $$;

create or replace function public.is_reception()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.auth_role() = 'reception', false) $$;

-- Owner or reception: the two roles that run the day across every client.
create or replace function public.is_front_desk()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_owner() or public.is_reception() $$;

-- Same tenant as the caller. Every policy starts here.
create or replace function public.same_tenant(p_tenant uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select p_tenant is not null and p_tenant = public.auth_tenant_id() $$;

/*
 * "Stylists can't see other stylists' clients."
 *
 * A stylist may see a client they have actually served. Wrapped in security definer so the
 * lookup does not re-enter the appointments policy — that would recurse, since the appointments
 * policy itself refers to staff identity.
 */
create or replace function public.stylist_serves_client(p_client_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.client_id = p_client_id
      and a.staff_id = public.auth_staff_id()
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Enable RLS everywhere. A table without RLS enabled is readable by anyone with the anon key.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','locations','business_hours','business_hour_exceptions','roles','users','staff',
    'staff_schedules','staff_time_off','service_categories','services','service_variants',
    'clients','client_notes','appointments','appointment_services','gowns','gown_sizes',
    'gown_reservations','gown_status_log','accessories','accessory_loans','contracts','deposits',
    'payments','conversations','messages','saved_replies','content_posts','post_metrics',
    'brand_deals','deliverables','invoices','reviews','audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Force it for the table owner too, so a definer function cannot quietly widen access.
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Public catalogue — the only thing an anonymous visitor may read
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy categories_public_read on public.service_categories
  for select to anon, authenticated using (is_active);

create policy services_public_read on public.services
  for select to anon, authenticated using (is_active);

create policy service_variants_public_read on public.service_variants
  for select to anon, authenticated using (is_active);

create policy gowns_public_read on public.gowns
  for select to anon, authenticated using (is_active);

create policy gown_sizes_public_read on public.gown_sizes
  for select to anon, authenticated using (true);

create policy accessories_public_read on public.accessories
  for select to anon, authenticated using (is_active);

create policy locations_public_read on public.locations
  for select to anon, authenticated using (true);

create policy business_hours_public_read on public.business_hours
  for select to anon, authenticated using (true);

create policy business_hour_exceptions_public_read on public.business_hour_exceptions
  for select to anon, authenticated using (true);

-- Only reviews with recorded consent, and only once published.
create policy reviews_public_read on public.reviews
  for select to anon, authenticated using (is_published and consent_given);

-- The booking flow offers bookable staff by name. Nothing else about them is public.
create policy staff_public_read on public.staff
  for select to anon using (is_bookable);

create policy roles_read on public.roles
  for select to anon, authenticated using (true);

-- Catalogue writes: owner only.
create policy categories_owner_write on public.service_categories
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy services_owner_write on public.services
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy service_variants_owner_write on public.service_variants
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy gowns_owner_write on public.gowns
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy gown_sizes_owner_write on public.gown_sizes
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy accessories_owner_write on public.accessories
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy locations_owner_write on public.locations
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy business_hours_owner_write on public.business_hours
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy business_hour_exceptions_owner_write on public.business_hour_exceptions
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy tenants_owner_all on public.tenants
  for all to authenticated using (public.is_owner() and id = public.auth_tenant_id())
  with check (public.is_owner() and id = public.auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- People
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Everyone reads their own row; owners read the whole team.
create policy users_self_read on public.users
  for select to authenticated
  using (id = (select auth.uid()) or (public.is_owner() and public.same_tenant(tenant_id)));

create policy users_owner_write on public.users
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy staff_internal_read on public.staff
  for select to authenticated using (public.same_tenant(tenant_id));

create policy staff_owner_write on public.staff
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- Reception reads every calendar (§7). A stylist reads only their own.
create policy staff_schedules_read on public.staff_schedules
  for select to authenticated
  using (public.same_tenant(tenant_id) and (public.is_front_desk() or staff_id = public.auth_staff_id()));

create policy staff_schedules_owner_write on public.staff_schedules
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy staff_time_off_read on public.staff_time_off
  for select to authenticated
  using (public.same_tenant(tenant_id) and (public.is_front_desk() or staff_id = public.auth_staff_id()));

create policy staff_time_off_write on public.staff_time_off
  for all to authenticated
  using (public.same_tenant(tenant_id) and (public.is_owner() or staff_id = public.auth_staff_id()))
  with check (public.same_tenant(tenant_id) and (public.is_owner() or staff_id = public.auth_staff_id()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Clients and appointments
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy clients_read on public.clients
  for select to authenticated
  using (
    public.same_tenant(tenant_id)
    and (public.is_front_desk() or public.stylist_serves_client(id))
  );

-- Reception manages clients; that is the primary daily job (§7).
create policy clients_front_desk_write on public.clients
  for all to authenticated
  using (public.is_front_desk() and public.same_tenant(tenant_id))
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

create policy client_notes_read on public.client_notes
  for select to authenticated
  using (
    public.same_tenant(tenant_id)
    and (public.is_front_desk() or public.stylist_serves_client(client_id))
  );

create policy client_notes_write on public.client_notes
  for all to authenticated
  using (
    public.same_tenant(tenant_id)
    and (public.is_front_desk() or public.stylist_serves_client(client_id))
  )
  with check (
    public.same_tenant(tenant_id)
    and (public.is_front_desk() or public.stylist_serves_client(client_id))
  );

-- A stylist sees their own day, and nobody else's.
create policy appointments_read on public.appointments
  for select to authenticated
  using (
    public.same_tenant(tenant_id)
    and (public.is_front_desk() or staff_id = public.auth_staff_id())
  );

create policy appointments_front_desk_write on public.appointments
  for all to authenticated
  using (public.is_front_desk() and public.same_tenant(tenant_id))
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

-- A stylist may update their own appointment (mark it completed, add a note) but not create
-- one for someone else or reassign it away.
create policy appointments_stylist_update on public.appointments
  for update to authenticated
  using (public.same_tenant(tenant_id) and staff_id = public.auth_staff_id())
  with check (public.same_tenant(tenant_id) and staff_id = public.auth_staff_id());

create policy appointment_services_read on public.appointment_services
  for select to authenticated
  using (
    public.same_tenant(tenant_id)
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and (public.is_front_desk() or a.staff_id = public.auth_staff_id())
    )
  );

create policy appointment_services_front_desk_write on public.appointment_services
  for all to authenticated
  using (public.is_front_desk() and public.same_tenant(tenant_id))
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Bridal atelier — Phase 4. Reception reads (to answer "is it free?"), owner writes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy gown_reservations_read on public.gown_reservations
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

create policy gown_reservations_owner_write on public.gown_reservations
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy gown_status_log_read on public.gown_status_log
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

create policy accessory_loans_read on public.accessory_loans
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

create policy accessory_loans_owner_write on public.accessory_loans
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy contracts_owner_all on public.contracts
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Money — owner only. Reception takes payments in person; recording them is Phase 4's decision
-- to make explicitly rather than a permission granted by default.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy deposits_owner_all on public.deposits
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy payments_owner_all on public.payments
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Inbox — reception answers it, so reception can see it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy conversations_front_desk_all on public.conversations
  for all to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id))
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

create policy messages_front_desk_all on public.messages
  for all to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id))
  with check (public.is_front_desk() and public.same_tenant(tenant_id));

create policy saved_replies_front_desk_read on public.saved_replies
  for select to authenticated using (public.is_front_desk() and public.same_tenant(tenant_id));

create policy saved_replies_owner_write on public.saved_replies
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Sophie's creator business — owner only.
--
-- This is the line non-negotiable #5 names explicitly: reception cannot see brand deals. Deal
-- values and invoices are Sophie's business, not the front desk's.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy brand_deals_owner_all on public.brand_deals
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy deliverables_owner_all on public.deliverables
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy invoices_owner_all on public.invoices
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy content_posts_owner_all on public.content_posts
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy post_metrics_owner_all on public.post_metrics
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

create policy reviews_owner_write on public.reviews
  for all to authenticated using (public.is_owner() and public.same_tenant(tenant_id))
  with check (public.is_owner() and public.same_tenant(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Audit log — readable by owners, writable by nobody.
--
-- Rows arrive through a security definer trigger, which bypasses RLS. There is deliberately no
-- insert, update or delete policy: an audit trail an operator can edit is not an audit trail.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create policy audit_log_owner_read on public.audit_log
  for select to authenticated using (public.is_owner() and public.same_tenant(tenant_id));
