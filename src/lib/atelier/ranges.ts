import { addDays, fromIsoDate, toIsoDate, type IsoDate } from '@/lib/datetime';

/**
 * Half-open date ranges, the way Postgres stores them.
 *
 * Pure functions: no clock, no database, no globals — the same split as the availability engine,
 * and for the same reason. The awkward cases in a rental calendar are all boundary cases (does
 * the next bride collect on the return day? does a cleaning buffer close the gap?), and boundary
 * cases are only testable when the arithmetic has nothing else in it.
 *
 * `start` is the first day occupied, `end` is the first day free. `[2026-09-01, 2026-09-06)`
 * covers the 1st through the 5th, which is exactly what `daterange` means — keeping the same
 * convention on both sides of the wire is what stops an off-by-one becoming a double booking.
 */

export interface DateRange {
  /** First occupied day, inclusive. */
  start: IsoDate;
  /** First free day, exclusive. */
  end: IsoDate;
}

/** Days between two ISO dates. Positive when `to` is later. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = fromIsoDate(to).getTime() - fromIsoDate(from).getTime();
  // Rounded rather than floored: DST would otherwise shave a day, and while Algeria has none,
  // the browser rendering this calendar may not be in Algeria.
  return Math.round(ms / 86_400_000);
}

/** How many days the range occupies. A range that ends where it starts occupies none. */
export function rangeLength(range: DateRange): number {
  return Math.max(0, daysBetween(range.start, range.end));
}

export function shiftDate(iso: IsoDate, days: number): IsoDate {
  return toIsoDate(addDays(fromIsoDate(iso), days));
}

/**
 * The last day someone actually wears the dress, ignoring any cleaning days after it.
 *
 * There is deliberately no inverse here. The stored range is built in exactly one place —
 * `reserve_gown`, inside the transaction that also enforces the constraint — because a second
 * implementation in TypeScript is a second thing that can drift, and the two disagreeing by one
 * day is precisely the bug that ends with two brides holding one dress. This module reads
 * ranges; Postgres writes them.
 */
export function lastWornDay(range: DateRange, cleaningBufferDays = 0): IsoDate {
  return shiftDate(range.end, -1 - Math.max(0, cleaningBufferDays));
}

/** True when the two ranges share at least one day. Mirrors Postgres's `&&`. */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function containsDay(range: DateRange, day: IsoDate): boolean {
  return day >= range.start && day < range.end;
}

/** The part of `range` lying inside `window`, or null when they do not meet. */
export function clamp(range: DateRange, window: DateRange): DateRange | null {
  const start = range.start > window.start ? range.start : window.start;
  const end = range.end < window.end ? range.end : window.end;
  return start < end ? { start, end } : null;
}

/**
 * Parses Postgres's `daterange` text form, `[2026-09-01,2026-09-06)`.
 *
 * PostgREST returns the literal rather than a structured value, and every bound Postgres emits
 * for a `daterange` is canonicalised to `[)` — so anything else is a shape we did not write and
 * should not silently reinterpret.
 */
export function parseDateRange(literal: string): DateRange | null {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(literal.trim());
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

export function formatDateRange(range: DateRange): string {
  return `[${range.start},${range.end})`;
}
