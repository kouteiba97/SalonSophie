import { BOOKING_HORIZON } from '@/data/business';
import { addDays, startOfDay, toIsoDate, type IsoDate } from '../datetime';

/**
 * The availability engine — BUILD_BRIEF §5.3 items 6, 7, 8.
 *
 * A pure function over explicit inputs: no clock, no database, no globals. That is what makes
 * the awkward cases testable — a stylist on leave for half a day, a public holiday, a service
 * longer than the remaining opening hours, a slot that collides with an existing appointment.
 *
 * What it replaces:
 *
 *     hash(s){ let h=7; for(...) h=(h*31 + s.charCodeAt(i))>>>0; return h; }
 *     slotsOf(iso){ return SLOTS.map(t=>({t, taken:this.hash(iso+t)%4===0})); }
 *     const closed = d.getDay()===5;
 *
 * The design marked a quarter of slots taken and every Friday closed, deterministically and with
 * no relationship to reality. A client could be turned away from an empty Tuesday.
 *
 * ── On missing data ──────────────────────────────────────────────────────────────────────────
 * Opening hours and service durations are unknown (§6). Rather than invent either, the engine
 * reports `mode: 'request'`: the client proposes a time and the salon confirms on WhatsApp. The
 * moment real hours and durations exist the same engine returns `mode: 'computed'` with real
 * slots, and nothing else in the app changes.
 */

/** Minutes since midnight, in the salon's local wall clock. */
export type MinuteOfDay = number;

export const toMinuteOfDay = (time: string): MinuteOfDay => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinuteOfDay = (minute: MinuteOfDay): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export interface OpeningWindow {
  opensAt: MinuteOfDay;
  closesAt: MinuteOfDay;
}

/** A span already occupied — an existing appointment, or a stylist's time off. */
export interface Busy {
  from: MinuteOfDay;
  to: MinuteOfDay;
}

export interface DayInput {
  date: Date;
  /** Empty when the salon is closed that day, or when hours are simply not known. */
  opening: OpeningWindow[];
  /** Windows the staff member actually works, intersected with opening hours. */
  working: OpeningWindow[];
  busy: Busy[];
}

export interface EngineConfig {
  /** Null when unknown (§6) — the engine then cannot size a slot. */
  serviceDurationMinutes: number | null;
  /** Cleaning / turnaround after the service, inside the occupied span. */
  bufferMinutes: number;
  /** Slots start on this grid: 15 gives 09:00, 09:15, 09:30… */
  granularityMinutes: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  /** Injected so tests are not at the mercy of the wall clock. */
  now: Date;
}

export const DEFAULT_CONFIG: Omit<EngineConfig, 'serviceDurationMinutes' | 'now'> = {
  bufferMinutes: 0,
  granularityMinutes: 15,
  minLeadTimeHours: BOOKING_HORIZON.minLeadTimeHours,
  maxAdvanceDays: BOOKING_HORIZON.maxAdvanceDays,
};

export type UnavailableReason =
  | 'past'
  | 'tooSoon'
  | 'tooFar'
  | 'closed'
  | 'timeOff'
  | 'full'
  | 'unknownHours'
  | 'unknownDuration';

export interface Slot {
  time: string;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
}

export type DayAvailability =
  | {
      iso: IsoDate;
      mode: 'computed';
      slots: Slot[];
      /** Present when the day yields no slots, explaining why in words. */
      reason: UnavailableReason | null;
    }
  | {
      iso: IsoDate;
      /** Real availability cannot be computed; the client proposes a time instead. */
      mode: 'request';
      reason: Extract<UnavailableReason, 'unknownHours' | 'unknownDuration'>;
    }
  | {
      iso: IsoDate;
      mode: 'unavailable';
      reason: UnavailableReason;
    };

/** Merges overlapping or touching spans so gap-finding is a single pass. */
export function mergeSpans(spans: Busy[]): Busy[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const merged: Busy[] = [sorted[0]];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/** The parts of `window` left after removing every busy span. */
export function freeWindows(window: OpeningWindow, busy: Busy[]): OpeningWindow[] {
  const free: OpeningWindow[] = [];
  let cursor = window.opensAt;

  for (const span of mergeSpans(busy)) {
    if (span.to <= window.opensAt || span.from >= window.closesAt) continue;
    if (span.from > cursor) free.push({ opensAt: cursor, closesAt: Math.min(span.from, window.closesAt) });
    cursor = Math.max(cursor, span.to);
    if (cursor >= window.closesAt) break;
  }

  if (cursor < window.closesAt) free.push({ opensAt: cursor, closesAt: window.closesAt });
  return free.filter((w) => w.closesAt > w.opensAt);
}

/**
 * Slots for one day and one staff member.
 *
 * A slot is only offered if the *whole* service plus its buffer fits before closing — the design
 * offered 18:30 regardless of whether the service ran past the end of the day.
 */
export function slotsForDay(day: DayInput, config: EngineConfig): DayAvailability {
  const iso = toIsoDate(day.date);
  const today = startOfDay(config.now);
  const target = startOfDay(day.date);

  if (target < today) return { iso, mode: 'unavailable', reason: 'past' };

  const earliest = startOfDay(addDays(today, Math.ceil(config.minLeadTimeHours / 24)));
  if (target < earliest) return { iso, mode: 'unavailable', reason: 'tooSoon' };

  if (target > startOfDay(addDays(today, config.maxAdvanceDays))) {
    return { iso, mode: 'unavailable', reason: 'tooFar' };
  }

  // Unknown beats guessed. Hours first: without them we do not even know if the salon is open.
  if (day.opening.length === 0) return { iso, mode: 'request', reason: 'unknownHours' };
  if (config.serviceDurationMinutes === null) {
    return { iso, mode: 'request', reason: 'unknownDuration' };
  }

  if (day.working.length === 0) return { iso, mode: 'unavailable', reason: 'timeOff' };

  const occupies = config.serviceDurationMinutes + config.bufferMinutes;
  const slots: Slot[] = [];

  for (const window of day.working) {
    for (const free of freeWindows(window, day.busy)) {
      // Start on the granularity grid, but never before the window opens.
      let start = Math.ceil(free.opensAt / config.granularityMinutes) * config.granularityMinutes;
      while (start + occupies <= free.closesAt) {
        slots.push({
          time: fromMinuteOfDay(start),
          startMinute: start,
          endMinute: start + config.serviceDurationMinutes,
        });
        start += config.granularityMinutes;
      }
    }
  }

  return {
    iso,
    mode: 'computed',
    slots,
    reason: slots.length === 0 ? 'full' : null,
  };
}

/**
 * Intersects a staff member's shift with the salon's opening hours, then removes their time off.
 * Working outside opening hours is not availability, and neither is a shift during leave.
 */
export function workingWindows(
  opening: OpeningWindow[],
  shifts: OpeningWindow[],
  timeOff: Busy[],
): OpeningWindow[] {
  const intersected: OpeningWindow[] = [];

  for (const open of opening) {
    for (const shift of shifts) {
      const from = Math.max(open.opensAt, shift.opensAt);
      const to = Math.min(open.closesAt, shift.closesAt);
      if (to > from) intersected.push({ opensAt: from, closesAt: to });
    }
  }

  return intersected.flatMap((window) =>
    freeWindows(window, timeOff).map((w) => ({ opensAt: w.opensAt, closesAt: w.closesAt })),
  );
}
