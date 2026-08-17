/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createTestDb, createUser, type TestDb } from './harness';

let db: TestDb;

/**
 * What `anon` may call over PostgREST.
 *
 * This file exists because the first attempt at closing this surface passed review, passed every
 * other test, and changed nothing. `revoke execute ... from anon` looks exactly like a fix and is
 * a no-op while PUBLIC still holds the grant — and PUBLIC holds it on every function by default.
 * Nothing in the suite could tell the difference, because the privilege was never asserted; only
 * the live database's linter noticed, and only after the schema had been deployed.
 *
 * So the assertion here is on the privilege itself, not on a call failing. A call can fail for
 * the right reason by accident — RLS refusing an anonymous caller looks identical to the grant
 * being absent, and would keep passing after somebody re-granted EXECUTE to the world.
 */

/** The public API surface. Anonymous callers need these four and nothing else. */
const PUBLIC_FUNCTIONS = [
  'public.book_appointment(text, text, text, timestamptz, text, text, text)',
  'public.busy_spans(date, date)',
  'public.staff_shift_windows(date, date)',
  'public.staff_time_off_spans(date, date)',
];

/** RLS helpers. They answer questions about the caller; an anonymous one has no business asking. */
const HELPERS = [
  'public.auth_tenant_id()',
  'public.auth_role()',
  'public.auth_staff_id()',
  'public.is_owner()',
  'public.is_reception()',
  'public.is_front_desk()',
  'public.same_tenant(uuid)',
  'public.stylist_serves_client(uuid)',
];

/** Staff writes and reporting. Invoker functions, so RLS also refuses — but not reachable at all. */
const STAFF_FUNCTIONS = [
  'public.upsert_service(text, text, text, text, bigint, bigint, integer, integer, boolean)',
  'public.set_business_hours(jsonb)',
  'public.record_expense(text, text, bigint, date, text, text)',
  'public.record_stock_movement(text, numeric, text, bigint, text, date)',
  'public.revenue_by_line(date, date)',
  'public.cash_flow(date, date)',
  'public.search_clients(text)',
  'public.book_appointment_as_staff(text, text, text, timestamptz, uuid, text, text, text, text)',
  'public.reserve_gown(text, text, text, date, date, smallint, reservation_status, bigint, text, text[])',
  'public.set_deal_stage(uuid, deal_stage)',
];

/** Triggers. Postgres checks EXECUTE at CREATE TRIGGER, never at fire time. */
const TRIGGER_FUNCTIONS = [
  'public.write_audit_log()',
  'public.touch_updated_at()',
  'public.log_gown_state_change()',
  'public.sync_conversation_from_message()',
  'public.check_accessory_stock()',
];

async function canExecute(role: string, signature: string): Promise<boolean> {
  const res = await db.query<{ allowed: boolean }>(
    `select has_function_privilege($1, $2, 'EXECUTE') as allowed`,
    [role, signature],
  );
  return res.rows[0].allowed;
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

describe('what anon may execute', () => {
  it.each(PUBLIC_FUNCTIONS)('allows the public booking path: %s', async (signature) => {
    expect(await canExecute('anon', signature)).toBe(true);
  });

  it.each(HELPERS)('refuses the RLS helper %s', async (signature) => {
    expect(await canExecute('anon', signature)).toBe(false);
  });

  it.each(STAFF_FUNCTIONS)('refuses the staff function %s', async (signature) => {
    expect(await canExecute('anon', signature)).toBe(false);
  });

  it.each(TRIGGER_FUNCTIONS)('refuses the trigger function %s', async (signature) => {
    expect(await canExecute('anon', signature)).toBe(false);
  });

  /**
   * The check the enumerated lists above cannot make: that nothing was missed, and that nothing
   * added later reopens the surface. A new function inherits the default privilege, which this
   * migration also changed.
   */
  it('leaves anon nothing beyond the four, across the whole schema', async () => {
    const res = await db.query<{ signature: string }>(
      `select p.oid::regprocedure::text as signature
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not exists (
           select 1 from pg_depend d
           where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
         )
         and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1`,
    );
    const names = res.rows.map((r) => r.signature.replace(/\s+/g, ' '));
    expect(names).toHaveLength(4);
    expect(names.every((n) => n.startsWith('book_appointment(') || n.includes('spans(') || n.includes('windows('))).toBe(true);
  });
});

describe('what authenticated may execute', () => {
  it('keeps the RLS helpers callable, or every policy fails closed', async () => {
    for (const signature of HELPERS) {
      expect(await canExecute('authenticated', signature)).toBe(true);
    }
  });

  it('keeps the staff functions callable, leaving RLS to decide', async () => {
    for (const signature of STAFF_FUNCTIONS) {
      expect(await canExecute('authenticated', signature)).toBe(true);
    }
  });

  it('does not hand out the trigger functions either', async () => {
    for (const signature of TRIGGER_FUNCTIONS) {
      expect(await canExecute('authenticated', signature)).toBe(false);
    }
  });
});

describe('the public site still works without those grants', () => {
  /**
   * The reason this is not just a privilege assertion: the catalogue policies are what an
   * anonymous visitor actually exercises, and if any of them called a helper, revoking the helper
   * would have taken the price list down with it. They use plain column predicates — but that is
   * a fact about today's policies, so it gets a test rather than a comment.
   */
  it('still lets an anonymous visitor read the tariff', async () => {
    const res = await asAnon(db, () =>
      db.query<{ count: number }>(`select count(*)::int as count from public.services`),
    );
    expect(res.rows[0].count).toBeGreaterThan(0);
  });

  it('still lets an anonymous visitor read the gowns', async () => {
    const res = await asAnon(db, () =>
      db.query<{ count: number }>(`select count(*)::int as count from public.gowns`),
    );
    expect(res.rows[0].count).toBeGreaterThan(0);
  });

  it('still refuses an anonymous visitor the client book', async () => {
    const res = await asAnon(db, () =>
      db.query<{ count: number }>(`select count(*)::int as count from public.clients`),
    );
    expect(res.rows[0].count).toBe(0);
  });

  /**
   * The claim this migration rests on: Postgres checks EXECUTE on a trigger function when the
   * trigger is *created*, not when it fires. If that were wrong, revoking the trigger functions
   * would have silently stopped `updated_at` from moving and the audit trail from being written
   * — the two things hardest to notice missing and worst to discover late.
   *
   * So it is exercised by a real signed-in owner, who genuinely holds no EXECUTE on
   * `touch_updated_at`, making a write their policy allows.
   */
  it('fires a trigger function for a role that cannot execute it', async () => {
    const OWNER = '40000000-0000-4000-8000-000000000001';
    await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });

    expect(await canExecute('authenticated', 'public.touch_updated_at()')).toBe(false);

    const before = await db.query<{ updated_at: string }>(
      `select updated_at from public.services where slug = 'coupe'`,
    );

    await asUser(db, OWNER, () =>
      db.query(`update public.services set name = name where slug = 'coupe'`),
    );

    const after = await db.query<{ updated_at: string }>(
      `select updated_at from public.services where slug = 'coupe'`,
    );
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at).getTime(),
    );
  });
});
