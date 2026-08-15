/**
 * @vitest-environment node
 *
 * Phase 4 against real Postgres.
 *
 * The rule these tests exist for is non-negotiable #1: one physical gown cannot be out twice at
 * once. It is enforced by an exclusion constraint, so it can only be proven by running real
 * Postgres with real `btree_gist` — a mock would assert the thing we are trying to check.
 *
 * The RLS cases matter just as much. `reserve_gown` is deliberately not `security definer`, so
 * "reception may read the atelier but not write it" has to hold when reception actually calls
 * it. Running as a superuser would bypass RLS and prove nothing, which is why every one of those
 * cases goes through `asUser`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, gownIdBySlug, TENANT_ID, type TestDb } from './harness';

let db: TestDb;

const OWNER = 'b0000000-0000-4000-8000-000000000001';
const RECEPTION = 'b0000000-0000-4000-8000-000000000002';
const STYLIST = 'b0000000-0000-4000-8000-000000000003';

interface ReservationRow {
  reservation_id: string;
  reference: string;
  client_id: string;
}

/** Every reservation in these tests is taken as the owner, which is the only role that may. */
function reserve(
  opts: {
    gown?: string;
    name?: string;
    phone?: string;
    from: string;
    to: string;
    buffer?: number;
    status?: 'held' | 'confirmed';
    deposit?: number | null;
    notes?: string | null;
    accessories?: string[];
    as?: string;
  },
): Promise<ReservationRow> {
  return asUser(db, opts.as ?? OWNER, async () => {
    const res = await db.query<ReservationRow>(
      `select * from public.reserve_gown($1, $2, $3, $4::date, $5::date, $6::smallint,
                                         $7::public.reservation_status, $8::bigint, $9, $10::text[])`,
      [
        opts.gown ?? 'anastasia',
        opts.name ?? 'Amel Benali',
        opts.phone ?? '0553366712',
        opts.from,
        opts.to,
        opts.buffer ?? 0,
        opts.status ?? 'held',
        opts.deposit ?? null,
        opts.notes ?? null,
        opts.accessories ?? [],
      ],
    );
    return res.rows[0];
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });
  await createUser(db, { id: RECEPTION, role: 'reception', name: 'Reception' });
  await createUser(db, { id: STYLIST, role: 'stylist', name: 'Nour', staffSlug: 'nour' });
}, 120_000);

describe('reserve_gown', () => {
  it('records the reservation, the reference and the bride', async () => {
    const result = await reserve({ gown: 'abir', from: '2027-01-04', to: '2027-01-06' });

    expect(result.reference).toMatch(/^[0-9A-F]{8}$/);

    const row = await db.query<{ period: string; status: string; is_bride: boolean }>(
      `select r.period::text, r.status::text as status, c.is_bride
         from public.gown_reservations r
         join public.clients c on c.id = r.client_id
        where r.id = $1`,
      [result.reservation_id],
    );

    // Half-open: the bride has it on the 4th, 5th and 6th, so the range ends on the 7th.
    expect(row.rows[0].period).toBe('[2027-01-04,2027-01-07)');
    expect(row.rows[0].status).toBe('held');
    // Renting a wedding gown is what makes someone a bride. That is a fact, not a guess.
    expect(row.rows[0].is_bride).toBe(true);
  });

  /** Non-negotiable #1. Everything else in this file is secondary to this case. */
  it('refuses a second reservation overlapping the first', async () => {
    await reserve({ gown: 'ryma', from: '2027-02-01', to: '2027-02-07' });

    await expect(
      reserve({ gown: 'ryma', from: '2027-02-05', to: '2027-02-10', phone: '0661234567' }),
    ).rejects.toThrow(/gown_double_booked/);
  });

  it('refuses a reservation entirely contained by another', async () => {
    await reserve({ gown: 'anastasia', from: '2027-03-01', to: '2027-03-30' });

    await expect(
      reserve({ gown: 'anastasia', from: '2027-03-10', to: '2027-03-12', phone: '0661234568' }),
    ).rejects.toThrow(/gown_double_booked/);
  });

  it('allows the same dates on a different gown', async () => {
    await reserve({ gown: 'abir', from: '2027-04-01', to: '2027-04-05' });
    const other = await reserve({
      gown: 'ryma',
      from: '2027-04-01',
      to: '2027-04-05',
      phone: '0661234569',
    });

    expect(other.reservation_id).toBeTruthy();
  });

  /** Half-open ranges are the point: the next bride may collect the morning after. */
  it('allows an adjacent reservation starting the day after the last', async () => {
    await reserve({ gown: 'abir', from: '2027-05-01', to: '2027-05-03' });
    const next = await reserve({
      gown: 'abir',
      from: '2027-05-04',
      to: '2027-05-06',
      phone: '0661234570',
    });

    expect(next.reservation_id).toBeTruthy();
  });

  describe('cleaning buffer', () => {
    it('extends the stored range so the constraint protects the turnaround', async () => {
      const result = await reserve({
        gown: 'ryma',
        from: '2027-06-01',
        to: '2027-06-03',
        buffer: 2,
      });

      const row = await db.query<{ period: string; cleaning_buffer_days: number }>(
        `select period::text, cleaning_buffer_days from public.gown_reservations where id = $1`,
        [result.reservation_id],
      );

      // Worn to the 3rd, two days of cleaning, so the dress is free on the 6th.
      expect(row.rows[0].period).toBe('[2027-06-01,2027-06-06)');
      // Still recorded separately, so the console can explain an otherwise invisible gap.
      expect(row.rows[0].cleaning_buffer_days).toBe(2);
    });

    it('blocks a reservation that would start inside the buffer', async () => {
      await reserve({ gown: 'anastasia', from: '2027-07-01', to: '2027-07-03', buffer: 3 });

      await expect(
        reserve({ gown: 'anastasia', from: '2027-07-05', to: '2027-07-08', phone: '0661234571' }),
      ).rejects.toThrow(/gown_double_booked/);
    });
  });

  describe('validation', () => {
    it('refuses an unknown gown', async () => {
      await expect(reserve({ gown: 'nope', from: '2027-08-01', to: '2027-08-02' })).rejects.toThrow(
        /reservation_unknown_gown/,
      );
    });

    it('refuses a period that ends before it starts', async () => {
      await expect(
        reserve({ gown: 'abir', from: '2027-08-10', to: '2027-08-04' }),
      ).rejects.toThrow(/reservation_invalid_period/);
    });

    it('refuses a rental in the past', async () => {
      await expect(reserve({ gown: 'abir', from: '2020-01-01', to: '2020-01-05' })).rejects.toThrow(
        /reservation_in_the_past/,
      );
    });

    it('refuses a phone number that is not an Algerian mobile', async () => {
      await expect(
        reserve({ gown: 'abir', from: '2027-09-01', to: '2027-09-03', phone: '0212345678' }),
      ).rejects.toThrow(/reservation_invalid_phone/);
    });

    it('refuses an empty name', async () => {
      await expect(
        reserve({ gown: 'abir', from: '2027-09-10', to: '2027-09-12', name: '   ' }),
      ).rejects.toThrow(/reservation_invalid_name/);
    });
  });

  describe('accessories', () => {
    it('loans each accessory over the reservation period', async () => {
      const result = await reserve({
        gown: 'ryma',
        from: '2027-10-01',
        to: '2027-10-04',
        accessories: ['voile', 'diademe'],
      });

      const loans = await asUser(db, OWNER, () =>
        db.query<{ slug: string; period: string; quantity: number }>(
          `select a.slug, l.period::text, l.quantity
             from public.accessory_loans l
             join public.accessories a on a.id = l.accessory_id
            where l.reservation_id = $1
            order by a.slug`,
          [result.reservation_id],
        ),
      );

      expect(loans.rows.map((r) => r.slug)).toEqual(['diademe', 'voile']);
      expect(loans.rows[0].period).toBe('[2027-10-01,2027-10-05)');
    });

    /**
     * The whole call is one transaction, so a typo in the third accessory must not leave a
     * reservation behind holding the dress.
     */
    it('rolls the reservation back when an accessory is unknown', async () => {
      await expect(
        reserve({
          gown: 'ryma',
          from: '2027-11-01',
          to: '2027-11-04',
          accessories: ['voile', 'tiare-invente'],
        }),
      ).rejects.toThrow(/reservation_unknown_accessory/);

      const rymaId = await gownIdBySlug(db, 'ryma');
      const rows = await asUser(db, OWNER, () =>
        db.query(
          `select 1 from public.gown_reservations
            where gown_id = $1 and period && daterange('2027-11-01','2027-11-05','[)')`,
          [rymaId],
        ),
      );
      expect(rows.rows).toHaveLength(0);
    });

    it('refuses a loan beyond a counted stock, and allows it while stock is uncounted', async () => {
      // The seed leaves stock_total 0 — "not counted yet" (§6) — so loans are unrestricted.
      const first = await reserve({
        gown: 'abir',
        from: '2027-12-01',
        to: '2027-12-04',
        accessories: ['barnous'],
      });
      expect(first.reservation_id).toBeTruthy();

      // Once the salon counts them, the count is enforced.
      await db.query(`update public.accessories set stock_total = 1 where slug = 'barnous'`);

      await expect(
        reserve({
          gown: 'ryma',
          from: '2027-12-02',
          to: '2027-12-03',
          phone: '0661234572',
          accessories: ['barnous'],
        }),
      ).rejects.toThrow(/accessory_out_of_stock/);

      await db.query(`update public.accessories set stock_total = 0 where slug = 'barnous'`);
    });
  });
});

describe('set_reservation_status', () => {
  it('moves held to confirmed', async () => {
    const r = await reserve({ gown: 'abir', from: '2028-01-04', to: '2028-01-06' });

    const after = await asUser(db, OWNER, () =>
      db.query<{ set_reservation_status: string }>(
        `select public.set_reservation_status($1, 'confirmed'::public.reservation_status)::text`,
        [r.reservation_id],
      ),
    );
    expect(after.rows[0].set_reservation_status).toBe('confirmed');
  });

  it('refuses to skip from held straight to returned', async () => {
    const r = await reserve({ gown: 'abir', from: '2028-02-04', to: '2028-02-06' });

    await expect(
      asUser(db, OWNER, () =>
        db.query(
          `select public.set_reservation_status($1, 'returned'::public.reservation_status)`,
          [r.reservation_id],
        ),
      ),
    ).rejects.toThrow(/reservation_invalid_transition/);
  });

  it('refuses to re-open a cancelled reservation', async () => {
    const r = await reserve({ gown: 'abir', from: '2028-03-04', to: '2028-03-06' });
    await asUser(db, OWNER, () =>
      db.query(`select public.set_reservation_status($1, 'cancelled'::public.reservation_status)`, [
        r.reservation_id,
      ]),
    );

    await expect(
      asUser(db, OWNER, () =>
        db.query(
          `select public.set_reservation_status($1, 'confirmed'::public.reservation_status)`,
          [r.reservation_id],
        ),
      ),
    ).rejects.toThrow(/reservation_invalid_transition/);
  });

  /** A cancellation must release the dates the same instant, or the dress sits idle. */
  it('frees the dates as soon as a reservation is cancelled', async () => {
    const r = await reserve({ gown: 'ryma', from: '2028-04-01', to: '2028-04-10' });
    await asUser(db, OWNER, () =>
      db.query(`select public.set_reservation_status($1, 'cancelled'::public.reservation_status)`, [
        r.reservation_id,
      ]),
    );

    const replacement = await reserve({
      gown: 'ryma',
      from: '2028-04-01',
      to: '2028-04-10',
      phone: '0661234573',
    });
    expect(replacement.reservation_id).toBeTruthy();
  });

  it('sends a rented gown to cleaning when it comes back', async () => {
    const r = await reserve({
      gown: 'anastasia',
      from: '2028-05-01',
      to: '2028-05-04',
      status: 'confirmed',
    });

    const anastasiaId = await gownIdBySlug(db, 'anastasia');
    await asUser(db, OWNER, async () => {
      await db.query(`select public.set_gown_state($1, 'rented'::public.gown_state, 'collected')`, [
        anastasiaId,
      ]);
      await db.query(`select public.set_reservation_status($1, 'returned'::public.reservation_status)`, [
        r.reservation_id,
      ]);
    });

    const gown = await db.query<{ state: string }>(
      `select state::text as state from public.gowns where slug = 'anastasia'`,
    );
    expect(gown.rows[0].state).toBe('cleaning');
  });

  it('appends the reason to the notes rather than overwriting them', async () => {
    const r = await reserve({
      gown: 'abir',
      from: '2028-06-04',
      to: '2028-06-06',
      notes: 'Retouche prévue',
    });

    await asUser(db, OWNER, () =>
      db.query(
        `select public.set_reservation_status($1, 'cancelled'::public.reservation_status, 'Mariage reporté')`,
        [r.reservation_id],
      ),
    );

    const row = await asUser(db, OWNER, () =>
      db.query<{ notes: string }>(`select notes from public.gown_reservations where id = $1`, [
        r.reservation_id,
      ]),
    );
    expect(row.rows[0].notes).toBe('Retouche prévue\nMariage reporté');
  });
});

describe('set_gown_state', () => {
  it('logs the transition with its reason', async () => {
    const gownId = await gownIdBySlug(db, 'ryma');

    await asUser(db, OWNER, () =>
      db.query(`select public.set_gown_state($1, 'repair'::public.gown_state, 'Fermeture cassée')`, [
        gownId,
      ]),
    );

    const log = await asUser(db, OWNER, () =>
      db.query<{ from_state: string; to_state: string; reason: string; changed_by: string }>(
        `select from_state::text as from_state, to_state::text as to_state, reason, changed_by
           from public.gown_status_log
          where gown_id = $1
          order by created_at desc
          limit 1`,
        [gownId],
      ),
    );

    expect(log.rows[0].to_state).toBe('repair');
    expect(log.rows[0].reason).toBe('Fermeture cassée');
    // auth.uid() at the time, so the log answers "who" and not only "what".
    expect(log.rows[0].changed_by).toBe(OWNER);

    await asUser(db, OWNER, () =>
      db.query(`select public.set_gown_state($1, 'available'::public.gown_state, null)`, [gownId]),
    );
  });
});

describe('gown_utilisation', () => {
  it('clips a reservation to the reporting window', async () => {
    const db2 = await createTestDb();
    await createUser(db2, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });

    // Spans the whole of March; the window asks only about the first ten days.
    await asUser(db2, OWNER, () =>
      db2.query(
        `select public.reserve_gown('abir', 'Amel Benali', '0553366712',
                                    '2029-03-01'::date, '2029-03-31'::date)`,
      ),
    );

    const rows = await asUser(db2, OWNER, () =>
      db2.query<{ slug: string; days_reserved: number; reservation_count: number }>(
        `select slug, days_reserved, reservation_count
           from public.gown_utilisation('2029-03-01'::date, '2029-03-10'::date)
          order by slug`,
      ),
    );

    const abir = rows.rows.find((r) => r.slug === 'abir')!;
    expect(abir.days_reserved).toBe(10);
    expect(abir.reservation_count).toBe(1);

    // A gown with nothing against it still appears, at zero — an absent row reads as an error.
    const ryma = rows.rows.find((r) => r.slug === 'ryma')!;
    expect(ryma.days_reserved).toBe(0);
  });
});

/**
 * Non-negotiable #5. These are the cases that would let the console quietly become the
 * authorisation model, which is exactly what `security definer` would have done.
 */
describe('row level security', () => {
  it('lets reception read the atelier', async () => {
    await reserve({ gown: 'abir', from: '2028-09-01', to: '2028-09-04' });

    const rows = await asUser(db, RECEPTION, () =>
      db.query(`select id from public.gown_reservations`),
    );
    expect(rows.rows.length).toBeGreaterThan(0);
  });

  it('refuses to let reception take a reservation', async () => {
    await expect(
      reserve({ gown: 'ryma', from: '2028-10-01', to: '2028-10-04', as: RECEPTION }),
    ).rejects.toThrow(/reservation_forbidden|new row violates row-level security/);
  });

  it('hides every reservation from a stylist', async () => {
    const rows = await asUser(db, STYLIST, () => db.query(`select id from public.gown_reservations`));
    expect(rows.rows).toHaveLength(0);
  });

  it('refuses to let a stylist change a gown state', async () => {
    const gownId = await gownIdBySlug(db, 'abir');
    await expect(
      asUser(db, STYLIST, () =>
        db.query(`select public.set_gown_state($1, 'repair'::public.gown_state, null)`, [gownId]),
      ),
    ).rejects.toThrow(/gown_forbidden/);
  });

  it('keeps the atelier away from anonymous visitors entirely', async () => {
    // The gowns themselves are public — the catalogue needs them. Who rented them is not.
    const reservations = await db.query(
      `select has_function_privilege('anon', 'public.reserve_gown(text, text, text, date, date, smallint, public.reservation_status, bigint, text, text[])', 'execute') as allowed`,
    );
    expect((reservations.rows[0] as { allowed: boolean }).allowed).toBe(false);
  });
});

/** Non-negotiable #9: every mutation to a reservation leaves a trail. */
describe('audit log', () => {
  it('records the insert and the status change', async () => {
    const r = await reserve({ gown: 'abir', from: '2028-11-01', to: '2028-11-04' });
    await asUser(db, OWNER, () =>
      db.query(`select public.set_reservation_status($1, 'confirmed'::public.reservation_status)`, [
        r.reservation_id,
      ]),
    );

    const rows = await asUser(db, OWNER, () =>
      db.query<{ action: string; changed_fields: string[] | null; actor_id: string | null }>(
        `select action::text as action, changed_fields, actor_id
           from public.audit_log
          where table_name = 'gown_reservations' and record_id = $1
          order by created_at`,
        [r.reservation_id],
      ),
    );

    expect(rows.rows.map((row) => row.action)).toEqual(['insert', 'update']);
    expect(rows.rows[1].changed_fields).toContain('status');
    expect(rows.rows[0].actor_id).toBe(OWNER);
    expect(rows.rows[0]).toBeDefined();
    expect(TENANT_ID).toBeTruthy();
  });
});
