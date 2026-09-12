-- Covering indexes for the foreign keys that will actually be traversed
--
-- The database linter lists 45 unindexed foreign keys. Adding all 45 would be following the tool
-- rather than reading it: every index is paid for on each write, and most of these point out of
-- tables that will never hold enough rows for a sequential scan to cost anything.
--
-- Three rules decided this list.
--
--   1. The table has to grow. `appointments`, `payments`, `messages`, `stock_movements` and the
--      logs grow with the salon's trade. `services`, `gowns`, `staff`, `business_hours` and
--      `accessories` are a tariff, a rail and two sisters — they are read constantly and change
--      almost never, and Postgres will scan forty rows faster than it will descend a btree.
--
--   2. `tenant_id` is excluded everywhere. It appears on nearly every table and has exactly one
--      value in this installation, so an index on it can only ever point at all the rows. The
--      column exists for the RLS predicate, not for lookup.
--
--   3. The other side has to be something the application actually looks up by. A delete cascade
--      counts: removing a client without an index on `conversations.client_id` scans that table,
--      and that is the path a "delete this client" request takes.
--
-- The linter's other finding — 32 unused indexes — is left alone deliberately. The database has
-- served almost no queries yet, so "never used" there means "never asked for", not "useless".
-- Dropping an index on that evidence would be acting on an empty sample.

-- ─── the day-line, and everything hung off an appointment ────────────────────────────────────
create index if not exists appointments_gown_idx
  on public.appointments (gown_id) where gown_id is not null;

create index if not exists appointment_services_service_idx
  on public.appointment_services (service_id);

create index if not exists appointment_services_appointment_idx
  on public.appointment_services (appointment_id);

-- ─── money: the /finances reads, and the join back to what was sold ──────────────────────────
create index if not exists payments_appointment_idx
  on public.payments (appointment_id) where appointment_id is not null;

create index if not exists payments_reservation_idx
  on public.payments (reservation_id) where reservation_id is not null;

create index if not exists deposits_appointment_idx
  on public.deposits (appointment_id) where appointment_id is not null;

create index if not exists deposits_reservation_idx
  on public.deposits (reservation_id) where reservation_id is not null;

create index if not exists deposits_client_idx
  on public.deposits (client_id);

create index if not exists invoices_deal_idx
  on public.invoices (deal_id) where deal_id is not null;

create index if not exists expenses_supplier_idx
  on public.expenses (supplier_id) where supplier_id is not null;

-- ─── stock: the shelf history, which is the quantity ─────────────────────────────────────────
--
-- `product_stock` sums movements per product, so this one is the view's own index.
create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id);

create index if not exists stock_movements_appointment_idx
  on public.stock_movements (appointment_id) where appointment_id is not null;

create index if not exists alerts_product_idx
  on public.alerts (product_id) where product_id is not null;

-- ─── the inbox and the client record ─────────────────────────────────────────────────────────
create index if not exists conversations_client_idx
  on public.conversations (client_id) where client_id is not null;

create index if not exists client_notes_author_idx
  on public.client_notes (author_id);

-- ─── bridal: a reservation's accessories and its paperwork ───────────────────────────────────
create index if not exists accessory_loans_reservation_idx
  on public.accessory_loans (reservation_id);

create index if not exists accessory_loans_client_idx
  on public.accessory_loans (client_id) where client_id is not null;

create index if not exists contracts_reservation_idx
  on public.contracts (reservation_id);

create index if not exists contracts_client_idx
  on public.contracts (client_id);

-- ─── who did what: the audit-adjacent columns, read when a name is questioned ────────────────
create index if not exists gown_status_log_changed_by_idx
  on public.gown_status_log (changed_by) where changed_by is not null;

create index if not exists messages_sent_by_idx
  on public.messages (sent_by) where sent_by is not null;
