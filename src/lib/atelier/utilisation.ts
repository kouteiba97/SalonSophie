import type { IsoDate } from '@/lib/datetime';
import { clamp, containsDay, rangeLength, type DateRange } from './ranges';
import { occupies, type Reservation } from './types';

/**
 * How hard a dress actually works — §13 asks for utilisation per gown.
 *
 * Pure, like the availability engine: reservations and a window in, numbers out. The dashboard
 * gets the same figures from a Postgres aggregate (`gown_utilisation`) because it needs one row
 * per dress without shipping every bride's booking to Node; this is the per-gown path, where the
 * reservations are already loaded to draw the timeline anyway.
 *
 * Only `held` and `confirmed` count. That is not a display choice — it is the same predicate the
 * exclusion constraint uses, so "occupied" means the same thing here as it does in the database.
 */

export interface Utilisation {
  /** Days in the reporting window. */
  windowDays: number;
  /** Days the gown is spoken for, clipped to the window and never double-counted. */
  reservedDays: number;
  /** 0..1, or null when the window is empty rather than reporting a division by zero. */
  rate: number | null;
  reservationCount: number;
}

export function utilisationOf(reservations: Reservation[], window: DateRange): Utilisation {
  const windowDays = rangeLength(window);

  const clipped = reservations
    .filter((r) => occupies(r.status))
    .map((r) => clamp(r.range, window))
    .filter((r): r is DateRange => r !== null);

  /*
   * Summing the clipped lengths would be wrong if two reservations ever overlapped — and the
   * whole point of this feature is that they cannot. Merging first means a utilisation figure
   * stays truthful even against data entered before the constraint existed, or repaired by hand
   * in the SQL console.
   */
  const reservedDays = mergeRanges(clipped).reduce((total, r) => total + rangeLength(r), 0);

  return {
    windowDays,
    reservedDays,
    rate: windowDays > 0 ? reservedDays / windowDays : null,
    reservationCount: clipped.length,
  };
}

/** Sorts by start and folds anything touching or overlapping into one span. */
export function mergeRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: DateRange[] = [{ ...sorted[0] }];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

/** The reservation holding the gown on a given day, if any. */
export function reservationOn(reservations: Reservation[], day: IsoDate): Reservation | null {
  return reservations.find((r) => occupies(r.status) && containsDay(r.range, day)) ?? null;
}

/**
 * The next reservation that starts on or after `today`, for the "what is going out" list.
 * A reservation already under way is not upcoming — `reservationOn` answers that question.
 */
export function nextReservation(reservations: Reservation[], today: IsoDate): Reservation | null {
  return (
    reservations
      .filter((r) => occupies(r.status) && r.range.start >= today)
      .sort((a, b) => (a.range.start < b.range.start ? -1 : 1))[0] ?? null
  );
}
