import { INTL_TAG, type Locale } from '@/i18n/routing';

/** The salon's wall clock. Timestamps are stored UTC and displayed here (BUILD_BRIEF §7). */
export const SALON_TIME_ZONE = 'Africa/Algiers';

/** `2026-08-15` — a calendar day with no timezone attached. */
export type IsoDate = string;

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromIsoDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00`);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toIsoDate(a) === toIsoDate(b);
}

/**
 * Turns a salon-local date and wall-clock time into an exact instant.
 *
 * Algeria is UTC+1 with no daylight saving, so the offset can be written literally and is never
 * ambiguous — no "which 02:30 did you mean" hour exists here. Timestamps are still stored UTC
 * (§7); this is only how a local time becomes one.
 */
export function salonInstant(date: IsoDate, time: string): string {
  return new Date(`${date}T${time}:00+01:00`).toISOString();
}

export function formatMonthYear(date: Date, locale: Locale): string {
  return date.toLocaleDateString(INTL_TAG[locale], { month: 'long', year: 'numeric' });
}

export function formatLongDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(INTL_TAG[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Weekday name in the reader's own language. 0 = Sunday, matching `getDay()`. */
export function weekdayName(weekday: number, locale: Locale): string {
  // 2026-08-16 was a Sunday, so + weekday lands on the right day without touching the clock.
  return new Date(Date.UTC(2026, 7, 16 + weekday)).toLocaleDateString(INTL_TAG[locale], {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export interface OpeningLine {
  /** "Lundi – Samedi", or a single day's name. */
  days: string;
  /** "09:30 – 17:00", or null when the salon is shut those days. */
  hours: string | null;
}

/**
 * Collapse a seven-day week into the fewest readable lines.
 *
 * The salon trades the same hours six days a week, so printing seven rows would bury the one
 * line that matters — Sunday. Runs of identical days are merged, which also means the output
 * stays right if the console later gives Saturday different hours: it simply splits into more
 * lines rather than quietly showing the wrong ones.
 *
 * The week is walked Monday-first, so the closed day lands at the end rather than splitting the
 * open run in two. Day names come from Intl, so Arabic reads as Arabic and not as a translation.
 */
export function formatOpeningHours(
  days: readonly { weekday: number; isClosed: boolean; opensAt: string | null; closesAt: string | null }[],
  locale: Locale,
): OpeningLine[] {
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];

  const lines: OpeningLine[] = [];
  let run: { first: number; last: number; hours: string | null } | null = null;

  const flush = () => {
    if (!run) return;
    const days =
      run.first === run.last
        ? weekdayName(run.first, locale)
        : `${weekdayName(run.first, locale)} – ${weekdayName(run.last, locale)}`;
    lines.push({ days, hours: run.hours });
    run = null;
  };

  for (const weekday of mondayFirst) {
    const day = byWeekday.get(weekday);
    if (!day) continue;
    const hours = day.isClosed || !day.opensAt || !day.closesAt ? null : `${day.opensAt} – ${day.closesAt}`;
    if (run && run.hours === hours) run.last = weekday;
    else {
      flush();
      run = { first: weekday, last: weekday, hours };
    }
  }
  flush();

  return lines;
}
