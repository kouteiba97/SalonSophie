import { describe, expect, it } from 'vitest';
import {
  clamp,
  containsDay,
  daysBetween,
  formatDateRange,
  lastWornDay,
  overlaps,
  parseDateRange,
  rangeLength,
  shiftDate,
} from '@/lib/atelier/ranges';
import { reservationInput } from '@/lib/atelier/schema';
import {
  mergeRanges,
  nextReservation,
  reservationOn,
  utilisationOf,
} from '@/lib/atelier/utilisation';
import type { Reservation, ReservationStatus } from '@/lib/atelier/types';

/**
 * The atelier's arithmetic, with nothing else in it.
 *
 * Half-open ranges are the single place a rental calendar goes wrong, and every bug they produce
 * is off by exactly one day — which is invisible in a screenshot and catastrophic on a wedding
 * morning. These cases pin the boundaries down.
 *
 * The database-side counterpart lives in tests/db/atelier.test.ts: this file proves the maths,
 * that one proves the constraint.
 */

const reservation = (
  overrides: Partial<Reservation> & { start: string; end: string },
): Reservation => ({
  id: overrides.id ?? crypto.randomUUID(),
  reference: overrides.reference ?? 'AAAA1111',
  gownSlug: overrides.gownSlug ?? 'anastasia',
  gownName: overrides.gownName ?? 'Anastasia',
  range: { start: overrides.start, end: overrides.end },
  cleaningBufferDays: overrides.cleaningBufferDays ?? 0,
  status: overrides.status ?? ('confirmed' as ReservationStatus),
  depositAmount: overrides.depositAmount ?? null,
  notes: overrides.notes ?? null,
  client: overrides.client ?? { id: 'c1', fullName: 'Amel Benali', phone: '0553366712' },
  createdAt: overrides.createdAt ?? '2026-08-15T10:00:00Z',
});

describe('date ranges', () => {
  it('counts days between two dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-06')).toBe(5);
    expect(daysBetween('2026-09-06', '2026-09-01')).toBe(-5);
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('counts a range as the days it occupies, not the days it touches', () => {
    // [1, 6) is the 1st through the 5th: five days.
    expect(rangeLength({ start: '2026-09-01', end: '2026-09-06' })).toBe(5);
  });

  it('crosses a month and a year boundary', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
    // 2028 is a leap year; 2026 is not.
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  describe('lastWornDay', () => {
    it('is the day before the exclusive end when nothing is reserved for cleaning', () => {
      // Stored [01, 06) — worn the 1st through the 5th.
      expect(lastWornDay({ start: '2026-09-01', end: '2026-09-06' })).toBe('2026-09-05');
    });

    /**
     * The cleaning days live inside the stored range so the constraint protects them, which
     * means the range's end is *not* the day after the wedding. Showing a bride the raw end
     * would tell her she has the dress two days longer than she does.
     */
    it('steps back over the cleaning buffer', () => {
      expect(lastWornDay({ start: '2026-09-01', end: '2026-09-08' }, 2)).toBe('2026-09-05');
    });

    it('handles a single-day rental', () => {
      const range = { start: '2026-09-01', end: '2026-09-02' };
      expect(rangeLength(range)).toBe(1);
      expect(lastWornDay(range)).toBe('2026-09-01');
    });
  });

  describe('overlaps', () => {
    const week = { start: '2026-09-07', end: '2026-09-14' };

    it('is true when the ranges share a day', () => {
      expect(overlaps(week, { start: '2026-09-13', end: '2026-09-20' })).toBe(true);
      expect(overlaps(week, { start: '2026-09-01', end: '2026-09-08' })).toBe(true);
    });

    it('is true when one contains the other', () => {
      expect(overlaps(week, { start: '2026-09-08', end: '2026-09-10' })).toBe(true);
      expect(overlaps({ start: '2026-09-08', end: '2026-09-10' }, week)).toBe(true);
    });

    /** The case the whole convention exists for: the next bride collects as this one returns. */
    it('is false for adjacent ranges', () => {
      expect(overlaps(week, { start: '2026-09-14', end: '2026-09-21' })).toBe(false);
      expect(overlaps(week, { start: '2026-08-31', end: '2026-09-07' })).toBe(false);
    });
  });

  it('knows which days a range contains', () => {
    const range = { start: '2026-09-01', end: '2026-09-04' };
    expect(containsDay(range, '2026-09-01')).toBe(true);
    expect(containsDay(range, '2026-09-03')).toBe(true);
    // The exclusive end is the first free day.
    expect(containsDay(range, '2026-09-04')).toBe(false);
    expect(containsDay(range, '2026-08-31')).toBe(false);
  });

  describe('clamp', () => {
    const window = { start: '2026-09-01', end: '2026-10-01' };

    it('clips a range that runs past both ends', () => {
      expect(clamp({ start: '2026-08-01', end: '2026-11-01' }, window)).toEqual(window);
    });

    it('leaves a contained range alone', () => {
      const inner = { start: '2026-09-10', end: '2026-09-12' };
      expect(clamp(inner, window)).toEqual(inner);
    });

    it('returns null when they never meet', () => {
      expect(clamp({ start: '2026-10-01', end: '2026-10-05' }, window)).toBeNull();
      expect(clamp({ start: '2026-08-01', end: '2026-09-01' }, window)).toBeNull();
    });
  });

  describe('parseDateRange', () => {
    it('reads the canonical half-open literal Postgres emits', () => {
      expect(parseDateRange('[2026-09-01,2026-09-06)')).toEqual({
        start: '2026-09-01',
        end: '2026-09-06',
      });
    });

    it('round-trips', () => {
      const range = { start: '2026-09-01', end: '2026-09-06' };
      expect(parseDateRange(formatDateRange(range))).toEqual(range);
    });

    /**
     * Anything else is a shape we did not write. Returning null makes the caller drop the row,
     * which is right: a reservation whose dates cannot be read is not one to schedule around.
     */
    it('refuses a shape it does not recognise', () => {
      expect(parseDateRange('(2026-09-01,2026-09-06]')).toBeNull();
      expect(parseDateRange('empty')).toBeNull();
      expect(parseDateRange('[2026-09-01,)')).toBeNull();
      expect(parseDateRange('')).toBeNull();
    });
  });

});

describe('the reservation form’s validation', () => {
  const valid = {
    gownSlug: 'anastasia',
    clientName: 'Amel Benali',
    clientPhone: '0553366712',
    firstDay: '2027-06-01',
    lastDay: '2027-06-04',
    cleaningBufferDays: '0',
    status: 'held',
    depositDinars: '',
    accessorySlugs: [],
  };

  /**
   * The bug this test exists for: `z.coerce.number()` turns '' into 0, so the obvious
   * `union([coerce.number(), literal('')])` matches the coercing branch first and a blank
   * deposit box silently becomes 0 DA. Null means "no deposit policy has been set"; zero means
   * "we decided to take nothing", and the console renders them differently on purpose.
   */
  it('keeps an empty deposit null instead of turning it into zero', () => {
    const parsed = reservationInput.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.depositDinars).toBeNull();
  });

  it('converts a deposit in dinars to centimes', () => {
    const parsed = reservationInput.safeParse({ ...valid, depositDinars: '5000' });
    expect(parsed.success && parsed.data.depositDinars).toBe(500_000);
  });

  it('still allows a deliberate zero deposit', () => {
    const parsed = reservationInput.safeParse({ ...valid, depositDinars: '0' });
    expect(parsed.success && parsed.data.depositDinars).toBe(0);
  });

  it('rejects a last day before the first', () => {
    const parsed = reservationInput.safeParse({
      ...valid,
      firstDay: '2027-06-10',
      lastDay: '2027-06-04',
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0].message).toBe('invalid_period');
  });

  it('accepts a single-day rental', () => {
    const parsed = reservationInput.safeParse({
      ...valid,
      firstDay: '2027-06-04',
      lastDay: '2027-06-04',
    });
    expect(parsed.success).toBe(true);
  });

  it('normalises a phone number typed with spaces', () => {
    const parsed = reservationInput.safeParse({ ...valid, clientPhone: '05 53 36 67 12' });
    expect(parsed.success && parsed.data.clientPhone).toBe('0553366712');
  });

  it('rejects a number that is not an Algerian mobile', () => {
    expect(reservationInput.safeParse({ ...valid, clientPhone: '0212345678' }).success).toBe(false);
  });

  /** An empty box here genuinely does mean zero, unlike the deposit. */
  it('treats a blank cleaning buffer as no buffer', () => {
    const parsed = reservationInput.safeParse({ ...valid, cleaningBufferDays: '' });
    expect(parsed.success && parsed.data.cleaningBufferDays).toBe(0);
  });
});

describe('mergeRanges', () => {
  it('folds overlapping spans into one', () => {
    expect(
      mergeRanges([
        { start: '2026-09-01', end: '2026-09-10' },
        { start: '2026-09-05', end: '2026-09-15' },
      ]),
    ).toEqual([{ start: '2026-09-01', end: '2026-09-15' }]);
  });

  it('joins adjacent spans', () => {
    expect(
      mergeRanges([
        { start: '2026-09-01', end: '2026-09-05' },
        { start: '2026-09-05', end: '2026-09-08' },
      ]),
    ).toEqual([{ start: '2026-09-01', end: '2026-09-08' }]);
  });

  it('keeps separated spans apart, in order', () => {
    expect(
      mergeRanges([
        { start: '2026-09-20', end: '2026-09-22' },
        { start: '2026-09-01', end: '2026-09-05' },
      ]),
    ).toEqual([
      { start: '2026-09-01', end: '2026-09-05' },
      { start: '2026-09-20', end: '2026-09-22' },
    ]);
  });

  it('swallows a span contained by another', () => {
    expect(
      mergeRanges([
        { start: '2026-09-01', end: '2026-09-30' },
        { start: '2026-09-10', end: '2026-09-12' },
      ]),
    ).toEqual([{ start: '2026-09-01', end: '2026-09-30' }]);
  });
});

describe('utilisationOf', () => {
  const window = { start: '2026-09-01', end: '2026-10-01' }; // 30 days

  it('counts only the days inside the window', () => {
    const result = utilisationOf(
      [reservation({ start: '2026-08-20', end: '2026-09-11' })],
      window,
    );

    expect(result.windowDays).toBe(30);
    expect(result.reservedDays).toBe(10);
    expect(result.rate).toBeCloseTo(10 / 30);
  });

  /** The same predicate the exclusion constraint uses — a cancelled dress is a free dress. */
  it('ignores returned and cancelled reservations', () => {
    const result = utilisationOf(
      [
        reservation({ start: '2026-09-01', end: '2026-09-06', status: 'cancelled' }),
        reservation({ start: '2026-09-10', end: '2026-09-15', status: 'returned' }),
        reservation({ start: '2026-09-20', end: '2026-09-25', status: 'held' }),
      ],
      window,
    );

    expect(result.reservedDays).toBe(5);
    expect(result.reservationCount).toBe(1);
  });

  /**
   * The constraint makes overlapping reservations impossible, so this can only happen to data
   * repaired by hand. Merging first means the figure stays a real proportion instead of
   * exceeding 100%.
   */
  it('never counts a day twice', () => {
    const result = utilisationOf(
      [
        reservation({ start: '2026-09-01', end: '2026-09-20' }),
        reservation({ start: '2026-09-10', end: '2026-09-25' }),
      ],
      window,
    );

    expect(result.reservedDays).toBe(24);
    expect(result.rate!).toBeLessThanOrEqual(1);
  });

  it('reports zero for a gown nobody booked', () => {
    const result = utilisationOf([], window);
    expect(result.reservedDays).toBe(0);
    expect(result.rate).toBe(0);
  });

  /** Null rather than NaN or Infinity: an empty window has no rate to report. */
  it('has no rate for an empty window', () => {
    const result = utilisationOf([], { start: '2026-09-01', end: '2026-09-01' });
    expect(result.rate).toBeNull();
  });
});

describe('finding the reservation for a day', () => {
  const reservations = [
    reservation({ start: '2026-09-01', end: '2026-09-06', reference: 'FIRST111' }),
    reservation({ start: '2026-09-20', end: '2026-09-25', reference: 'SECOND22', status: 'held' }),
    reservation({ start: '2026-09-10', end: '2026-09-12', reference: 'GONE0000', status: 'cancelled' }),
  ];

  it('finds who has the gown today', () => {
    expect(reservationOn(reservations, '2026-09-03')?.reference).toBe('FIRST111');
    expect(reservationOn(reservations, '2026-09-06')).toBeNull();
    // Cancelled holds nothing, so nobody has it that day.
    expect(reservationOn(reservations, '2026-09-11')).toBeNull();
  });

  it('finds the next reservation still to start', () => {
    expect(nextReservation(reservations, '2026-09-07')?.reference).toBe('SECOND22');
  });

  /** A reservation already under way is not "upcoming" — reservationOn answers that. */
  it('skips a reservation that has already begun', () => {
    expect(nextReservation(reservations, '2026-09-03')?.reference).toBe('SECOND22');
  });

  it('returns null when nothing is left', () => {
    expect(nextReservation(reservations, '2026-10-01')).toBeNull();
  });
});
