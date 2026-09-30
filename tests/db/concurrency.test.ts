/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, inDays, TENANT_ID, type TestDb } from './harness';

let db: TestDb;

const OWNER = '60000000-0000-4000-8000-00000000000a';
const RECEPTION = '60000000-0000-4000-8000-00000000000b';

/**
 * Phases 7 and 8: data integrity under concurrency, and business rules the database must hold on
 * its own.
 *
 * Double-booking is already proven elsewhere, in PGlite and against the live project — an
 * exclusion constraint makes it impossible rather than unlikely. The question this file asks is
 * whether the *rest* of the money and stock surface is defended the same way, or whether the
 * booking path is the only one that was thought about.
 *
 * PGlite is single-connection, so two statements cannot genuinely race here. That matters and is
 * worth saying plainly: what these tests establish is whether a **constraint** exists to catch the
 * losing write, not that Postgres arbitrates correctly between two live sessions — Postgres does.
 * A rule enforced by a check or a unique index holds under concurrency; a rule enforced by reading
 * a value and then writing a decision based on it does not, and the difference is visible in the
 * schema rather than in a stopwatch.
 */

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });
  await createUser(db, { id: RECEPTION, role: 'reception', name: 'Reception' });
  await db.query(`update public.services set duration_minutes = 30 where slug = 'coupe'`);

  /*
   * The shelf is not seeded and the tariff is, which is correct: §6 knows the published prices
   * and has never been told what the salon keeps in its cupboards. So the stock tests bring
   * their own product rather than assuming one.
   */
  await db.query(
    `insert into public.products (tenant_id, slug, name, unit, is_active)
     values ($1, 'test-oxydant', 'Oxydant test', 'piece', true)`,
    [TENANT_ID],
  );
}, 120_000);

/* ── money ─────────────────────────────────────────────────────────────────────────────── */

describe('money cannot be made up', () => {
  /** A negative payment is a refund pretending to be a sale, and would flatter every report. */
  it('refuses a negative payment amount', async () => {
    const client = await db.query<{ id: string }>(
      `insert into public.clients (tenant_id, full_name, phone)
       values ($1, 'Neg Test', '0551230001') returning id`,
      [TENANT_ID],
    );

    await expect(
      db.query(
        `insert into public.payments (tenant_id, client_id, amount, method)
         values ($1, $2, -100000, 'cash')`,
        [TENANT_ID, client.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  /**
   * Reception takes cash at the desk, so they may insert a payment — and must still not be able
   * to read the ledger back. That asymmetry is deliberate and easy to lose in a later policy
   * edit, so it is asserted rather than assumed.
   */
  it('lets reception record a payment without letting them read the ledger', async () => {
    const client = await db.query<{ id: string }>(
      `insert into public.clients (tenant_id, full_name, phone)
       values ($1, 'Desk Client', '0551230002') returning id`,
      [TENANT_ID],
    );

    await asUser(db, RECEPTION, () =>
      db.query(
        `insert into public.payments (tenant_id, client_id, amount, method)
         values ($1, $2, 150000, 'cash')`,
        [TENANT_ID, client.rows[0].id],
      ),
    );

    const seen = await asUser(db, RECEPTION, () =>
      db.query<{ n: number }>(`select count(*)::int as n from public.payments`),
    );
    expect(seen.rows[0].n).toBe(0);

    const actual = await db.query<{ n: number }>(
      `select count(*)::int as n from public.payments where amount = 150000`,
    );
    expect(actual.rows[0].n).toBe(1);
  });
});

/* ── stock ─────────────────────────────────────────────────────────────────────────────── */

describe('stock arithmetic holds', () => {
  /**
   * Stock is the sum of signed movements rather than a stored counter, which is what makes it
   * safe under concurrency: two simultaneous usages are two inserts, and the sum is correct
   * whichever order they land in. A counter read-then-written would lose one of them.
   */
  it('derives quantity from movements, so two writers cannot lose one', async () => {
    const product = await db.query<{ id: string }>(
      `select id from public.products where slug = 'test-oxydant'`,
    );
    const id = product.rows[0].id;

    await db.query(
      `insert into public.stock_movements (tenant_id, product_id, quantity, reason)
       values ($1, $2, 10, 'delivery')`,
      [TENANT_ID, id],
    );
    await Promise.all([
      db.query(
        `insert into public.stock_movements (tenant_id, product_id, quantity, reason)
         values ($1, $2, -3, 'usage')`,
        [TENANT_ID, id],
      ),
      db.query(
        `insert into public.stock_movements (tenant_id, product_id, quantity, reason)
         values ($1, $2, -4, 'usage')`,
        [TENANT_ID, id],
      ),
    ]);

    const sum = await db.query<{ q: string }>(
      `select coalesce(sum(quantity), 0) as q from public.stock_movements where product_id = $1`,
      [id],
    );
    expect(Number(sum.rows[0].q)).toBe(3);
  });

  /** The sign must match the reason, or the history stops explaining the number it produces. */
  it('refuses a delivery that decreases stock, and a usage that increases it', async () => {
    const product = await db.query<{ id: string }>(
      `select id from public.products where slug = 'test-oxydant'`,
    );
    const id = product.rows[0].id;

    await expect(
      db.query(
        `insert into public.stock_movements (tenant_id, product_id, quantity, reason)
         values ($1, $2, -5, 'delivery')`,
        [TENANT_ID, id],
      ),
    ).rejects.toThrow();

    await expect(
      db.query(
        `insert into public.stock_movements (tenant_id, product_id, quantity, reason)
         values ($1, $2, 5, 'usage')`,
        [TENANT_ID, id],
      ),
    ).rejects.toThrow();
  });
});

/* ── business rules on the booking path ────────────────────────────────────────────────── */

describe('a booking cannot be talked into an impossible state', () => {
  /** Already proven for the public path; asserted here for the one reception uses all day. */
  it('refuses the same slot twice through the console path', async () => {
    const start = inDays(12, '11:00');

    await asUser(db, RECEPTION, () =>
      db.query(
        `select * from public.book_appointment_as_staff('salon','coupe','nour',$1::timestamptz,
                                                        null,'Une Cliente','0551230010',null,'confirmed')`,
        [start],
      ),
    );

    await expect(
      asUser(db, RECEPTION, () =>
        db.query(
          `select * from public.book_appointment_as_staff('salon','coupe','nour',$1::timestamptz,
                                                          null,'Autre Cliente','0551230011',null,'confirmed')`,
          [start],
        ),
      ),
    ).rejects.toThrow(/booking_slot_taken/);
  });

  /**
   * The exclusion constraint is the guarantee, so it has to hold for a row written directly —
   * not only for one that went through the function. A policy or an RPC can be bypassed by
   * anyone with table access; a constraint cannot.
   */
  it('refuses an overlapping appointment written straight to the table', async () => {
    const client = await db.query<{ id: string }>(
      `insert into public.clients (tenant_id, full_name, phone)
       values ($1, 'Direct Write', '0551230012') returning id`,
      [TENANT_ID],
    );
    const staff = await db.query<{ id: string }>(
      `select id from public.staff where slug = 'sophie'`,
    );

    const period = `tstzrange(now() + interval '20 days', now() + interval '20 days 1 hour', '[)')`;
    await db.query(
      `insert into public.appointments (tenant_id, client_id, staff_id, line, status, period)
       values ($1, $2, $3, 'salon', 'confirmed', ${period})`,
      [TENANT_ID, client.rows[0].id, staff.rows[0].id],
    );

    await expect(
      db.query(
        `insert into public.appointments (tenant_id, client_id, staff_id, line, status, period)
         values ($1, $2, $3, 'salon', 'confirmed',
                 tstzrange(now() + interval '20 days 30 minutes',
                           now() + interval '20 days 90 minutes', '[)'))`,
        [TENANT_ID, client.rows[0].id, staff.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  /**
   * A cancelled appointment must release its slot, or a day fills up with bookings nobody is
   * coming to. The constraint is partial on status for exactly this reason.
   */
  it('releases the slot when an appointment is cancelled', async () => {
    const client = await db.query<{ id: string }>(
      `insert into public.clients (tenant_id, full_name, phone)
       values ($1, 'Cancels', '0551230013') returning id`,
      [TENANT_ID],
    );
    const staff = await db.query<{ id: string }>(`select id from public.staff where slug = 'nour'`);
    const period = `tstzrange(now() + interval '25 days', now() + interval '25 days 1 hour', '[)')`;

    const first = await db.query<{ id: string }>(
      `insert into public.appointments (tenant_id, client_id, staff_id, line, status, period)
       values ($1, $2, $3, 'salon', 'confirmed', ${period}) returning id`,
      [TENANT_ID, client.rows[0].id, staff.rows[0].id],
    );

    await db.query(`update public.appointments set status = 'cancelled' where id = $1`, [
      first.rows[0].id,
    ]);

    // The same hour is now free for somebody else.
    await expect(
      db.query(
        `insert into public.appointments (tenant_id, client_id, staff_id, line, status, period)
         values ($1, $2, $3, 'salon', 'confirmed', ${period})`,
        [TENANT_ID, client.rows[0].id, staff.rows[0].id],
      ),
    ).resolves.toBeTruthy();
  });
});
