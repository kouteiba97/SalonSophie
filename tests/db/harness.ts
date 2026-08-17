import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Runs the real migration files against a real Postgres, in-process.
 *
 * PGlite is Postgres compiled to WASM — the same planner, the same constraint machinery, the
 * same `btree_gist`. That matters because non-negotiable #1 is enforced by an exclusion
 * constraint: a test that mocked the database would prove nothing about the one rule whose
 * failure is discovered on a wedding day. No Docker required, so this runs in CI.
 *
 * The only thing stubbed is Supabase's `auth` schema, which the platform provides at runtime.
 */

/**
 * Minimal stand-in for what Supabase installs: the auth schema, the API roles, and `auth.uid()`
 * reading the request's JWT claim exactly as it does in production.
 */
const AUTH_STUB = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key,
    email text
  );

  create or replace function auth.uid()
  returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;

  -- Supabase's default privileges, which a bare Postgres does not have.
  --
  -- A real Supabase project ships pg_default_acl entries granting the API roles rights on every
  -- object the postgres role creates afterwards — including EXECUTE on functions, to anon
  -- *explicitly*, not merely through PUBLIC.
  --
  -- Leaving this out made the harness quietly more secure than production. A migration that
  -- revoked EXECUTE from PUBLIC produced a clean result here and left 25 functions reachable by
  -- anon on the live project, because only the live one had the explicit grant to remove. The
  -- privilege test passed for a reason unrelated to what it claimed to check — the same shape as
  -- the bug it was written to catch.
  alter default privileges for role postgres in schema public
    grant execute on functions to anon, authenticated, service_role;

  alter default privileges for role postgres in schema public
    grant all on tables to anon, authenticated, service_role;

  alter default privileges for role postgres in schema public
    grant all on sequences to anon, authenticated, service_role;
`;

export type TestDb = PGlite;

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create({ extensions: { btree_gist } });

  await db.exec(AUTH_STUB);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error(`no migrations found in ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  return db;
}

export const TENANT_ID = 'a0000000-0000-4000-8000-000000000001';

export interface Actor {
  userId: string;
  staffId?: string;
}

/**
 * Runs `fn` as an authenticated user, exactly as PostgREST would: the `authenticated` role plus
 * a JWT `sub` claim. Superusers bypass RLS entirely, so switching role is what makes these
 * tests meaningful rather than decorative.
 */
export async function asUser<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${userId}'; set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Runs `fn` as an anonymous visitor — the public website. */
export async function asAnon<T>(db: TestDb, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

/** Creates an auth user plus the matching public.users row, and optionally a staff row. */
export async function createUser(
  db: TestDb,
  opts: { id: string; role: 'owner' | 'reception' | 'stylist'; name: string; staffSlug?: string },
): Promise<Actor> {
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [
    opts.id,
    `${opts.name.toLowerCase()}@example.test`,
  ]);

  await db.query(
    `insert into public.users (id, tenant_id, role_key, full_name)
     values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [opts.id, TENANT_ID, opts.role, opts.name],
  );

  let staffId: string | undefined;
  if (opts.staffSlug) {
    const existing = await db.query<{ id: string }>(
      'select id from public.staff where tenant_id = $1 and slug = $2',
      [TENANT_ID, opts.staffSlug],
    );
    if (existing.rows.length > 0) {
      staffId = existing.rows[0].id;
      await db.query('update public.staff set user_id = $1 where id = $2', [opts.id, staffId]);
    } else {
      const created = await db.query<{ id: string }>(
        `insert into public.staff (tenant_id, display_name, slug, user_id)
         values ($1, $2, $3, $4) returning id`,
        [TENANT_ID, opts.name, opts.staffSlug, opts.id],
      );
      staffId = created.rows[0].id;
    }
  }

  return { userId: opts.id, staffId };
}

/** A client to hang appointments off. */
export async function createClient(db: TestDb, name: string, phone: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.clients (tenant_id, full_name, phone) values ($1, $2, $3) returning id`,
    [TENANT_ID, name, phone],
  );
  return res.rows[0].id;
}

export async function gownIdBySlug(db: TestDb, slug: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    'select id from public.gowns where tenant_id = $1 and slug = $2',
    [TENANT_ID, slug],
  );
  if (res.rows.length === 0) throw new Error(`gown ${slug} not seeded`);
  return res.rows[0].id;
}

/** Postgres error code for an exclusion constraint violation. */
export const EXCLUSION_VIOLATION = '23P01';
