/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, TENANT_ID, type TestDb } from './harness';

let db: TestDb;

const OWNER = '30000000-0000-4000-8000-000000000001';
const RECEPTION = '30000000-0000-4000-8000-000000000002';
const STYLIST = '30000000-0000-4000-8000-000000000003';

interface BookingRow {
  reference: string;
  appointment_id: string;
  staff_slug: string | null;
  is_request: boolean;
}


interface BookOpts {
  line?: string;
  service?: string | null;
  staff?: string | null;
  start: string;
  clientId?: string | null;
  name?: string;
  phone?: string;
  notes?: string | null;
  status?: string;
}

async function bookAs(actor: string, opts: BookOpts): Promise<BookingRow> {
  return asUser(db, actor, async () => {
    const res = await db.query<BookingRow>(
      `select * from public.book_appointment_as_staff($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9)`,
      [
        opts.line ?? 'salon',
        opts.service ?? null,
        opts.staff ?? null,
        opts.start,
        opts.clientId ?? null,
        opts.name ?? 'Cliente Comptoir',
        opts.phone ?? '0557000001',
        opts.notes ?? null,
        opts.status ?? 'confirmed',
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

  // A duration is a test fixture; the seed leaves every one null because §6 says so.
  await db.query(`update public.services set duration_minutes = 45 where slug = 'coupe'`);
}, 120_000);

describe('booking from the console', () => {
  it('lets reception book — the thing the console could not do', async () => {
    const result = await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'nour',
      start: '2026-10-01T09:00:00Z',
    });

    expect(result.reference).toMatch(/^[0-9A-F]{8}$/);
    expect(result.is_request).toBe(false);
    expect(result.staff_slug).toBe('nour');
  });

  it('records which service was booked, so revenue can name it', async () => {
    const result = await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'sophie',
      start: '2026-10-02T09:00:00Z',
      phone: '0557000002',
    });

    const rows = await db.query<{ price_charged: string; name: string }>(
      `select aps.price_charged, s.name
       from public.appointment_services aps
       join public.services s on s.id = aps.service_id
       where aps.appointment_id = $1`,
      [result.appointment_id],
    );
    expect(rows.rows[0].name).toBe('Coupe');
    expect(Number(rows.rows[0].price_charged)).toBe(70000);
  });

  it('books onto the chosen business line', async () => {
    const result = await bookAs(RECEPTION, {
      line: 'makeup',
      service: 'coupe',
      staff: 'sophie',
      start: '2026-10-03T09:00:00Z',
      phone: '0557000003',
    });
    const row = await db.query<{ line: string }>(
      `select line::text as line from public.appointments where id = $1`,
      [result.appointment_id],
    );
    expect(row.rows[0].line).toBe('makeup');
  });

  /** The same guarantee the public path has, through the same constraint. */
  it('cannot double-book an expert', async () => {
    await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'nour',
      start: '2026-10-05T11:00:00Z',
      phone: '0557000004',
    });
    await expect(
      bookAs(RECEPTION, {
        service: 'coupe',
        staff: 'nour',
        start: '2026-10-05T11:15:00Z',
        phone: '0557000005',
      }),
    ).rejects.toThrow(/booking_slot_taken/);
  });

  it('records a request when the service has no duration', async () => {
    const result = await bookAs(RECEPTION, {
      service: 'balayage',
      staff: 'nour',
      start: '2026-10-06T09:00:00Z',
      phone: '0557000006',
    });
    expect(result.is_request).toBe(true);

    const row = await db.query<{ period: string | null }>(
      `select period::text from public.appointments where id = $1`,
      [result.appointment_id],
    );
    expect(row.rows[0].period).toBeNull();
  });

  it('reuses an existing client instead of creating a second record', async () => {
    const first = await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'sophie',
      start: '2026-10-07T09:00:00Z',
      name: 'Yasmine Retour',
      phone: '0557001111',
    });
    const client = await db.query<{ client_id: string }>(
      `select client_id from public.appointments where id = $1`,
      [first.appointment_id],
    );

    await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'sophie',
      start: '2026-10-08T09:00:00Z',
      clientId: client.rows[0].client_id,
    });

    const count = await db.query<{ count: number }>(
      `select count(*)::int as count from public.clients where phone = '0557001111'`,
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('still validates the phone for a walk-in', async () => {
    await expect(
      bookAs(RECEPTION, { service: 'coupe', start: '2026-10-09T09:00:00Z', phone: '0451111111' }),
    ).rejects.toThrow(/booking_invalid_phone/);
  });

  /**
   * The reason this is a separate function from the public one: it is SECURITY INVOKER, so RLS
   * decides. A stylist has no `appointments_front_desk_write`, and is refused here exactly as
   * they are everywhere else.
   */
  it('refuses a stylist, through RLS rather than a role check', async () => {
    await expect(
      bookAs(STYLIST, {
        service: 'coupe',
        staff: 'nour',
        start: '2026-10-10T09:00:00Z',
        phone: '0557000009',
      }),
    ).rejects.toThrow();
  });

  it('writes an audit row for a console booking', async () => {
    const before = await db.query<{ count: number }>(
      `select count(*)::int as count from public.audit_log where table_name = 'appointments'`,
    );
    await bookAs(RECEPTION, {
      service: 'coupe',
      staff: 'sophie',
      start: '2026-10-12T09:00:00Z',
      phone: '0557000012',
    });
    const after = await db.query<{ count: number }>(
      `select count(*)::int as count from public.audit_log where table_name = 'appointments'`,
    );
    expect(after.rows[0].count).toBeGreaterThan(before.rows[0].count);
  });
});

describe('search_clients', () => {
  beforeAll(async () => {
    await db.query(
      `insert into public.clients (tenant_id, full_name, phone, is_bride)
       values ($1, 'Meriem Recherche', '0558123456', true) on conflict do nothing`,
      [TENANT_ID],
    );
  });

  it('finds a client by name or by phone', async () => {
    const byName = await asUser(db, RECEPTION, () =>
      db.query<{ full_name: string }>(`select full_name from public.search_clients('Meriem')`),
    );
    expect(byName.rows.map((r) => r.full_name)).toContain('Meriem Recherche');

    const byPhone = await asUser(db, RECEPTION, () =>
      db.query<{ phone: string }>(`select phone from public.search_clients('0558 12')`),
    );
    expect(byPhone.rows.map((r) => r.phone)).toContain('0558123456');
  });

  it('needs at least two characters, so an empty box returns nothing', async () => {
    const res = await asUser(db, RECEPTION, () =>
      db.query<{ id: string }>(`select id from public.search_clients('a')`),
    );
    expect(res.rows).toEqual([]);
  });

  it('shows a stylist only clients they have served', async () => {
    const res = await asUser(db, STYLIST, () =>
      db.query<{ full_name: string }>(`select full_name from public.search_clients('Meriem')`),
    );
    expect(res.rows).toEqual([]);
  });
});
