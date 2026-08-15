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
