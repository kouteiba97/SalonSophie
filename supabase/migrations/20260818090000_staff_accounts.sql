-- Staff accounts: who may sign in, created by an owner
--
-- The console holds every client's phone number, so there is deliberately no public sign-up.
-- Accounts are created by an owner, here, and the worker sets their own password on first login.
-- That is the difference between "sign-up" and what a salon actually needs: Nour and Sophie decide
-- who works here, and the door is not open to whoever finds the URL.
--
-- Email is the login identifier rather than phone because Supabase phone auth needs an SMS
-- provider, which costs money per message and delivers unreliably in Algeria. A worker with no
-- email gets one made for them; it is a username that happens to contain an @.

-- A temporary password handed over verbally must not stay valid forever.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is
  'Set when an owner creates the account with a temporary password. The console forces a change before anything else is reachable.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- create_staff_account
--
-- SECURITY DEFINER because it writes into `auth`, which no application role may touch. That makes
-- the guard inside it load-bearing rather than decorative: it is the only thing between a
-- signed-in stylist and minting themselves an owner account. Hence the explicit is_owner() check,
-- the tenant pinned to the caller's own, and EXECUTE granted to `authenticated` alone.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.create_staff_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_staff_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tenant uuid := public.auth_tenant_id();
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_id     uuid := gen_random_uuid();
begin
  if v_tenant is null or not public.is_owner() then
    raise exception 'account_forbidden';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][a-z]{2,}$' then
    raise exception 'account_invalid_email';
  end if;

  -- Short enough to say out loud, long enough not to be guessed from the street.
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'account_weak_password';
  end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'account_invalid_name';
  end if;

  if p_role not in ('owner', 'reception', 'stylist') then
    raise exception 'account_invalid_role';
  end if;

  if exists (select 1 from auth.users u where u.email = v_email) then
    raise exception 'account_email_taken';
  end if;

  /*
   * `email_confirmed_at` is set at creation deliberately. The owner is standing next to the person
   * whose account this is: there is nobody to confirm an address to, and no SMTP configured to
   * confirm it with. The token columns are empty strings rather than NULL because GoTrue reads
   * them as text and a NULL there breaks sign-in in a way that looks like a wrong password.
   */
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', btrim(p_full_name)),
    now(), now(), '', '', '', '', ''
  );

  -- Without an identity row GoTrue does not treat the email provider as linked, and sign-in fails.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.users (id, tenant_id, role_key, full_name, email, is_active, must_change_password)
  values (v_id, v_tenant, p_role, btrim(p_full_name), v_email, true, true);

  -- Link to the bookable person, so a stylist's own day and own clients resolve.
  if p_staff_slug is not null and btrim(p_staff_slug) <> '' then
    update public.staff s
       set user_id = v_id
     where s.tenant_id = v_tenant and s.slug = btrim(p_staff_slug);
    if not found then
      raise exception 'account_unknown_staff';
    end if;
  end if;

  return v_id;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Changing your own password
--
-- For the caller's own account only: `auth.uid()` is the subject and never a parameter, so this
-- cannot be pointed at somebody else's row.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.change_own_password(p_new_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_id uuid := (select auth.uid());
begin
  if v_id is null then raise exception 'account_forbidden'; end if;
  if length(coalesce(p_new_password, '')) < 10 then raise exception 'account_weak_password'; end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  update public.users set must_change_password = false where id = v_id;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Deactivating a leaver
--
-- `is_active = false`, never a delete: their name is on past appointments, and those rows are the
-- record of who served whom. `getStaffSession` refuses an inactive user, so access stops at the
-- next request without rewriting history.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.set_staff_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.is_owner() then
    raise exception 'account_forbidden';
  end if;

  -- An owner locking themselves out is a support call nobody here can answer.
  if p_user_id = (select auth.uid()) then
    raise exception 'account_cannot_disable_self';
  end if;

  update public.users set is_active = p_active
   where id = p_user_id and tenant_id = v_tenant;

  if not found then raise exception 'account_not_found'; end if;
end;
$fn$;

/*
 * An owner resetting a forgotten password — still a temporary one. `must_change_password` goes
 * back on, so an owner never keeps knowing a worker's password.
 */
create or replace function public.reset_staff_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_tenant uuid := public.auth_tenant_id();
begin
  if v_tenant is null or not public.is_owner() then
    raise exception 'account_forbidden';
  end if;
  if length(coalesce(p_password, '')) < 10 then raise exception 'account_weak_password'; end if;

  perform 1 from public.users where id = p_user_id and tenant_id = v_tenant;
  if not found then raise exception 'account_not_found'; end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user_id;

  update public.users set must_change_password = true where id = p_user_id;
end;
$fn$;

-- Nothing here is reachable without a session. `anon` gets none of it.
revoke execute on function
  public.create_staff_account(text, text, text, text, text),
  public.change_own_password(text),
  public.set_staff_active(uuid, boolean),
  public.reset_staff_password(uuid, text)
  from public, anon;

grant execute on function
  public.create_staff_account(text, text, text, text, text),
  public.change_own_password(text),
  public.set_staff_active(uuid, boolean),
  public.reset_staff_password(uuid, text)
  to authenticated;
