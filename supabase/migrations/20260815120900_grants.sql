-- Grants
--
-- Supabase's two API roles reach the database through PostgREST. Grants say which tables the
-- role may touch at all; RLS policies then say which *rows*. Both are needed: a table with
-- policies but no grant is invisible, and a table with a grant but no policies is wide open.
--
-- `anon` gets SELECT only. Every anonymous read is still filtered by the public-catalogue
-- policies, so this grant does not by itself expose anything.

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

grant usage on all sequences in schema public to anon, authenticated;

-- Same treatment for anything added later, so a new table is never accidentally unreachable.
alter default privileges in schema public
  grant select on tables to anon, authenticated;

alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;

-- The audit trail is append-only from the application's point of view: rows arrive through a
-- security definer trigger, and no API role may rewrite history.
revoke insert, update, delete on public.audit_log from authenticated;
revoke select on public.audit_log from anon;
