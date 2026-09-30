import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  freeWindows,
  fromMinuteOfDay,
  mergeSpans,
  slotsForDay,
  toMinuteOfDay,
  workingWindows,
  type EngineConfig,
} from '@/lib/availability/engine';
import { initialMonthOffset, monthGrid } from '@/lib/availability/calendar';

const NOW = new Date('2026-08-15T08:00:00Z');
const IN_RANGE = new Date('2026-08-20T00:00:00');

const config = (over: Partial<EngineConfig> = {}): EngineConfig => ({
  ...DEFAULT_CONFIG,
  serviceDurationMinutes: 60,
  now: NOW,
  ...over,
});

const hours = (from: string, to: string) => ({
  opensAt: toMinuteOfDay(from),
  closesAt: toMinuteOfDay(to),
});

const busy = (from: string, to: string) => ({
  from: toMinuteOfDay(from),
  to: toMinuteOfDay(to),
});

describe('time helpers', () => {
  it('round-trips a wall clock time', () => {
    for (const time of ['00:00', '09:30', '13:45', '23:59']) {
      expect(fromMinuteOfDay(toMinuteOfDay(time))).toBe(time);
    }
  });
});

describe('mergeSpans', () => {
  it('merges overlapping and touching spans', () => {
    const merged = mergeSpans([busy('09:00', '10:00'), busy('09:30', '11:00'), busy('11:00', '12:00')]);
    expect(merged).toEqual([busy('09:00', '12:00')]);
  });

  it('leaves a genuine gap alone', () => {
    const merged = mergeSpans([busy('09:00', '10:00'), busy('11:00', '12:00')]);
    expect(merged).toHaveLength(2);
  });
});

describe('freeWindows', () => {
  it('splits a window around a booking', () => {
    const free = freeWindows(hours('09:00', '17:00'), [busy('12:00', '13:00')]);
    expect(free).toEqual([hours('09:00', '12:00'), hours('13:00', '17:00')]);
  });

  it('returns nothing when the window is fully booked', () => {
    expect(freeWindows(hours('09:00', '17:00'), [busy('08:00', '18:00')])).toEqual([]);
  });

  it('ignores busy spans outside the window', () => {
    const free = freeWindows(hours('09:00', '17:00'), [busy('18:00', '19:00')]);
    expect(free).toEqual([hours('09:00', '17:00')]);
  });
});

describe('workingWindows', () => {
  it('clips a shift to opening hours', () => {
    const working = workingWindows([hours('09:00', '17:00')], [hours('08:00', '20:00')], []);
    expect(working).toEqual([hours('09:00', '17:00')]);
  });

  it('removes time off from the shift', () => {
    const working = workingWindows(
      [hours('09:00', '17:00')],
      [hours('09:00', '17:00')],
      [busy('12:00', '14:00')],
    );
    expect(working).toEqual([hours('09:00', '12:00'), hours('14:00', '17:00')]);
  });

  it('yields nothing when the shift falls entirely outside opening hours', () => {
    expect(workingWindows([hours('09:00', '17:00')], [hours('18:00', '20:00')], [])).toEqual([]);
  });
});

describe('slotsForDay', () => {
  const day = (over: Partial<Parameters<typeof slotsForDay>[0]> = {}) => ({
    date: IN_RANGE,
    opening: [hours('09:00', '17:00')],
    working: [hours('09:00', '17:00')],
    busy: [],
    ...over,
  });

  it('offers slots on the granularity grid', () => {
    const result = slotsForDay(day(), config({ granularityMinutes: 60 }));
    expect(result.mode).toBe('computed');
    if (result.mode !== 'computed') return;
    expect(result.slots.map((s) => s.time)).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    ]);
  });

  /** The design offered 18:30 whether or not the service finished before closing. */
  it('never offers a slot the service cannot finish inside', () => {
    const result = slotsForDay(day(), config({ serviceDurationMinutes: 90, granularityMinutes: 60 }));
    if (result.mode !== 'computed') throw new Error('expected computed');
    const last = result.slots.at(-1)!;
    expect(last.time).toBe('15:00');
    expect(last.endMinute).toBeLessThanOrEqual(toMinuteOfDay('17:00'));
  });

  it('counts the buffer as occupied', () => {
    const result = slotsForDay(
      day(),
      config({ serviceDurationMinutes: 60, bufferMinutes: 30, granularityMinutes: 60 }),
    );
    if (result.mode !== 'computed') throw new Error('expected computed');
    // 16:00 + 60 + 30 would run to 17:30, past closing.
    expect(result.slots.at(-1)!.time).toBe('15:00');
  });

  it('works around an existing appointment', () => {
    const result = slotsForDay(
      day({ busy: [busy('11:00', '13:00')] }),
      config({ granularityMinutes: 60 }),
    );
    if (result.mode !== 'computed') throw new Error('expected computed');
    const times = result.slots.map((s) => s.time);
    expect(times).not.toContain('11:00');
    expect(times).not.toContain('12:00');
    expect(times).toContain('10:00');
    expect(times).toContain('13:00');
  });

  it('reports a fully booked day as full, not as empty', () => {
    const result = slotsForDay(
      day({ busy: [busy('09:00', '17:00')] }),
      config({ granularityMinutes: 60 }),
    );
    if (result.mode !== 'computed') throw new Error('expected computed');
    expect(result.slots).toEqual([]);
    expect(result.reason).toBe('full');
  });

  it('reports time off rather than pretending the salon is shut', () => {
    const result = slotsForDay(day({ working: [] }), config());
    expect(result).toMatchObject({ mode: 'unavailable', reason: 'timeOff' });
  });

  describe('the horizon', () => {
    it('rejects the past', () => {
      const result = slotsForDay(day({ date: new Date('2026-08-01T00:00:00') }), config());
      expect(result).toMatchObject({ mode: 'unavailable', reason: 'past' });
    });

    it('rejects a date inside the minimum lead time', () => {
      const result = slotsForDay(day({ date: new Date('2026-08-15T00:00:00') }), config());
      expect(result).toMatchObject({ mode: 'unavailable', reason: 'tooSoon' });
    });

    it('rejects a date beyond the maximum advance window', () => {
      const result = slotsForDay(day({ date: new Date('2027-06-01T00:00:00') }), config());
      expect(result).toMatchObject({ mode: 'unavailable', reason: 'tooFar' });
    });
  });

  /**
   * Non-negotiable #2 reaching into the engine: unknown data must degrade honestly, never into
   * a plausible-looking default.
   */
  describe('unknown data', () => {
    it('asks the client to propose a time when opening hours are unknown', () => {
      const result = slotsForDay(day({ opening: [] }), config());
      expect(result).toMatchObject({ mode: 'request', reason: 'unknownHours' });
    });

    it('asks the client to propose a time when the duration is unknown', () => {
      const result = slotsForDay(day(), config({ serviceDurationMinutes: null }));
      expect(result).toMatchObject({ mode: 'request', reason: 'unknownDuration' });
    });

    it('never invents a slot from missing data', () => {
      const result = slotsForDay(day({ opening: [] }), config({ serviceDurationMinutes: null }));
      expect(result.mode).not.toBe('computed');
      expect(JSON.stringify(result)).not.toMatch(/\d{2}:\d{2}/);
    });

    it('hardcodes no weekly closing day', () => {
      // 2026-08-21 is a Friday. With hours supplied, it is bookable like any other day —
      // whether the salon closes on Friday is a business_hours row, not a constant.
      const friday = new Date('2026-08-21T00:00:00');
      expect(friday.getDay()).toBe(5);
      const result = slotsForDay(day({ date: friday }), config({ granularityMinutes: 60 }));
      expect(result.mode).toBe('computed');
      if (result.mode !== 'computed') return;
      expect(result.slots.length).toBeGreaterThan(0);
    });
  });

  it('handles a split shift across a lunch break', () => {
    const result = slotsForDay(
      day({ working: [hours('09:00', '12:00'), hours('14:00', '17:00')] }),
      config({ granularityMinutes: 60 }),
    );
    if (result.mode !== 'computed') throw new Error('expected computed');
    const times = result.slots.map((s) => s.time);
    expect(times).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);
  });
});

/**
 * The calendar must never open on a month with nothing to click.
 *
 * Found on 30 September 2026, when the booking e2e failed on desktop and passed on mobile. A cell
 * is disabled when it is outside the grid's month, in the past, or inside the minimum lead time —
 * so on the last day of a month all 42 cells are disabled at once: the earlier days have passed,
 * today is too soon, and the trailing days belong to next month. The mobile week strip is a
 * rolling seven days and crosses the boundary, which is why only one of the two views broke.
 *
 * With a 24-hour lead that is the last day of every month. A client arriving from an Instagram
 * reel would see a calendar greyed out corner to corner and no hint to press "next month".
 *
 * Dates here are deliberately literal: the bug is about where *today* falls in its month, so a
 * relative date would sample whichever day the suite happened to run on and prove nothing.
 */
describe('the month the calendar opens on', () => {
  it.each([
    ['the last day of a 30-day month', new Date('2026-09-30T09:00:00Z')],
    ['the last day of a 31-day month', new Date('2026-07-31T09:00:00Z')],
    ['the last day of February', new Date('2027-02-28T09:00:00Z')],
    ['the day before the last', new Date('2026-09-29T09:00:00Z')],
  ])('offers at least one bookable day on %s', (_label, today) => {
    const offset = initialMonthOffset(today);
    const bookable = monthGrid(offset, today).filter((cell) => !cell.disabled);
    expect(bookable.length).toBeGreaterThan(0);
  });

  it('still opens on the current month when that month has room', () => {
    // Mid-month: nothing forces a jump, and jumping would hide today's availability.
    expect(initialMonthOffset(new Date('2026-09-15T09:00:00Z'))).toBe(0);
  });

  it('jumps exactly one month on the last day, never further', () => {
    expect(initialMonthOffset(new Date('2026-09-30T09:00:00Z'))).toBe(1);
  });
});
