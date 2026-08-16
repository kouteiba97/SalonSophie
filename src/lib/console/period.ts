import type { IsoDate } from '@/lib/datetime';

/**
 * The window a finances question is asked about.
 *
 * Pure, and in its own module for the same reason the availability engine is: month arithmetic is
 * where a reporting screen quietly goes wrong, and every bug it produces is off by exactly one day
 * at a boundary — invisible in a screenshot, and wrong in the direction of flattering the numbers.
 *
 * Both ends are **inclusive**, matching the reporting functions, which all filter with
 * `between p_from and p_to`. That is the opposite convention to the atelier's half-open date
 * ranges, and mixing them up is the single easiest mistake here — hence this note rather than a
 * silent assumption.
 */

export const PERIOD_PRESETS = ['month', 'last-month', 'year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  from: IsoDate;
  to: IsoDate;
  /** Which control is showing as chosen. 'custom' when the dates came from the URL directly. */
  preset: PeriodPreset | 'custom';
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-08-16` → its parts, without going through Date and picking up a timezone on the way. */
function parts(iso: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Days in a month, leap years included — `new Date(y, m, 0)` reads the previous month's last day. */
function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodFromPreset(preset: PeriodPreset, today: IsoDate): Period {
  const { year, month } = parts(today);

  if (preset === 'year') {
    return { from: iso(year, 1, 1), to: iso(year, 12, 31), preset };
  }

  if (preset === 'last-month') {
    // January's previous month is December of the year before, which is the case that breaks.
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    return { from: iso(y, m, 1), to: iso(y, m, lastDayOf(y, m)), preset };
  }

  return { from: iso(year, month, 1), to: iso(year, month, lastDayOf(year, month)), preset };
}

/**
 * What the URL is asking for.
 *
 * Explicit dates win over a preset, because they are the more specific request. Anything
 * unparseable falls back to the current month rather than erroring — a mistyped query string
 * should show a screen, not a stack trace.
 */
export function resolvePeriod(
  params: { from?: string; to?: string; period?: string },
  today: IsoDate,
): Period {
  const from = params.from?.trim();
  const to = params.to?.trim();

  if (from && to && ISO.test(from) && ISO.test(to)) {
    // Typed backwards means the range between them, not an empty one.
    return from <= to ? { from, to, preset: 'custom' } : { from: to, to: from, preset: 'custom' };
  }

  const preset = PERIOD_PRESETS.find((value) => value === params.period);
  return periodFromPreset(preset ?? 'month', today);
}

/** Midnight UTC for a calendar date — an anchor for counting days, never for display. */
function utcOf(date: IsoDate): number {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
}

/** How many days the period covers, both ends included. */
export function daysInPeriod(period: Period): number {
  return Math.round((utcOf(period.to) - utcOf(period.from)) / 86_400_000) + 1;
}
