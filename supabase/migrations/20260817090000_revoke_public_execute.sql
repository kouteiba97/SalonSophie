-- Actually closing the function surface
--
-- `20260816120000_harden_function_exposure.sql` diagnosed this correctly and then fixed it
-- wrongly. Its own comment says "`grant execute` on functions defaults to PUBLIC", and its
-- statement is `revoke execute on function ... from anon`.
--
-- Revoking a privilege from a role that holds it via PUBLIC does nothing. `anon` was never
-- granted EXECUTE individually, so there was nothing to take away; the grant it was actually
-- using — the implicit one to PUBLIC — was left in place. The linter kept reporting every
-- helper as callable by `anon` at /rest/v1/rpc/is_owner, and it was right.
--
-- Verified against the live project before writing this: `is_owner`'s ACL read
-- `=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres`. The
-- leading `=X` with an empty grantee is PUBLIC, and `has_function_privilege('anon', ...)` still
-- answered true.
--
-- What this was and was not: RLS never stopped being the boundary. Every one of these functions
-- is SECURITY INVOKER except the helpers, so an anonymous caller reaching `upsert_service` still
-- could not write a price — the policy refused them. The helpers answer questions about the
-- caller, and for an anonymous caller the answers are null and false. So this is defence in
-- depth rather than a breach. It is still worth closing: a function that is reachable is a
-- function whose behaviour has to stay safe forever, including after the next person edits it.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Take EXECUTE away from PUBLIC on everything this schema owns
--
-- A loop rather than a list, because the failure being fixed is precisely someone enumerating a
-- set and having the set drift. Extension-owned functions are excluded: `btree_gist` installs
-- ~180 GiST support functions into `public`, they are called by the index machinery rather than
-- by anyone with an API key, and re-permissioning another project's objects is how an extension
-- upgrade turns into an outage.
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
    execute format('revoke execute on function %s from public', fn.signature);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Give it back explicitly, to the roles that need it
--
-- `authenticated` keeps everything callable. RLS policy expressions are evaluated with the
-- querying role's privileges, so a signed-in user must be able to execute `is_owner()` or nearly
-- every policy in the schema fails closed — including the ones that would let reception do their
-- job. The staff RPCs are SECURITY INVOKER for the same reason they always were: the policy
-- decides, not the grant.
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
      -- Trigger functions stay revoked from every API role. Postgres checks EXECUTE when the
      -- trigger is created, not when it fires, so the audit trail keeps being written by a role
      -- that cannot call `write_audit_log()` directly. That is the desired shape: the trail is
      -- append-only from the application's point of view, and this removes the one door that
      -- made it look otherwise.
      and p.prorettype <> 'trigger'::regtype
      and not exists (
        select 1
        from pg_depend d
        where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass
          and d.deptype = 'e'
      )
  loop
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end;
$$;

-- `anon` gets exactly four, named one at a time because this list is the public API surface and
-- deserves to be read as one.
--
-- `book_appointment` is the single SECURITY DEFINER function in any write path, and it is definer
-- precisely because its caller is anonymous and has no policy to run under. The other three feed
-- the public availability calendar and return slugs and times only — no client, no name, no
-- reason. Nothing else on this list is reachable without signing in.
grant execute on function public.book_appointment(text, text, text, timestamptz, text, text, text) to anon;
grant execute on function public.busy_spans(date, date) to anon;
grant execute on function public.staff_shift_windows(date, date) to anon;
grant execute on function public.staff_time_off_spans(date, date) to anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Make the next function inherit the rule instead of the default
--
-- Without this, the fix expires the moment somebody writes `create function` — Postgres would
-- hand PUBLIC execute on it again, and the surface would quietly reopen one function at a time.
-- The table equivalent of this already exists in `20260815120900_grants.sql`.
--
-- Default privileges attach to the *creating* role, so this is scoped to `postgres`, which is
-- who runs migrations here.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;
