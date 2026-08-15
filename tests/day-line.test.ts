import { describe, expect, it } from 'vitest';
import {
  dayWindow,
  formatMinute,
  hourTicks,
  isRequest,
  layOutDay,
  packRows,
  positionOf,
  type ConsoleAppointment,
} from '@/lib/console/day-line';
import { dayKpis } from '@/lib/console/kpis';

/**
 * The day-line's arithmetic, with no database and no clock.
 *
 * §13 calls this the most important screen in the console, and everything that makes it hard is
 * an edge case: an appointment running past the axis, two stylists at the same minute, a request
 * that occupies no time at all. None of those is reachable through a rendered component test.
 */

const appointment = (
  overrides: Partial<ConsoleAppointment> & { startMinute: number },
): ConsoleAppointment => ({
  id: overrides.id ?? crypto.randomUUID(),
  reference: overrides.reference ?? 'AAAA1111',
  line: overrides.line ?? 'salon',
  status: overrides.status ?? 'confirmed',
  startMinute: overrides.startMinute,
  endMinute: overrides.endMinute === undefined ? overrides.startMinute + 60 : overrides.endMinute,
  clientName: overrides.clientName ?? 'Amel Benali',
  clientPhone: overrides.clientPhone ?? '0553366712',
  staffName: overrides.staffName ?? 'Nour',
  serviceName: overrides.serviceName ?? 'Coupe',
  gownName: overrides.gownName ?? null,
  priceCharged: overrides.priceCharged === undefined ? 200_000 : overrides.priceCharged,
  notes: overrides.notes ?? null,
});

const at = (hour: number, minute = 0) => hour * 60 + minute;

describe('dayWindow', () => {
  it('uses the opening hours when the salon has recorded them', () => {
    const window = dayWindow(
      [{ opensAt: at(9), closesAt: at(19) }],
      [appointment({ startMinute: at(14) })],
    );
    expect(window).toEqual({ from: at(9), to: at(19) });
  });

  it('spans a split shift from first open to last close', () => {
    const window = dayWindow(
      [
        { opensAt: at(9), closesAt: at(12) },
        { opensAt: at(14), closesAt: at(19) },
      ],
      [],
    );
    expect(window).toEqual({ from: at(9), to: at(19) });
  });

  /**
   * The rule the design broke. Hardcoding 09:00–19:00 asserts opening hours nobody supplied
   * (§6), and would draw a closed sign over a day the salon actually worked.
   */
  it('falls back to the day’s own appointments, padded, when hours are unknown', () => {
    const window = dayWindow([], [
      appointment({ startMinute: at(11), endMinute: at(12) }),
      appointment({ startMinute: at(15), endMinute: at(16, 30) }),
    ]);
    expect(window).toEqual({ from: at(10), to: at(17, 30) });
  });

  it('never runs past either end of the day', () => {
    const window = dayWindow([], [appointment({ startMinute: at(0, 15), endMinute: at(23, 50) })]);
    expect(window).toEqual({ from: 0, to: 24 * 60 });
  });

  /** Neither hours nor appointments: there is honestly nothing to draw, and the page says so. */
  it('is null when there is nothing to derive a scale from', () => {
    expect(dayWindow([], [])).toBeNull();
  });

  it('ignores cancelled appointments when deriving the scale', () => {
    const window = dayWindow([], [
      appointment({ startMinute: at(6), endMinute: at(7), status: 'cancelled' }),
      appointment({ startMinute: at(14), endMinute: at(15) }),
    ]);
    expect(window).toEqual({ from: at(13), to: at(16) });
  });

  /** A lone request has no end, so naive arithmetic would give a zero-width axis. */
  it('still produces a usable scale for a single request', () => {
    const window = dayWindow([], [appointment({ startMinute: at(10), endMinute: null })]);
    expect(window).not.toBeNull();
    expect(window!.to).toBeGreaterThan(window!.from);
  });
});

describe('positionOf', () => {
  const window = { from: at(9), to: at(19) }; // 600 minutes

  it('places a block as a fraction of the axis', () => {
    const position = positionOf(appointment({ startMinute: at(12), endMinute: at(13) }), window);
    expect(position.offset).toBeCloseTo(180 / 600);
    expect(position.width).toBeCloseTo(60 / 600);
  });

  it('gives a request an offset but no width', () => {
    const position = positionOf(
      appointment({ startMinute: at(12), endMinute: null }),
      window,
    );
    expect(position.offset).toBeCloseTo(180 / 600);
    // A width would imply a duration nobody supplied.
    expect(position.width).toBeNull();
  });

  /** Clipped, never dropped: a block that overflows is a layout bug, one that vanishes is a
   *  client nobody serves. */
  it('clips an appointment that starts before the axis', () => {
    const position = positionOf(appointment({ startMinute: at(7), endMinute: at(10) }), window);
    expect(position.offset).toBe(0);
    expect(position.width).toBeCloseTo(60 / 600);
  });

  it('clips an appointment that ends after the axis', () => {
    const position = positionOf(appointment({ startMinute: at(18), endMinute: at(22) }), window);
    expect(position.offset).toBeCloseTo(540 / 600);
    expect(position.width).toBeCloseTo(60 / 600);
  });

  it('survives a degenerate window without dividing by zero', () => {
    const position = positionOf(appointment({ startMinute: at(12) }), { from: at(9), to: at(9) });
    expect(Number.isFinite(position.offset)).toBe(true);
  });
});

describe('packRows', () => {
  it('keeps non-overlapping appointments on one row', () => {
    const rows = packRows([
      appointment({ startMinute: at(9), endMinute: at(10) }),
      appointment({ startMinute: at(10), endMinute: at(11) }),
      appointment({ startMinute: at(11), endMinute: at(12) }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(3);
  });

  /**
   * The exclusion constraint stops one stylist being booked twice, not one lane holding two
   * stylists — Nour and Sophie both cutting at 14:00 is a perfectly good Saturday, and drawing
   * them on top of each other would hide one of them.
   */
  it('stacks overlapping appointments onto separate rows', () => {
    const rows = packRows([
      appointment({ startMinute: at(14), endMinute: at(15), staffName: 'Nour' }),
      appointment({ startMinute: at(14), endMinute: at(15), staffName: 'Sophie' }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('uses no more rows than the busiest moment needs', () => {
    const rows = packRows([
      appointment({ startMinute: at(9), endMinute: at(12) }),
      appointment({ startMinute: at(10), endMinute: at(11) }),
      // Starts after the second ends, so it can share that row.
      appointment({ startMinute: at(11), endMinute: at(12) }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(2);
  });

  /** Half-open again: one ending exactly as the next begins is not an overlap. */
  it('does not stack appointments that merely touch', () => {
    const rows = packRows([
      appointment({ startMinute: at(9), endMinute: at(10) }),
      appointment({ startMinute: at(10), endMinute: at(11) }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it('returns nothing for an empty day', () => {
    expect(packRows([])).toEqual([]);
  });
});

describe('layOutDay', () => {
  const appointments = [
    appointment({ startMinute: at(9), line: 'salon' }),
    appointment({ startMinute: at(10), line: 'bridal' }),
    appointment({ startMinute: at(11), line: 'makeup' }),
    appointment({ startMinute: at(12), line: 'salon', endMinute: null }),
    appointment({ startMinute: at(13), line: 'salon', status: 'cancelled' }),
  ];

  it('always returns the three lanes, in order, even when empty', () => {
    expect(layOutDay([]).map((lane) => lane.line)).toEqual(['salon', 'bridal', 'makeup']);
  });

  it('keeps requests out of the grid', () => {
    const salon = layOutDay(appointments).find((lane) => lane.line === 'salon')!;

    expect(salon.requests).toHaveLength(1);
    expect(salon.requests[0].startMinute).toBe(at(12));
    // The request must not also appear as a positioned block.
    expect(salon.rows.flat().some(isRequest)).toBe(false);
    expect(salon.rows.flat()).toHaveLength(1);
  });

  it('drops cancelled appointments from the day entirely', () => {
    const salon = layOutDay(appointments).find((lane) => lane.line === 'salon')!;
    const all = [...salon.rows.flat(), ...salon.requests];
    expect(all.some((a) => a.status === 'cancelled')).toBe(false);
  });
});

describe('hourTicks', () => {
  it('marks each whole hour inside the window', () => {
    const ticks = hourTicks({ from: at(9), to: at(12) });
    expect(ticks.map((t) => t.label)).toEqual(['09:00', '10:00', '11:00', '12:00']);
    expect(ticks[0].offset).toBe(0);
    expect(ticks[3].offset).toBe(1);
  });

  it('starts at the first whole hour after a ragged edge', () => {
    const ticks = hourTicks({ from: at(9, 20), to: at(11, 40) });
    expect(ticks.map((t) => t.label)).toEqual(['10:00', '11:00']);
  });

  it('produces nothing for a degenerate window', () => {
    expect(hourTicks({ from: at(9), to: at(9) })).toEqual([]);
  });
});

describe('formatMinute', () => {
  it('zero-pads a 24-hour clock', () => {
    expect(formatMinute(at(9, 5))).toBe('09:05');
    expect(formatMinute(at(14, 30))).toBe('14:30');
    expect(formatMinute(0)).toBe('00:00');
  });
});

describe('dayKpis', () => {
  it('counts the live appointments and flags the requests among them', () => {
    const kpis = dayKpis({
      appointments: [
        appointment({ startMinute: at(9) }),
        appointment({ startMinute: at(10), endMinute: null }),
        appointment({ startMinute: at(11), status: 'cancelled' }),
      ],
      gownsOut: 2,
      unansweredMessages: 0,
    });

    expect(kpis.appointmentCount).toBe(2);
    expect(kpis.requestCount).toBe(1);
    expect(kpis.gownsOut).toBe(2);
  });

  it('sums only the settled prices', () => {
    const kpis = dayKpis({
      appointments: [
        appointment({ startMinute: at(9), priceCharged: 200_000 }),
        appointment({ startMinute: at(10), priceCharged: 150_000 }),
        // A range or a floor on the tariff — settled at the chair, not now.
        appointment({ startMinute: at(11), priceCharged: null }),
      ],
      gownsOut: 0,
      unansweredMessages: 0,
    });

    expect(kpis.bookedRevenue).toBe(350_000);
    // Surfaced so the figure can be qualified rather than presented as the whole day.
    expect(kpis.unpricedCount).toBe(1);
  });

  /**
   * Most of the published tariff is ranges and floors. A day made entirely of those has a
   * genuinely unknown value, and reporting 0 DA would state the cheapest possible day as fact.
   */
  it('reports null, not zero, when nothing on the day has a settled price', () => {
    const kpis = dayKpis({
      appointments: [appointment({ startMinute: at(9), priceCharged: null })],
      gownsOut: 0,
      unansweredMessages: 0,
    });

    expect(kpis.bookedRevenue).toBeNull();
    expect(kpis.unpricedCount).toBe(1);
  });

  it('excludes cancelled appointments from revenue', () => {
    const kpis = dayKpis({
      appointments: [
        appointment({ startMinute: at(9), priceCharged: 200_000 }),
        appointment({ startMinute: at(10), priceCharged: 999_000, status: 'cancelled' }),
      ],
      gownsOut: 0,
      unansweredMessages: 0,
    });

    expect(kpis.bookedRevenue).toBe(200_000);
  });

  it('passes the unanswered message count straight through', () => {
    const kpis = dayKpis({ appointments: [], gownsOut: 0, unansweredMessages: 3 });
    expect(kpis.unansweredMessages).toBe(3);
    expect(kpis.bookedRevenue).toBeNull();
  });
});
