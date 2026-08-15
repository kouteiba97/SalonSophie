/**
 * @vitest-environment node
 *
 * PGlite loads its WASM and extension bundles through real Node streams; jsdom's Response shim
 * lacks arrayBuffer(), so this file opts out of the default jsdom environment.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  asAnon,
  asUser,
  createClient,
  createTestDb,
  createUser,
  EXCLUSION_VIOLATION,
  gownIdBySlug,
  TENANT_ID,
  type TestDb,
} from './harness';

let db: TestDb;

const OWNER = '10000000-0000-4000-8000-000000000001';
const RECEPTION = '10000000-0000-4000-8000-000000000002';
const STYLIST_A = '10000000-0000-4000-8000-000000000003';
const STYLIST_B = '10000000-0000-4000-8000-000000000004';

let stylistAStaff: string;
let stylistBStaff: string;
let clientOfA: string;
let clientOfB: string;

beforeAll(async () => {
  db = await createTestDb();

  await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });
  await createUser(db, { id: RECEPTION, role: 'reception', name: 'Reception' });
  const a = await createUser(db, { id: STYLIST_A, role: 'stylist', name: 'Nour', staffSlug: 'nour' });
  const b = await createUser(db, { id: STYLIST_B, role: 'stylist', name: 'Amel', staffSlug: 'amel' });

  stylistAStaff = a.staffId!;
  stylistBStaff = b.staffId!;

  clientOfA = await createClient(db, 'Cliente A', '0551111111');
  clientOfB = await createClient(db, 'Cliente B', '0552222222');

  await db.query(
    `insert into public.appointments (tenant_id, client_id, staff_id, period, status)
     values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz), 'confirmed')`,
    [TENANT_ID, clientOfA, stylistAStaff, '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z'],
  );

  await db.query(
    `insert into public.appointments (tenant_id, client_id, staff_id, period, status)
     values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz), 'confirmed')`,
    [TENANT_ID, clientOfB, stylistBStaff, '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z'],
  );
}, 120_000);

describe('migrations', () => {
  it('apply cleanly against real Postgres', async () => {
    const res = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    // Every table named in §7, plus tenants and business_hour_exceptions.
    expect(res.rows[0].count).toBeGreaterThanOrEqual(33);
  });

  it('has RLS enabled and forced on every public table', async () => {
    const res = await db.query<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (c.relrowsecurity = false or c.relforcerowsecurity = false)`,
    );
    expect(res.rows.map((r) => r.relname)).toEqual([]);
  });
});

/**
 * Non-negotiable #1. This is the single most important test in the project: a double-booked gown
 * is discovered on the wedding day and cannot be fixed.
 */
describe('gown double-booking is impossible at the database level', () => {
  const book = (gownId: string, clientId: string, from: string, to: string, status = 'confirmed') =>
    db.query(
      `insert into public.gown_reservations (tenant_id, gown_id, client_id, period, status)
       values ($1, $2, $3, daterange($4::date, $5::date), $6::public.reservation_status)`,
      [TENANT_ID, gownId, clientId, from, to, status],
    );

  let anastasia: string;
  let abir: string;

  beforeAll(async () => {
    anastasia = await gownIdBySlug(db, 'anastasia');
    abir = await gownIdBySlug(db, 'abir');
    await book(anastasia, clientOfA, '2026-11-01', '2026-11-06');
  });

  it.each([
    ['an overlapping range', '2026-11-04', '2026-11-09'],
    ['a fully contained range', '2026-11-02', '2026-11-03'],
    ['an identical range', '2026-11-01', '2026-11-06'],
    ['a range that swallows it', '2026-10-28', '2026-11-12'],
  ])('rejects %s', async (_label, from, to) => {
    await expect(book(anastasia, clientOfB, from, to)).rejects.toMatchObject({
      code: EXCLUSION_VIOLATION,
    });
  });

  it('allows an adjacent range, because daterange is half-open', async () => {
    await expect(book(anastasia, clientOfB, '2026-11-06', '2026-11-10')).resolves.toBeDefined();
  });

  it('allows the same dates on a different gown', async () => {
    await expect(book(abir, clientOfB, '2026-11-01', '2026-11-06')).resolves.toBeDefined();
  });

  it('releases the dates once a reservation is cancelled', async () => {
    const gown = await gownIdBySlug(db, 'ryma');
    await book(gown, clientOfA, '2026-12-01', '2026-12-05');

    await expect(book(gown, clientOfB, '2026-12-02', '2026-12-04')).rejects.toMatchObject({
      code: EXCLUSION_VIOLATION,
    });

    await db.query(
      `update public.gown_reservations set status = 'cancelled'
       where gown_id = $1 and lower(period) = '2026-12-01'::date`,
      [gown],
    );

    // A cancelled reservation falls outside the constraint's WHERE clause.
    await expect(book(gown, clientOfB, '2026-12-02', '2026-12-04')).resolves.toBeDefined();
  });

  it('holds a gown as firmly as a confirmed booking', async () => {
    const gown = await gownIdBySlug(db, 'abir');
    await book(gown, clientOfA, '2027-01-10', '2027-01-14', 'held');
    await expect(book(gown, clientOfB, '2027-01-11', '2027-01-13')).rejects.toMatchObject({
      code: EXCLUSION_VIOLATION,
    });
  });

  it('refuses an empty period', async () => {
    const gown = await gownIdBySlug(db, 'anastasia');
    await expect(book(gown, clientOfA, '2027-03-01', '2027-03-01')).rejects.toThrow();
  });
});

/** §5.3 item 9 — two clients must never take one slot. */
describe('appointment double-booking', () => {
  it('rejects an overlapping appointment for the same staff member', async () => {
    await expect(
      db.query(
        `insert into public.appointments (tenant_id, client_id, staff_id, period, status)
         values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz), 'confirmed')`,
        [TENANT_ID, clientOfB, stylistAStaff, '2026-10-01T09:30:00Z', '2026-10-01T10:30:00Z'],
      ),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it('allows the same hour for a different staff member', async () => {
    await expect(
      db.query(
        `insert into public.appointments (tenant_id, client_id, staff_id, period, status)
         values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz), 'confirmed')`,
        [TENANT_ID, clientOfA, stylistBStaff, '2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z'],
      ),
    ).resolves.toBeDefined();
  });

  it('frees the slot when an appointment is cancelled', async () => {
    await db.query(
      `insert into public.appointments (tenant_id, client_id, staff_id, period, status)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz), 'cancelled')`,
      [TENANT_ID, clientOfB, stylistAStaff, '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z'],
    );
    // The cancelled row coexists with the confirmed one; only active statuses collide.
    const res = await db.query<{ count: number }>(
      `select count(*)::int as count from public.appointments
       where staff_id = $1 and period && tstzrange($2::timestamptz, $3::timestamptz)`,
      [stylistAStaff, '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z'],
    );
    expect(res.rows[0].count).toBe(2);
  });
});

/** Non-negotiable #5 — enforced by policies, not middleware. */
describe('row level security', () => {
  // Dedicated clients, so this suite does not depend on what earlier suites happened to insert.
  // A stylist who has *any* appointment with a client can see them — including a cancelled one,
  // which is deliberate: they may need to follow up on it.
  let onlyStylistA: string;
  let onlyStylistB: string;

  beforeAll(async () => {
    onlyStylistA = await createClient(db, 'Exclusive A', '0553330001');
    onlyStylistB = await createClient(db, 'Exclusive B', '0553330002');

    await db.query(
      `insert into public.appointments (tenant_id, client_id, staff_id, period)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz))`,
      [TENANT_ID, onlyStylistA, stylistAStaff, '2027-02-01T09:00:00Z', '2027-02-01T10:00:00Z'],
    );
    await db.query(
      `insert into public.appointments (tenant_id, client_id, staff_id, period)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz))`,
      [TENANT_ID, onlyStylistB, stylistBStaff, '2027-02-01T09:00:00Z', '2027-02-01T10:00:00Z'],
    );
  });

  it('lets an anonymous visitor read the catalogue', async () => {
    const services = await asAnon(db, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.services'),
    );
    expect(services.rows[0].count).toBe(55);

    const gowns = await asAnon(db, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.gowns'),
    );
    expect(gowns.rows[0].count).toBe(3);
  });

  it('shows an anonymous visitor no clients and no appointments', async () => {
    const clients = await asAnon(db, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.clients'),
    );
    expect(clients.rows[0].count).toBe(0);

    const appts = await asAnon(db, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.appointments'),
    );
    expect(appts.rows[0].count).toBe(0);
  });

  it('shows a stylist only their own appointments', async () => {
    const mine = await asUser(db, STYLIST_A, () =>
      db.query<{ staff_id: string }>('select staff_id from public.appointments'),
    );
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(new Set(mine.rows.map((r) => r.staff_id))).toEqual(new Set([stylistAStaff]));
  });

  it("shows a stylist only their own clients", async () => {
    const visible = await asUser(db, STYLIST_A, () =>
      db.query<{ id: string }>('select id from public.clients'),
    );
    const ids = visible.rows.map((r) => r.id);
    expect(ids).toContain(onlyStylistA);
    expect(ids).not.toContain(onlyStylistB);
  });

  it('shows reception every client', async () => {
    const visible = await asUser(db, RECEPTION, () =>
      db.query<{ id: string }>('select id from public.clients'),
    );
    const ids = visible.rows.map((r) => r.id);
    expect(ids).toContain(onlyStylistA);
    expect(ids).toContain(onlyStylistB);
  });

  it('shows reception every calendar', async () => {
    const all = await asUser(db, RECEPTION, () =>
      db.query<{ staff_id: string }>('select staff_id from public.appointments'),
    );
    const staffSeen = new Set(all.rows.map((r) => r.staff_id));
    expect(staffSeen.has(stylistAStaff)).toBe(true);
    expect(staffSeen.has(stylistBStaff)).toBe(true);
  });

  it('hides brand deals from reception, and shows them to the owner', async () => {
    await db.query(
      `insert into public.brand_deals (tenant_id, brand_name, stage, value_amount)
       values ($1, 'A Brand', 'negotiating', 15000000)`,
      [TENANT_ID],
    );

    const asReception = await asUser(db, RECEPTION, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.brand_deals'),
    );
    expect(asReception.rows[0].count).toBe(0);

    const asOwner = await asUser(db, OWNER, () =>
      db.query<{ count: number }>('select count(*)::int as count from public.brand_deals'),
    );
    expect(asOwner.rows[0].count).toBe(1);
  });

  it('hides payments from reception and stylists', async () => {
    await db.query(
      `insert into public.payments (tenant_id, client_id, amount, method, status)
       values ($1, $2, 700000, 'cash', 'paid')`,
      [TENANT_ID, clientOfA],
    );

    for (const actor of [RECEPTION, STYLIST_A]) {
      const res = await asUser(db, actor, () =>
        db.query<{ count: number }>('select count(*)::int as count from public.payments'),
      );
      expect(res.rows[0].count).toBe(0);
    }
  });

  it('stops a stylist creating an appointment for another stylist', async () => {
    await expect(
      asUser(db, STYLIST_A, () =>
        db.query(
          `insert into public.appointments (tenant_id, client_id, staff_id, period)
           values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz))`,
          [TENANT_ID, clientOfA, stylistBStaff, '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'],
        ),
      ),
    ).rejects.toThrow();
  });

  it('lets reception book an appointment', async () => {
    await expect(
      asUser(db, RECEPTION, () =>
        db.query(
          `insert into public.appointments (tenant_id, client_id, staff_id, period)
           values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz))`,
          [TENANT_ID, clientOfA, stylistAStaff, '2026-10-06T09:00:00Z', '2026-10-06T10:00:00Z'],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('keeps the audit trail unwritable through the API roles', async () => {
    await expect(
      asUser(db, OWNER, () =>
        db.query(
          `insert into public.audit_log (tenant_id, table_name, action)
           values ($1, 'appointments', 'insert')`,
          [TENANT_ID],
        ),
      ),
    ).rejects.toThrow();
  });
});

/** Non-negotiable #9. */
describe('audit_log', () => {
  it('records every mutation to appointments, reservations and payments', async () => {
    const res = await db.query<{ table_name: string; action: string; count: number }>(
      `select table_name, action::text as action, count(*)::int as count
       from public.audit_log group by 1, 2 order by 1, 2`,
    );

    const seen = new Set(res.rows.map((r) => r.table_name));
    expect(seen.has('appointments')).toBe(true);
    expect(seen.has('gown_reservations')).toBe(true);
    expect(seen.has('payments')).toBe(true);
  });

  it('records the changed fields on an update, ignoring updated_at', async () => {
    const appt = await db.query<{ id: string }>(
      `insert into public.appointments (tenant_id, client_id, staff_id, period)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz)) returning id`,
      [TENANT_ID, clientOfA, stylistAStaff, '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z'],
    );
    const id = appt.rows[0].id;

    await db.query(`update public.appointments set status = 'confirmed' where id = $1`, [id]);

    const audit = await db.query<{ changed_fields: string[] }>(
      `select changed_fields from public.audit_log
       where record_id = $1 and action = 'update' order by created_at desc limit 1`,
      [id],
    );

    expect(audit.rows[0].changed_fields).toEqual(['status']);
  });

  it('writes no row for an update that changed nothing', async () => {
    const appt = await db.query<{ id: string }>(
      `insert into public.appointments (tenant_id, client_id, staff_id, period)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz)) returning id`,
      [TENANT_ID, clientOfB, stylistBStaff, '2026-11-21T09:00:00Z', '2026-11-21T10:00:00Z'],
    );
    const id = appt.rows[0].id;

    await db.query(`update public.appointments set status = status where id = $1`, [id]);

    const audit = await db.query<{ count: number }>(
      `select count(*)::int as count from public.audit_log
       where record_id = $1 and action = 'update'`,
      [id],
    );
    expect(audit.rows[0].count).toBe(0);
  });
});

/** Non-negotiable #2, enforced in the schema rather than only in the app. */
describe('seeded catalogue', () => {
  it('seeds the real published tariff', async () => {
    const categories = await db.query<{ count: number }>(
      'select count(*)::int as count from public.service_categories',
    );
    expect(categories.rows[0].count).toBe(8);

    const services = await db.query<{ count: number }>(
      'select count(*)::int as count from public.services',
    );
    expect(services.rows[0].count).toBe(55);

    const coupe = await db.query<{ price_min: string; kind: string }>(
      `select price_min, kind::text as kind from public.services where slug = 'coupe'`,
    );
    // 700 DA in centimes.
    expect(Number(coupe.rows[0].price_min)).toBe(70000);
    expect(coupe.rows[0].kind).toBe('fixed');

    const soins = await db.query<{ price_min: string; price_max: string }>(
      `select price_min, price_max from public.services where slug = 'soins-capillaires'`,
    );
    expect(Number(soins.rows[0].price_min)).toBe(1400000);
    expect(Number(soins.rows[0].price_max)).toBe(3500000);
  });

  it('invents no service durations', async () => {
    const res = await db.query<{ count: number }>(
      'select count(*)::int as count from public.services where duration_minutes is not null',
    );
    expect(res.rows[0].count).toBe(0);
  });

  it('invents no gown rental prices', async () => {
    const res = await db.query<{ count: number }>(
      'select count(*)::int as count from public.gowns where rental_price is not null',
    );
    expect(res.rows[0].count).toBe(0);
  });

  it('invents no opening hours', async () => {
    const res = await db.query<{ count: number }>(
      'select count(*)::int as count from public.business_hours',
    );
    expect(res.rows[0].count).toBe(0);
  });

  it('seeds only the two confirmed sisters as bookable staff', async () => {
    const res = await db.query<{ slug: string }>(
      `select slug from public.staff where slug in ('amina', 'lynda')`,
    );
    expect(res.rows).toEqual([]);
  });

  it('shows every gown its discrete sizes', async () => {
    const res = await db.query<{ slug: string; sizes: number[] }>(
      `select g.slug, array_agg(s.size order by s.size) as sizes
       from public.gowns g join public.gown_sizes s on s.gown_id = g.id
       group by g.slug order by g.slug`,
    );
    const bySlug = Object.fromEntries(res.rows.map((r) => [r.slug, r.sizes]));
    expect(bySlug.anastasia).toEqual([36, 38, 40, 42]);
    expect(bySlug.abir).toEqual([38, 40, 42, 44]);
    expect(bySlug.ryma).toEqual([36, 38, 40]);
  });

  it('rejects a price shape that would render as a wrong number', async () => {
    const category = await db.query<{ id: string }>(
      `select id from public.service_categories where slug = 'coiffure'`,
    );
    // 'range' without an upper bound would render "14 000 – undefined".
    await expect(
      db.query(
        `insert into public.services (tenant_id, category_id, slug, name, kind, price_min)
         values ($1, $2, 'bad-range', 'Bad', 'range', 100)`,
        [TENANT_ID, category.rows[0].id],
      ),
    ).rejects.toThrow();

    // 'free' with a price is a contradiction.
    await expect(
      db.query(
        `insert into public.services (tenant_id, category_id, slug, name, kind, price_min)
         values ($1, $2, 'bad-free', 'Bad', 'free', 100)`,
        [TENANT_ID, category.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it('rejects a client phone that is not an Algerian mobile', async () => {
    for (const phone of ['0451111111', '12345', '+213551111111']) {
      await expect(createClient(db, 'Bad', phone)).rejects.toThrow();
    }
  });
});
