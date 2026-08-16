-- Hardening the function surface
--
-- Written after applying the schema to a real Supabase project for the first time and running the
-- database linter against it. Two of its findings were real; the rest are this schema working as
-- designed, and the reasoning is recorded here so nobody "fixes" them later.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. touch_updated_at had a mutable search_path
--
-- Every other function in this schema pins `search_path = ''` and schema-qualifies everything.
-- This one was written first and missed it. It runs as a trigger on almost every table, so it is
-- the last one that should be resolving names through whatever search_path the caller happens to
-- have set. It touches no tables, which is why nothing broke — but a SECURITY DEFINER trigger
-- with a mutable search_path is the shape of the problem, not an instance of it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. The RLS helpers and trigger functions were reachable over the REST API by `anon`
--
-- `grant execute` on functions defaults to PUBLIC, so every helper written for RLS was callable
-- at /rest/v1/rpc/is_owner by anyone with the anon key. None of them leaks on its own — they
-- answer questions about the *caller*, and for an anonymous caller the answer is null or false —
-- but an anonymous visitor has no reason to reach them at all, and a function that is exposed is
-- a function whose behaviour has to keep being safe forever.
--
-- Revoked from `anon` only, deliberately. Not from `authenticated`: RLS policy expressions are
-- evaluated with the querying role's privileges, so revoking `is_owner()` from `authenticated`
-- would break every policy that calls it — which is nearly all of them. The linter still warns
-- about that half, and that warning is correct to leave standing: it says "make sure this is
-- intentional", and here it is.
--
-- The four public booking functions are deliberately NOT revoked. `book_appointment` is callable
-- by `anon` on purpose — that is the whole reason it is the one `security definer` function in
-- the write path, since its caller has no policy to run under. `busy_spans`,
-- `staff_shift_windows` and `staff_time_off_spans` feed the public availability calendar and
-- return slugs and times only: no client, no name, no reason.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function
  public.auth_tenant_id(),
  public.auth_role(),
  public.auth_staff_id(),
  public.is_owner(),
  public.is_reception(),
  public.is_front_desk(),
  public.same_tenant(uuid),
  public.stylist_serves_client(uuid)
  from anon;

-- Trigger functions. Postgres refuses a direct call anyway ("trigger functions can only be called
-- as triggers"), so this removes a door that was already locked — but it removes it from the API
-- surface, which is where someone reads it and assumes it is meant to be there.
revoke execute on function
  public.touch_updated_at(),
  public.write_audit_log(),
  public.log_gown_state_change(),
  public.check_accessory_stock(),
  public.sync_conversation_from_message()
  from anon, authenticated;
