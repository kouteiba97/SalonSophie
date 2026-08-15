-- Audit log
--
-- Non-negotiable #9: an audit_log row for every mutation to appointments, reservations and
-- payments. These are the three things people argue about afterwards — who moved the
-- appointment, who cancelled the dress, whether the deposit was taken — so the record is
-- written by the database on the same transaction as the change, not by whichever code path
-- happened to remember.

create type public.audit_action as enum ('insert', 'update', 'delete');

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  -- Whoever was authenticated at the time. Null for service-role or SQL-console changes, which
  -- is itself worth knowing.
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  -- Only the columns that actually changed, so an update is readable at a glance.
  changed_fields text[],
  created_at timestamptz not null default now()
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id, created_at desc);
create index audit_log_tenant_idx on public.audit_log (tenant_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_tenant uuid;
  v_record uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    -- updated_at changes on every write and would drown the diff.
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new)
    where key <> 'updated_at'
      and v_new -> key is distinct from v_old -> key;

    -- A write that changed nothing but the timestamp is not worth a row.
    if v_changed is null then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
  end if;

  v_tenant := nullif(coalesce(v_new, v_old) ->> 'tenant_id', '')::uuid;
  v_record := nullif(coalesce(v_new, v_old) ->> 'id', '')::uuid;

  insert into public.audit_log (
    tenant_id, table_name, record_id, action, actor_id, old_data, new_data, changed_fields
  )
  values (
    v_tenant,
    tg_table_name,
    v_record,
    lower(tg_op)::public.audit_action,
    auth.uid(),
    v_old,
    v_new,
    v_changed
  );

  return coalesce(new, old);
end;
$$;

-- The three tables the brief names.
create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function public.write_audit_log();

create trigger gown_reservations_audit
  after insert or update or delete on public.gown_reservations
  for each row execute function public.write_audit_log();

create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();

-- Deposits move money too, and a deposit dispute is the same conversation as a payment dispute.
create trigger deposits_audit
  after insert or update or delete on public.deposits
  for each row execute function public.write_audit_log();
