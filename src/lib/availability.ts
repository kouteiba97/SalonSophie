import { BOOKING_HORIZON } from '@/data/business';
import { addDays, startOfDay, toIsoDate, type IsoDate } from './datetime';

/**
 * Availability — BUILD_BRIEF §5.3 items 6, 7, 8.
 *
 * The design faked all of this with a string hash:
 *
 *     hash(s){ let h=7; for(...) h=(h*31 + s.charCodeAt(i))>>>0; return h; }
 *     slotsOf(iso){ return SLOTS.map(t=>({t, taken:this.hash(iso+t)%4===0})); }
 *     const full = this.hash(iso)%11===0;
 *
 * A quarter of slots showed as taken and one day in eleven showed as full, deterministically,
 * with no relationship to reality. A client could be told a free Tuesday was full. All three
 * are deleted and nothing here invents an availability signal.
 *
 * Phase 3 derives real availability from `staff_schedules`, existing `appointments`,
 * `staff_time_off` and the service's real duration, and re-validates server-side inside a
 * transaction so two clients can never take one slot.
 */

export type DisabledReason = 'past' | 'tooSoon' | 'tooFar' | 'closed' | 'full';

export interface DayState {
  date: Date;
  iso: IsoDate;
  /** Outside the rendered month — shown greyed in the 42-cell grid. */
  outsideMonth: boolean;
  disabled: boolean;
  /**
   * Why the day cannot be picked. Rendered as text next to the cell, never conveyed by colour
   * and strikethrough alone (§5.4 item 16).
   */
  reason: DisabledReason | null;
}

/**
 * Provisional booking times.
 *
 * These are NOT confirmed opening hours — those are unknown (§6), and the design's
 * "Samedi – Jeudi, 09 h 00 – 19 h 00" was invented. They exist so the booking UI is complete
 * and demonstrable, and every screen that shows them also shows `availabilityPending`, which
 * tells the client the time is a request confirmed on WhatsApp rather than a held slot.
 *
 * Replace the moment real opening hours arrive; Phase 3 reads them from `business_hours`.
 */
export const PROVISIONAL_SLOTS = [
  '09:00',
  '10:30',
  '12:00',
  '14:00',
  '15:30',
  '17:00',
  '18:30',
] as const;

/**
 * Which days can be requested.
 *
 * Note what is *not* here: the design hardcoded `d.getDay()===5` to close Fridays. Whether the
 * salon closes on Friday is a `business_hours` row, not a constant in a calendar widget, and it
 * is currently unknown — so no day is marked closed. Only the booking horizon applies.
 */
export function dayState(date: Date, options: { outsideMonth?: boolean; today?: Date } = {}): DayState {
  const today = startOfDay(options.today ?? new Date());
  const day = startOfDay(date);
  const iso = toIsoDate(day);
  const outsideMonth = options.outsideMonth ?? false;

  const earliest = startOfDay(addDays(today, Math.ceil(BOOKING_HORIZON.minLeadTimeHours / 24)));
  const latest = startOfDay(addDays(today, BOOKING_HORIZON.maxAdvanceDays));

  let reason: DisabledReason | null = null;
  if (day < today) reason = 'past';
  else if (day < earliest) reason = 'tooSoon';
  else if (day > latest) reason = 'tooFar';

  return {
    date: day,
    iso,
    outsideMonth,
    disabled: outsideMonth || reason !== null,
    reason,
  };
}

/** The 42 cells of a month grid, leading and trailing days included (design's desktop view). */
export function monthGrid(monthOffset: number, today = new Date()): DayState[] {
  const base = startOfDay(today);
  const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();

  const lead = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  return Array.from({ length: 42 }, (_, i) => {
    const n = i - lead + 1;
    if (n < 1) {
      return dayState(new Date(year, month - 1, daysInPrev + n), { outsideMonth: true, today: base });
    }
    if (n > daysInMonth) {
      return dayState(new Date(year, month + 1, n - daysInMonth), { outsideMonth: true, today: base });
    }
    return dayState(new Date(year, month, n), { today: base });
  });
}

/** The rolling 7-day strip (design's mobile view). */
export function weekStrip(weekOffset: number, today = new Date()): DayState[] {
  const base = startOfDay(today);
  return Array.from({ length: 7 }, (_, i) => dayState(addDays(base, weekOffset * 7 + i), { today: base }));
}

/** The month a given offset lands on, for the grid's header label. */
export function monthOf(monthOffset: number, today = new Date()): Date {
  const base = startOfDay(today);
  return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
}
