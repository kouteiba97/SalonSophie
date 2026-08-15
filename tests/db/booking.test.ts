/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let db: TestDb;

/** `select * from` expands the composite return into columns. */
interface BookingRow {
  reference: string;
  appointment_id: string;
  staff_slug: string | null;
  is_request: boolean;
}

async function book(
  opts: {
    service?: string | null;
    gown?: string | null;
    staff?: string | null;
    start: string;
    name?: string;
    phone?: string;
    notes?: string | null;
  },
): Promise<BookingRow> {
  const res = await db.query<BookingRow>(
    `select * from public.book_appointment($1, $2, $3, $4::timestamptz, $5, $6, $7)`,
    [
      opts.service ?? null,
      opts.gown ?? null,
      opts.staff ?? null,
      opts.start,
      opts.name ?? 'Amel Benali',
      opts.phone ?? '0553366712',
      opts.notes ?? null,
    ],
  );
  return res.rows[0];
}

beforeAll(async () => {
  db = await createTestDb();

  // A duration is a *test fixture* here, not seeded business data: the seed leaves every
  // duration null because §6 says they are unknown. Giving one service a duration is how we
  // exercise the scheduled path at all.
  await db.query(`update public.services set duration_minutes = 60 where slug = 'coupe'`);
}, 120_000);

describe('book_appointment', () => {
  it('schedules a real slot when the duration is known', async () => {
    const result = await book({ service: 'coupe', staff: 'nour', start: '2026-09-01T09:00:00Z' });

    expect(result.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(result.is_request).toBe(false);
    expect(result.staff_slug).toBe('nour');

    const appt = await db.query<{ period: string; requested_start: string | null; line: string }>(
      `select period::text, requested_start, line::text as line from public.appointments where id = $1`,
      [result.appointment_id],
    );
    expect(appt.rows[0].period).not.toBeNull();
    expect(appt.rows[0].requested_start).toBeNull();
    expect(appt.rows[0].line).toBe('salon');
  });

  /**
   * The heart of §5.3 item 9. The second caller loses, and loses cleanly — with a named error
   * rather than a constraint stack trace.
   */
  it('refuses a second booking for the same staff member and time', async () => {
    await book({ service: 'coupe', staff: 'sophie', start: '2026-09-02T09:00:00Z' });

    await expect(
      book({
        service: 'coupe',
        staff: 'sophie',
        start: '2026-09-02T09:30:00Z',
        phone: '0554444444',
        name: 'Autre Cliente',
      }),
    ).rejects.toThrow(/booking_slot_taken/);
  });

  it('refuses even a perfectly simultaneous booking', async () => {
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-03T11:00:00Z' });

    await expect(
      book({
        service: 'coupe',
        staff: 'nour',
        start: '2026-09-03T11:00:00Z',
        phone: '0555555555',
        name: 'Simultanée',
      }),
    ).rejects.toThrow(/booking_slot_taken/);
  });

  it('allows the adjoining hour', async () => {
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-04T09:00:00Z' });
    await expect(
      book({ service: 'coupe', staff: 'nour', start: '2026-09-04T10:00:00Z', phone: '0556666666' }),
    ).resolves.toBeDefined();
  });

  it('falls back to another expert when none is named', async () => {
    // Nour is busy at this hour; "no preference" should land on Sophie rather than fail.
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-05T14:00:00Z' });

    const result = await book({
      service: 'coupe',
      staff: 'sans-preference',
      start: '2026-09-05T14:00:00Z',
      phone: '0557777777',
    });
    expect(result.staff_slug).toBe('sophie');
  });

  it('reports the slot taken when every expert is busy', async () => {
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-06T16:00:00Z' });
    await book({ service: 'coupe', staff: 'sophie', start: '2026-09-06T16:00:00Z', phone: '0558888888' });

    await expect(
      book({
        service: 'coupe',
        staff: 'sans-preference',
        start: '2026-09-06T16:00:00Z',
        phone: '0559999999',
      }),
    ).rejects.toThrow(/booking_slot_taken/);
  });

  /** Non-negotiable #2 reaching the booking path: an unknown duration must not become a promise. */
  it('records a request, holding no slot, when the duration is unknown', async () => {
    const result = await book({ service: 'balayage', staff: 'nour', start: '2026-09-10T09:00:00Z' });
    expect(result.is_request).toBe(true);

    const appt = await db.query<{ period: string | null; requested_start: string | null }>(
      `select period::text, requested_start from public.appointments where id = $1`,
      [result.appointment_id],
    );
    expect(appt.rows[0].period).toBeNull();
    expect(appt.rows[0].requested_start).not.toBeNull();
  });

  it('lets two requests share a time, because neither holds the calendar', async () => {
    await book({ service: 'balayage', staff: 'nour', start: '2026-09-11T09:00:00Z' });
    await expect(
      book({ service: 'balayage', staff: 'nour', start: '2026-09-11T09:00:00Z', phone: '0551212121' }),
    ).resolves.toBeDefined();
  });

  it('never lets a request block a real booking', async () => {
    await book({ service: 'balayage', staff: 'sophie', start: '2026-09-12T09:00:00Z' });
    await expect(
      book({ service: 'coupe', staff: 'sophie', start: '2026-09-12T09:00:00Z', phone: '0551313131' }),
    ).resolves.toBeDefined();
  });

  /** §5.3 item 10 — a gown books a fitting, never a rental. */
  it('turns a gown into a bridal fitting, not a reservation', async () => {
    const result = await book({ gown: 'anastasia', staff: 'sophie', start: '2026-09-15T10:00:00Z' });
    expect(result.is_request).toBe(true);

    const appt = await db.query<{ line: string; gown_id: string | null }>(
      `select line::text as line, gown_id from public.appointments where id = $1`,
      [result.appointment_id],
    );
    expect(appt.rows[0].line).toBe('bridal');
    expect(appt.rows[0].gown_id).not.toBeNull();

    // Crucially: no rental was created.
    const reservations = await db.query<{ count: number }>(
      'select count(*)::int as count from public.gown_reservations',
    );
    expect(reservations.rows[0].count).toBe(0);
  });

  describe('validation, re-run server-side', () => {
    it('rejects a phone that is not an Algerian mobile', async () => {
      for (const phone of ['0451111111', '123', '+213551111111']) {
        await expect(
          book({ service: 'coupe', start: '2026-09-20T09:00:00Z', phone }),
        ).rejects.toThrow(/booking_invalid_phone/);
      }
    });

    it('accepts the spaces a client actually types', async () => {
      const result = await book({
        service: 'coupe',
        staff: 'nour',
        start: '2026-09-21T09:00:00Z',
        phone: '05 53 36 67 13',
      });
      const client = await db.query<{ phone: string }>(
        `select c.phone from public.clients c
         join public.appointments a on a.client_id = c.id where a.id = $1`,
        [result.appointment_id],
      );
      expect(client.rows[0].phone).toBe('0553366713');
    });

    it('rejects an empty name', async () => {
      await expect(
        book({ service: 'coupe', start: '2026-09-22T09:00:00Z', name: '   ' }),
      ).rejects.toThrow(/booking_invalid_name/);
    });

    it('rejects a booking in the past', async () => {
      await expect(
        book({ service: 'coupe', start: '2020-01-01T09:00:00Z' }),
      ).rejects.toThrow(/booking_in_the_past/);
    });

    it('rejects an unknown service and an unknown gown', async () => {
      await expect(book({ service: 'not-a-service', start: '2026-09-23T09:00:00Z' })).rejects.toThrow(
        /booking_unknown_service/,
      );
      await expect(book({ gown: 'not-a-gown', start: '2026-09-23T09:00:00Z' })).rejects.toThrow(
        /booking_unknown_gown/,
      );
    });

    it('requires exactly one of service or gown', async () => {
      await expect(book({ start: '2026-09-24T09:00:00Z' })).rejects.toThrow(
        /booking_invalid_subject/,
      );
      await expect(
        book({ service: 'coupe', gown: 'anastasia', start: '2026-09-24T09:00:00Z' }),
      ).rejects.toThrow(/booking_invalid_subject/);
    });
  });

  it('reuses a returning client rather than duplicating them', async () => {
    const phone = '0551414141';
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-25T09:00:00Z', phone, name: 'Yasmine' });
    await book({ service: 'coupe', staff: 'nour', start: '2026-09-26T09:00:00Z', phone, name: 'Yasmine K' });

    const clients = await db.query<{ count: number; full_name: string }>(
      `select count(*)::int as count, max(full_name) as full_name
       from public.clients where phone = $1`,
      [phone],
    );
    expect(clients.rows[0].count).toBe(1);
    // The later spelling wins, so a correction at the desk sticks.
    expect(clients.rows[0].full_name).toBe('Yasmine K');
  });

  it('writes an audit row for every booking', async () => {
    const before = await db.query<{ count: number }>(
      `select count(*)::int as count from public.audit_log where table_name = 'appointments'`,
    );
    await book({ service: 'coupe', staff: 'sophie', start: '2026-09-27T09:00:00Z', phone: '0551515151' });
    const after = await db.query<{ count: number }>(
      `select count(*)::int as count from public.audit_log where table_name = 'appointments'`,
    );
    expect(after.rows[0].count).toBe(before.rows[0].count + 1);
  });
});

describe('busy_spans', () => {
  it('exposes occupied time without exposing who booked it', async () => {
    await book({ service: 'coupe', staff: 'nour', start: '2026-10-15T09:00:00Z', phone: '0551616161' });

    const res = await db.query<{ staff_slug: string; starts_at: string; ends_at: string }>(
      `select * from public.busy_spans('2026-10-15'::date, '2026-10-15'::date)`,
    );

    expect(res.rows.length).toBeGreaterThan(0);
    // Only these three columns exist — no client id, no name, no phone.
    expect(Object.keys(res.rows[0]).sort()).toEqual(['ends_at', 'staff_slug', 'starts_at']);
  });

  it('omits requests, which hold nothing', async () => {
    await book({ service: 'balayage', staff: 'nour', start: '2026-10-16T09:00:00Z', phone: '0551717171' });
    const res = await db.query<{ count: number }>(
      `select count(*)::int as count from public.busy_spans('2026-10-16'::date, '2026-10-16'::date)`,
    );
    expect(res.rows[0].count).toBe(0);
  });
});
