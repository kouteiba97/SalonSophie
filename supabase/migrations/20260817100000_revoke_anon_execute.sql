-- Closing the half the previous migration could not see
--
-- `20260817090000` revoked EXECUTE from PUBLIC and, tested against PGlite, produced exactly the
-- four public functions and nothing else. Applied to the live project it left **25** functions
-- reachable by `anon`, including `upsert_service`, `record_expense`, `set_business_hours` and
-- `search_clients`.
--
-- The difference is not Postgres. It is Supabase. A real project ships `pg_default_acl` entries
-- that grant the API roles rights on every object the `postgres` role creates afterwards:
--
--   defaclrole | objtype | default_acl
--   postgres   | f       | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | ...
--
-- So every function these migrations created carries an EXECUTE grant to `anon` *explicitly*,
-- not merely through PUBLIC. Revoking PUBLIC removed the grant the helpers were using — the
-- previous migration had already stripped their explicit `anon` entry — and did nothing at all
-- to the rest.
--
-- The harness was quietly more secure than production, so the test passed for a reason unrelated
-- to what it claimed to check. That is the same shape as the bug it was written to catch, one
-- layer down. `tests/db/harness.ts` now installs Supabase's default privileges before running
-- migrations, and the privilege test fails without this file.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Take EXECUTE away from anon as well as PUBLIC
--
-- Both grantees, because either alone leaves a path: PUBLIC covers a bare Postgres, the explicit
-- `anon` entry covers a Supabase project, and only doing both makes a fresh deploy and the live
-- project end up in the same state. `service_role` is left alone — it bypasses RLS by design and
-- is never used by this application.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass
          and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end;
$$;

-- Hand back the four the public site genuinely calls. Everything else an anonymous visitor needs
-- is a table read, governed by the catalogue policies.
grant execute on function public.book_appointment(text, text, text, timestamptz, text, text, text) to anon;
grant execute on function public.busy_spans(date, date) to anon;
grant execute on function public.staff_shift_windows(date, date) to anon;
grant execute on function public.staff_time_off_spans(date, date) to anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Stop the default from re-granting it to the next function somebody writes
--
-- `20260817090000` revoked the PUBLIC half of the default and left Supabase's `anon` entry in
-- place, which is why this needs saying twice.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
