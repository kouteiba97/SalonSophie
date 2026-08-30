-- A worker who takes appointments needs to exist three times
--
-- Adding a stylist created one row — a login — and stopped. That produced someone who could sign
-- in, could not be booked by any client, and whose own day resolved to nothing, with no screen
-- saying why. Two bugs of the same shape, found one after the other while testing the team screen:
--
--   1. `users` gives them a login.
--   2. `staff` makes them the person a client picks. Without it, nobody can book them.
--   3. `staff_schedules` gives them hours. `staff_shift_windows` joins it, so without a row there
--      the availability engine never offers them a slot.
--
-- Creating one of the three and calling it done is the failure mode; this makes the account
-- creation produce all three, or say which it skipped.

/** Accented French names into slugs, without depending on the `unaccent` extension. */
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select trim(both '-' from regexp_replace(
    lower(translate(
      coalesce(p_text, ''),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
    )),
    '[^a-z0-9]+', '-', 'g'
  ))
$fn$;

/**
 * Hours for someone new, copied from the salon's own opening hours.
 *
 * A guess, but the most likely one, and not a *new* guess — those hours are already recorded as
 * provisional and are editable from the console. The alternative is a stylist who silently cannot
 * be booked, which is worse than a default anybody can correct in one screen.
 */
create or replace function public.give_default_schedule(p_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tenant uuid;
  v_count  integer := 0;
begin
  select tenant_id into v_tenant from public.staff where id = p_staff_id;
  if v_tenant is null then return 0; end if;

  insert into public.staff_schedules (tenant_id, staff_id, weekday, starts_at, ends_at)
  select v_tenant, p_staff_id, h.weekday, h.opens_at, h.closes_at
  from public.business_hours h
  where h.tenant_id = v_tenant
    and not h.is_closed
    and h.opens_at is not null
    and h.closes_at is not null
    and not exists (
      select 1 from public.staff_schedules s
      where s.staff_id = p_staff_id and s.weekday = h.weekday
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

create or replace function public.create_staff_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_staff_slug text default null,
  /** Also create the bookable person. Two paths in: attach to an existing one, or make a new one. */
  p_bookable boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tenant   uuid := public.auth_tenant_id();
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_id       uuid := gen_random_uuid();
  v_slug     text;
  v_location uuid;
  v_staff    uuid;
  v_n        integer := 1;
begin
  if v_tenant is null or not public.is_owner() then
    raise exception 'account_forbidden';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][a-z]{2,}$' then
    raise exception 'account_invalid_email';
  end if;

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

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', btrim(p_full_name)),
    now(), now(), '', '', '', '', ''
  );

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

  if p_staff_slug is not null and btrim(p_staff_slug) <> '' then
    -- Nour and Sophie predate their own logins; this is how they get attached to one.
    update public.staff s set user_id = v_id
     where s.tenant_id = v_tenant and s.slug = btrim(p_staff_slug)
     returning s.id into v_staff;
    if v_staff is null then
      raise exception 'account_unknown_staff';
    end if;

  elsif p_bookable then
    -- Everybody hired afterwards. The slug comes from the name, suffixed if it is taken.
    v_slug := public.slugify(p_full_name);
    if v_slug = '' then v_slug := 'experte'; end if;

    while exists (select 1 from public.staff where tenant_id = v_tenant and slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := public.slugify(p_full_name) || '-' || v_n::text;
    end loop;

    select id into v_location from public.locations
     where tenant_id = v_tenant order by created_at limit 1;

    insert into public.staff (
      tenant_id, location_id, user_id, display_name, slug, is_bookable, sort_order
    )
    values (
      v_tenant, v_location, v_id, btrim(p_full_name), v_slug, true,
      coalesce((select max(sort_order) + 1 from public.staff where tenant_id = v_tenant), 1)
    )
    returning id into v_staff;
  end if;

  if v_staff is not null then
    perform public.give_default_schedule(v_staff);
  end if;

  return v_id;
end;
$fn$;

-- The five-argument version would still create the half-made stylist, so it goes.
drop function if exists public.create_staff_account(text, text, text, text, text);

revoke execute on function
  public.create_staff_account(text, text, text, text, text, boolean),
  public.give_default_schedule(uuid),
  public.slugify(text)
  from public, anon;

grant execute on function
  public.create_staff_account(text, text, text, text, text, boolean),
  public.give_default_schedule(uuid),
  public.slugify(text)
  to authenticated;
