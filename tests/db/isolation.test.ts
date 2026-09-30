/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createTestDb, createUser, TENANT_ID, type TestDb } from './harness';

let db: TestDb;

/**
 * Cross-tenant isolation, attacked rather than assumed.
 *
 * The schema carries `tenant_id` on 39 tables, `auth_tenant_id()`, `same_tenant()` and a policy on
 * everything — and until this file, every test in the suite ran as a single hardcoded tenant. The
 * entire multi-tenant boundary was untested. A suite can be green at 401 tests and prove nothing
 * about the one guarantee that matters the moment a second salon exists.
 *
 * That is not hypothetical here: the platform is built to be sold to more than one salon, and
 * `tenants` is the row that makes it happen. A leak between tenants is the failure that ends the
 * product, so it is worth attacking properly.
 *
 * These tests do not go through the app. They run as `authenticated` with a JWT claim, which is
 * exactly what PostgREST does — so they test the boundary an attacker actually meets, not the one
 * the UI presents. Anyone with the anon key can reach PostgREST directly; the UI is not in the
 * path at all.
 */

const T2 = 'b0000000-0000-4000-8000-000000000002';

// Tenant A — the seeded salon.
const A_OWNER = '50000000-0000-4000-8000-00000000000a';
const A_STYLIST = '50000000-0000-4000-8000-00000000000b';

// Tenant B — a second salon, the attacker's own legitimate account.
const B_OWNER = '50000000-0000-4000-8000-00000000000c';

let aClientId: string;
let aApptId: string;

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: A_OWNER, role: 'owner', name: 'Sophie A', staffSlug: 'sophie' });
  await createUser(db, { id: A_STYLIST, role: 'stylist', name: 'Nour A', staffSlug: 'nour' });

  // A second tenant, built by hand because the harness only knows the seeded one.
  await db.query(`insert into public.tenants (id, name) values ($1, 'Salon Deux')`, [T2]);
  await db.query(`insert into auth.users (id, email) values ($1, 'b@example.test')`, [B_OWNER]);
  await db.query(
    `insert into public.users (id, tenant_id, role_key, full_name)
     values ($1, $2, 'owner', 'Owner B')`,
    [B_OWNER, T2],
  );

  // A client and an appointment in each tenant, to reach across for.
  const a = await db.query<{ id: string }>(
    `insert into public.clients (tenant_id, full_name, phone) values ($1, 'Amel A', '0551110001')
     returning id`,
    [TENANT_ID],
  );
  aClientId = a.rows[0].id;

  // A client in tenant B as well, so the isolation runs in both directions.
  await db.query(
    `insert into public.clients (tenant_id, full_name, phone) values ($1, 'Client B', '0551110002')
`,
    [T2],
  );

  const appt = await db.query<{ id: string }>(
    `insert into public.appointments (tenant_id, client_id, line, status, period)
     values ($1, $2, 'salon', 'confirmed',
             tstzrange(now() + interval '2 days', now() + interval '2 days 1 hour', '[)'))
     returning id`,
    [TENANT_ID, aClientId],
  );
  aApptId = appt.rows[0].id;

  await db.query(
    `insert into public.payments (tenant_id, client_id, amount, method, paid_at)
     values ($1, $2, 500000, 'cash', now())`,
    [TENANT_ID, aClientId],
  );
}, 120_000);

/* ── Phase 9: cross-tenant reads ────────────────────────────────────────────────────────── */

describe("tenant B's owner cannot read tenant A", () => {
  /**
   * The owner of another salon is the most dangerous realistic attacker: a legitimate, fully
   * authenticated account with every privilege its own role allows. Nothing about their session is
   * forged. The only thing standing between them and A's client book is `same_tenant()`.
   */
  it.each([
    ['clients', 'clients'],
    ['appointments', 'appointments'],
    ['payments', 'payments'],
    ['gown_reservations', 'gown_reservations'],
    ['client_notes', 'client_notes'],
    ['messages', 'messages'],
    ['expenses', 'expenses'],
    ['stock_movements', 'stock_movements'],
    ['brand_deals', 'brand_deals'],
  ])('sees no %s belonging to the other salon', async (_label, table) => {
    const res = await asUser(db, B_OWNER, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.${table} where tenant_id = $1`,
        [TENANT_ID],
      ),
    );
    expect(res.rows[0].n).toBe(0);
  });

  /** The direct-object attack: a known id, fetched by primary key rather than listed. */
  it('cannot fetch tenant A rows by id, even knowing the id', async () => {
    const client = await asUser(db, B_OWNER, () =>
      db.query(`select id from public.clients where id = $1`, [aClientId]),
    );
    expect(client.rows).toHaveLength(0);

    const appt = await asUser(db, B_OWNER, () =>
      db.query(`select id from public.appointments where id = $1`, [aApptId]),
    );
    expect(appt.rows).toHaveLength(0);
  });

  /** Staff of another salon are people; their names and phone numbers are not public either. */
  it('cannot enumerate the other salon’s staff or user accounts', async () => {
    const staff = await asUser(db, B_OWNER, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.staff where tenant_id = $1`,
        [TENANT_ID],
      ),
    );
    expect(staff.rows[0].n).toBe(0);

    const users = await asUser(db, B_OWNER, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.users where tenant_id = $1`,
        [TENANT_ID],
      ),
    );
    expect(users.rows[0].n).toBe(0);
  });
});

/* ── cross-tenant writes ────────────────────────────────────────────────────────────────── */

describe("tenant B's owner cannot write into tenant A", () => {
  it('cannot insert a row carrying the other tenant’s id', async () => {
    await expect(
      asUser(db, B_OWNER, () =>
        db.query(
          `insert into public.clients (tenant_id, full_name, phone)
           values ($1, 'Injected', '0559999999')`,
          [TENANT_ID],
        ),
      ),
    ).rejects.toThrow();
  });

  /**
   * An UPDATE that matches no visible row is not an error — it changes nothing and reports
   * success. Asserting on the row count rather than on a thrown error is what makes this test
   * meaningful: a silent no-op and a successful write look identical to a caller who only checks
   * for an exception.
   */
  it('updates nothing when reaching for the other tenant’s client', async () => {
    await asUser(db, B_OWNER, () =>
      db.query(`update public.clients set full_name = 'Taken over' where id = $1`, [aClientId]),
    );

    const after = await db.query<{ full_name: string }>(
      `select full_name from public.clients where id = $1`,
      [aClientId],
    );
    expect(after.rows[0].full_name).toBe('Amel A');
  });

  it('deletes nothing when reaching for the other tenant’s appointment', async () => {
    await asUser(db, B_OWNER, () =>
      db.query(`delete from public.appointments where id = $1`, [aApptId]),
    );

    const still = await db.query<{ n: number }>(
      `select count(*)::int as n from public.appointments where id = $1`,
      [aApptId],
    );
    expect(still.rows[0].n).toBe(1);
  });
});

/* ── Phase 2: vertical escalation ───────────────────────────────────────────────────────── */

describe('privilege escalation', () => {
  /**
   * The attack worth caring about most: `users.role_key` is a column, and if a signed-in stylist
   * can update their own row they can promote themselves to owner and read the salon's finances.
   * Everything else in the authorisation model rests on this one value being un-writable.
   */
  it('a stylist cannot promote themselves to owner', async () => {
    await asUser(db, A_STYLIST, () =>
      db
        .query(`update public.users set role_key = 'owner' where id = $1`, [A_STYLIST])
        .catch(() => undefined),
    );

    const after = await db.query<{ role_key: string }>(
      `select role_key from public.users where id = $1`,
      [A_STYLIST],
    );
    expect(after.rows[0].role_key).toBe('stylist');
  });

  it('a stylist cannot promote anyone else either', async () => {
    await asUser(db, A_STYLIST, () =>
      db
        .query(`update public.users set role_key = 'owner' where id = $1`, [A_OWNER])
        .catch(() => undefined),
    );
    const after = await db.query<{ role_key: string }>(
      `select role_key from public.users where id = $1`,
      [A_OWNER],
    );
    expect(after.rows[0].role_key).toBe('owner');
  });

  it('a stylist cannot read the salon’s money', async () => {
    const res = await asUser(db, A_STYLIST, () =>
      db.query<{ n: number }>(`select count(*)::int as n from public.payments`),
    );
    expect(res.rows[0].n).toBe(0);
  });
});

/* ── the audit trail ────────────────────────────────────────────────────────────────────── */

describe('the audit trail cannot be edited by the people it records', () => {
  /**
   * An audit trail an operator can rewrite is not a trail. The owner is the right person to test
   * with: they are the most privileged account, and the one with the most reason to tidy history.
   */
  it('an owner cannot insert, update or delete audit rows', async () => {
    const before = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_log`,
    );

    await asUser(db, A_OWNER, () =>
      db
        .query(
          `insert into public.audit_log (tenant_id, table_name, record_id, action)
           values ($1, 'appointments', gen_random_uuid(), 'insert')`,
          [TENANT_ID],
        )
        .catch(() => undefined),
    );
    await asUser(db, A_OWNER, () =>
      db.query(`delete from public.audit_log`).catch(() => undefined),
    );
    await asUser(db, A_OWNER, () =>
      db.query(`update public.audit_log set action = 'insert'`).catch(() => undefined),
    );

    const after = await db.query<{ n: number }>(`select count(*)::int as n from public.audit_log`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

/* ── Phase 3: the anonymous attacker ────────────────────────────────────────────────────── */

describe('an anonymous caller with the public key', () => {
  /**
   * The anon key is published in every browser bundle by design, and PostgREST is reachable
   * directly — so this is not a thought experiment, it is the front door. The app is not in the
   * path and cannot protect anything here. RLS is the whole boundary.
   */
  /** Readable in principle, but every row filtered away by policy. */
  it.each([
    'clients',
    'appointments',
    'payments',
    'users',
    'staff_schedules',
    'client_notes',
    'messages',
    'invoices',
  ])('reads nothing from %s', async (table) => {
    const res = await asAnon(db, () =>
      db.query<{ n: number }>(`select count(*)::int as n from public.${table}`),
    );
    expect(res.rows[0].n).toBe(0);
  });

  /**
   * Two tables go further: the SELECT grant itself is revoked, so anon is refused at the
   * privilege layer before RLS is consulted. Asserted separately rather than folded in above,
   * because "throws" and "returns zero rows" are different guarantees and a test that accepts
   * either would not notice one silently becoming the other.
   */
  it.each(['audit_log', 'expenses'])('is refused outright from %s', async (table) => {
    await expect(
      asAnon(db, () => db.query(`select count(*) from public.${table}`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('still reads the catalogue, which is the point of the public key', async () => {
    const res = await asAnon(db, () =>
      db.query<{ n: number }>(`select count(*)::int as n from public.services`),
    );
    expect(res.rows[0].n).toBeGreaterThan(0);
  });

  /**
   * The assertion that nearly gave a false result.
   *
   * An UPDATE that RLS filters to zero rows **resolves** — it changes nothing and reports
   * success. A test that expected it to throw would have failed here and looked like a
   * vulnerability, and a test written the other way round would pass just as happily if the write
   * had actually landed. Neither says anything. The data does.
   */
  it('changes nothing in the catalogue it is allowed to read', async () => {
    const before = await db.query<{ price_min: string; name: string }>(
      `select price_min, name from public.services where slug = 'coupe'`,
    );

    await asAnon(db, async () => {
      for (const sql of [
        `update public.services set price_min = 1 where slug = 'coupe'`,
        `update public.services set name = 'HACKED' where slug = 'coupe'`,
        `delete from public.services where slug = 'coupe'`,
      ]) {
        await db.query(sql).catch(() => undefined);
      }
    });

    const after = await db.query<{ price_min: string; name: string }>(
      `select price_min, name from public.services where slug = 'coupe'`,
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].price_min).toBe(before.rows[0].price_min);
    expect(after.rows[0].name).toBe(before.rows[0].name);
  });

  it('is refused outright when inserting into the catalogue', async () => {
    await expect(
      asAnon(db, () =>
        db.query(
          `insert into public.services (tenant_id, category_id, slug, name, kind, price_min)
           select tenant_id, category_id, 'evil', 'Evil', kind, 1 from public.services limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
