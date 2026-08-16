/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, TENANT_ID, type TestDb } from './harness';

let db: TestDb;

const OWNER = '20000000-0000-4000-8000-000000000001';
const RECEPTION = '20000000-0000-4000-8000-000000000002';

const DA = (dinars: number) => dinars * 100;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });
  await createUser(db, { id: RECEPTION, role: 'reception', name: 'Reception' });
}, 120_000);

/* ── The tariff ─────────────────────────────────────────────────────────────────────────── */

describe('managing the tariff', () => {
  it('lets an owner set the duration that unblocks real bookings', async () => {
    await asUser(db, OWNER, () =>
      db.query(
        `select public.upsert_service('coupe', 'coiffure', 'Coupe', 'fixed', $1, null, 30, 0, true)`,
        [DA(700)],
      ),
    );

    const row = await db.query<{ duration_minutes: number; price_min: string }>(
      `select duration_minutes, price_min from public.services where slug = 'coupe'`,
    );
    expect(row.rows[0].duration_minutes).toBe(30);
    expect(Number(row.rows[0].price_min)).toBe(DA(700));
  });

  it('creates a new service', async () => {
    await asUser(db, OWNER, () =>
      db.query(
        `select public.upsert_service('soin-nouveau', 'soin-de-visage', 'Soin nouveau', 'fixed', $1, null, 45, 10, true)`,
        [DA(4200)],
      ),
    );
    const row = await db.query<{ name: string; buffer_minutes: number }>(
      `select name, buffer_minutes from public.services where slug = 'soin-nouveau'`,
    );
    expect(row.rows[0].name).toBe('Soin nouveau');
    expect(row.rows[0].buffer_minutes).toBe(10);
  });

  it('refuses a price shape that would render wrongly', async () => {
    // A range with no upper bound would read "14 000 – undefined".
    await expect(
      asUser(db, OWNER, () =>
        db.query(
          `select public.upsert_service('bad', 'coiffure', 'Bad', 'range', $1, null, null, 0, true)`,
          [DA(100)],
        ),
      ),
    ).rejects.toThrow(/service_invalid_range/);

    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.upsert_service('bad2', 'coiffure', 'Bad', 'free', $1, null, null, 0, true)`, [DA(100)]),
      ),
    ).rejects.toThrow(/service_free_has_price/);
  });

  it('rejects an unknown category and an empty name', async () => {
    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.upsert_service('x', 'nope', 'X', 'fixed', 100, null, null, 0, true)`),
      ),
    ).rejects.toThrow(/service_unknown_category/);

    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.upsert_service('y', 'coiffure', '  ', 'fixed', 100, null, null, 0, true)`),
      ),
    ).rejects.toThrow(/service_invalid_name/);
  });

  /** History must survive: a booked service is what a client was charged. */
  it('archives rather than deletes', async () => {
    await asUser(db, OWNER, () => db.query(`select public.archive_service('babyboomer', true)`));
    const row = await db.query<{ is_active: boolean }>(
      `select is_active from public.services where slug = 'babyboomer'`,
    );
    expect(row.rows[0].is_active).toBe(false);

    await asUser(db, OWNER, () => db.query(`select public.archive_service('babyboomer', false)`));
    const back = await db.query<{ is_active: boolean }>(
      `select is_active from public.services where slug = 'babyboomer'`,
    );
    expect(back.rows[0].is_active).toBe(true);
  });

  /** Non-negotiable #5 reaching the new write paths. */
  it('refuses reception, through RLS rather than a role check', async () => {
    await expect(
      asUser(db, RECEPTION, () =>
        db.query(
          `select public.upsert_service('coupe', 'coiffure', 'Hacked', 'fixed', 1, null, null, 0, true)`,
        ),
      ),
    ).rejects.toThrow();
  });
});

/* ── Opening hours ──────────────────────────────────────────────────────────────────────── */

describe('opening hours', () => {
  it('replaces the whole week at once', async () => {
    const week = JSON.stringify([
      { weekday: 0, opens_at: '09:00', closes_at: '18:00', is_closed: false },
      { weekday: 1, opens_at: '09:00', closes_at: '19:00', is_closed: false },
      { weekday: 5, is_closed: true },
    ]);
    const res = await asUser(db, OWNER, () =>
      db.query<{ set_business_hours: number }>(`select public.set_business_hours($1::jsonb)`, [week]),
    );
    expect(res.rows[0].set_business_hours).toBe(3);

    const rows = await db.query<{ count: number }>(
      'select count(*)::int as count from public.business_hours',
    );
    expect(rows.rows[0].count).toBe(3);
  });

  it('refuses a day that closes before it opens', async () => {
    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.set_business_hours($1::jsonb)`, [
          JSON.stringify([{ weekday: 2, opens_at: '18:00', closes_at: '09:00', is_closed: false }]),
        ]),
      ),
    ).rejects.toThrow(/hours_backwards/);
  });

  it('refuses an open day with no hours', async () => {
    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.set_business_hours($1::jsonb)`, [
          JSON.stringify([{ weekday: 3, is_closed: false }]),
        ]),
      ),
    ).rejects.toThrow(/hours_incomplete/);
  });
});

/* ── Products and stock ─────────────────────────────────────────────────────────────────── */

describe('products and stock', () => {
  beforeAll(async () => {
    await asUser(db, OWNER, () =>
      db.query(
        `select public.upsert_product('coloration-6-0', 'Coloration 6.0', 'Marque', 'salon', 'piece', $1, 5, true)`,
        [DA(1200)],
      ),
    );
  });

  it('derives stock from movements rather than storing a counter', async () => {
    await asUser(db, OWNER, () =>
      db.query(`select public.record_stock_movement('coloration-6-0', 12, 'delivery', $1, null, null)`, [
        DA(14400),
      ]),
    );
    await asUser(db, OWNER, () =>
      db.query(`select public.record_stock_movement('coloration-6-0', -2, 'usage', null, null, null)`),
    );

    const stock = await db.query<{ on_hand: string; needs_reorder: boolean }>(
      `select on_hand, needs_reorder from public.product_stock where slug = 'coloration-6-0'`,
    );
    expect(Number(stock.rows[0].on_hand)).toBe(10);
    expect(stock.rows[0].needs_reorder).toBe(false);
  });

  it('flags a product once it reaches its reorder level', async () => {
    await asUser(db, OWNER, () =>
      db.query(`select public.record_stock_movement('coloration-6-0', -5, 'usage', null, null, null)`),
    );
    const alerts = await asUser(db, OWNER, () =>
      db.query<{ slug: string }>(`select slug from public.stock_alerts()`),
    );
    expect(alerts.rows.map((r) => r.slug)).toContain('coloration-6-0');
  });

  /** The sign cannot contradict the reason: a "delivery" that removes stock is a data error. */
  it('refuses a movement whose sign contradicts its reason', async () => {
    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.record_stock_movement('coloration-6-0', -1, 'delivery', null, null, null)`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, OWNER, () =>
        db.query(`select public.record_stock_movement('coloration-6-0', 1, 'usage', null, null, null)`),
      ),
    ).rejects.toThrow();
  });

  /** A delivery that cost money must appear in the money going out, exactly once. */
  it('turns a paid delivery into an expense, linked and never doubled', async () => {
    const expenses = await db.query<{ count: number; amount: string; category: string }>(
      `select count(*)::int as count, max(amount) as amount, max(category::text) as category
       from public.expenses where stock_movement_id is not null`,
    );
    expect(expenses.rows[0].count).toBe(1);
    expect(Number(expenses.rows[0].amount)).toBe(DA(14400));
    expect(expenses.rows[0].category).toBe('stock');
  });

  it('lets reception record usage but not change what a product costs', async () => {
    await expect(
      asUser(db, RECEPTION, () =>
        db.query(`select public.record_stock_movement('coloration-6-0', -1, 'usage', null, null, null)`),
      ),
    ).resolves.toBeDefined();

    await expect(
      asUser(db, RECEPTION, () =>
        db.query(
          `select public.upsert_product('coloration-6-0', 'Coloration 6.0', null, null, 'piece', 1, null, true)`,
        ),
      ),
    ).rejects.toThrow();
  });
});

/* ── Money ──────────────────────────────────────────────────────────────────────────────── */

describe('money flow', () => {
  beforeAll(async () => {
    const client = await db.query<{ id: string }>(
      `insert into public.clients (tenant_id, full_name, phone) values ($1, 'Cliente Argent', '0556000001') returning id`,
      [TENANT_ID],
    );
    const clientId = client.rows[0].id;

    const appt = async (line: string, day: string) => {
      const a = await db.query<{ id: string }>(
        `insert into public.appointments (tenant_id, client_id, line, status, period)
         values ($1, $2, $3::public.business_line, 'completed',
                 tstzrange($4::timestamptz, ($4::timestamptz + interval '1 hour'), '[)'))
         returning id`,
        [TENANT_ID, clientId, line, `${day}T09:00:00Z`],
      );
      return a.rows[0].id;
    };

    const salon = await appt('salon', '2026-08-03');
    const bridal = await appt('bridal', '2026-08-04');

    await db.query(
      `insert into public.payments (tenant_id, client_id, appointment_id, amount, status, paid_at)
       values ($1, $2, $3, $4, 'paid', '2026-08-03T10:00:00Z')`,
      [TENANT_ID, clientId, salon, DA(1500)],
    );
    await db.query(
      `insert into public.payments (tenant_id, client_id, appointment_id, amount, status, paid_at)
       values ($1, $2, $3, $4, 'paid', '2026-08-04T10:00:00Z')`,
      [TENANT_ID, clientId, bridal, DA(40000)],
    );

    // The creator brand earns through an invoiced collaboration, not an appointment.
    const deal = await db.query<{ id: string }>(
      `insert into public.brand_deals (tenant_id, brand_name, stage) values ($1, 'Une marque', 'delivered') returning id`,
      [TENANT_ID],
    );
    await db.query(
      `insert into public.invoices (tenant_id, deal_id, reference, amount, status, issued_on, paid_on)
       values ($1, $2, 'INV-1', $3, 'paid', '2026-08-05', '2026-08-05')`,
      [TENANT_ID, deal.rows[0].id, DA(60000)],
    );

    await asUser(db, OWNER, () =>
      db.query(`select public.record_expense('rent', 'Loyer août', $1, '2026-08-01', null, null)`, [
        DA(30000),
      ]),
    );
  });

  it('answers which of the three businesses earns most', async () => {
    const res = await asUser(db, OWNER, () =>
      db.query<{ line: string; revenue: string }>(
        `select line, revenue from public.revenue_by_line('2026-08-01', '2026-08-31')`,
      ),
    );
    const byLine = Object.fromEntries(res.rows.map((r) => [r.line, Number(r.revenue)]));

    expect(byLine.creator).toBe(DA(60000));
    expect(byLine.bridal).toBe(DA(40000));
    expect(byLine.salon).toBe(DA(1500));
    // Ordered richest first, which is the question being asked.
    expect(res.rows[0].line).toBe('creator');
  });

  it('reports money in and out per day', async () => {
    const res = await asUser(db, OWNER, () =>
      db.query<{ on_date: string; revenue: string; spend: string }>(
        `select on_date::text, revenue, spend from public.cash_flow('2026-08-01', '2026-08-06')`,
      ),
    );
    expect(res.rows).toHaveLength(6);
    const byDate = Object.fromEntries(res.rows.map((r) => [r.on_date, [Number(r.revenue), Number(r.spend)]]));
    expect(byDate['2026-08-01']).toEqual([0, DA(30000)]);
    expect(byDate['2026-08-03']).toEqual([DA(1500), 0]);
    expect(byDate['2026-08-05']).toEqual([DA(60000), 0]);
  });

  it('keeps shared costs out of any one business line', async () => {
    const res = await asUser(db, OWNER, () =>
      db.query<{ category: string; line: string; total: string }>(
        `select category, line, total from public.expense_summary('2026-08-01', '2026-08-31')`,
      ),
    );
    const rent = res.rows.find((r) => r.category === 'rent');
    // Rent belongs to the business, not to hair — attributing it would flatter bridal.
    expect(rent?.line).toBe('shared');
  });

  it('shows reception none of it', async () => {
    const res = await asUser(db, RECEPTION, () =>
      db.query<{ line: string }>(`select line from public.revenue_by_line('2026-08-01', '2026-08-31')`),
    );
    expect(res.rows).toEqual([]);
  });
});

/* ── The unknowns, counted ──────────────────────────────────────────────────────────────── */

describe('data_gaps', () => {
  it('counts what nobody has told us yet', async () => {
    const res = await asUser(db, OWNER, () =>
      db.query<{ gap: string; missing: number }>(`select gap, missing from public.data_gaps()`),
    );
    const gaps = Object.fromEntries(res.rows.map((r) => [r.gap, r.missing]));

    // Two services were given durations above; the rest of the seeded tariff still has none.
    expect(gaps.service_duration).toBeGreaterThan(0);
    expect(gaps.gown_rental_price).toBe(3);
    // Hours were set earlier in this file, so that gap is closed.
    expect(gaps.opening_hours).toBe(0);
  });
});
