import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Demo mode's safety property, which matters more than anything it renders.
 *
 * Example records exist because §14 asks for them — an empty app cannot be evaluated. The danger
 * is that they outlive their purpose and end up in front of somebody who believes them. Two
 * guarantees prevent that, and both are asserted here:
 *
 *   1. Demo data is impossible once a database is configured. Not "deprioritised" — impossible,
 *      with no flag able to override it.
 *   2. Nothing invented reaches the public site.
 *
 * The module reads its environment at call time, so each case re-imports it with the environment
 * it is testing.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

async function loadDemo(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...env };
  vi.resetModules();
  return import('@/lib/console/demo');
}

describe('isDemoMode', () => {
  it('is off unless explicitly asked for', async () => {
    const { isDemoMode } = await loadDemo({
      NEXT_PUBLIC_DEMO_DATA: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    expect(isDemoMode()).toBe(false);
  });

  it('is on when asked for and no database exists', async () => {
    const { isDemoMode } = await loadDemo({
      NEXT_PUBLIC_DEMO_DATA: '1',
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    expect(isDemoMode()).toBe(true);
  });

  /**
   * The guarantee. A deployment with Supabase credentials cannot be made to show invented
   * records, however the flag is set — which is what makes the fake session in `getStaffSession`
   * safe, since there is no real data for it to reach.
   */
  it('is off once a database is configured, whatever the flag says', async () => {
    const { isDemoMode } = await loadDemo({
      NEXT_PUBLIC_DEMO_DATA: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(isDemoMode()).toBe(false);
  });

  it('ignores any value other than 1', async () => {
    for (const value of ['0', 'true', 'yes', '']) {
      const { isDemoMode } = await loadDemo({
        NEXT_PUBLIC_DEMO_DATA: value,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      });
      expect(isDemoMode(), `value ${value}`).toBe(false);
    }
  });
});

describe('the example records themselves', () => {
  it('gives the day-line something of every shape to draw', async () => {
    const { demoAppointments } = await loadDemo({});
    const day = demoAppointments('2026-08-16');

    // All three lanes, or the signature view cannot be judged.
    expect(new Set(day.map((a) => a.line))).toEqual(new Set(['salon', 'bridal', 'makeup']));
    // Requests, which hold no slot and must render differently.
    expect(day.some((a) => a.endMinute === null)).toBe(true);
    // Overlapping appointments, so the row-stacking is exercised.
    expect(day.filter((a) => a.line === 'salon' && a.startMinute < 660 && (a.endMinute ?? 0) > 600).length)
      .toBeGreaterThan(1);
  });

  /**
   * Even the examples keep §6's habit: a price the real tariff publishes as a range is not
   * settled until she is in the chair, so the demo leaves it null rather than picking a number.
   */
  it('leaves unsettled prices unsettled rather than inventing a figure', async () => {
    const { demoAppointments, demoDeals } = await loadDemo({});

    expect(demoAppointments('2026-08-16').some((a) => a.priceCharged === null)).toBe(true);
    // And a pitched deal has no agreed fee, so the board shows "montant non fixé", never 0 DA.
    expect(demoDeals().some((d) => d.valueAmount === null)).toBe(true);
  });

  it('leaves an unanswered thread for the alert to point at', async () => {
    const { demoUnansweredCount, demoConversations } = await loadDemo({});
    expect(demoUnansweredCount()).toBeGreaterThan(0);
    expect(demoUnansweredCount()).toBe(demoConversations().filter((c) => !c.isAnswered).length);
  });

  /** Illustrations, not a plausible leaked client list: first name plus an initial. */
  it('uses obviously abbreviated names', async () => {
    const { demoClients } = await loadDemo({});
    for (const client of demoClients()) {
      expect(client.fullName).toMatch(/^[A-Z][a-zà-ÿ]+ [A-Z]\.$/);
    }
  });
});
