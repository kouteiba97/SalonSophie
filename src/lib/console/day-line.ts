import type { Centimes } from '@/lib/money';

/**
 * The day-line's arithmetic — §13's signature view, with nothing in it but numbers.
 *
 * Pure, like the availability engine and the atelier's ranges. The hard parts of a timeline are
 * all edge cases: an appointment that starts before the axis, two stylists booked at the same
 * minute, a request that occupies no time at all. None of them is testable once the maths is
 * tangled up with a database and a clock.
 *
 * Everything here is minutes since midnight in the salon's timezone. Converting a stored UTC
 * instant into one of those is the repository's job, done once at the edge.
 */

export type BusinessLine = 'salon' | 'bridal' | 'makeup';

export const LINES: readonly BusinessLine[] = ['salon', 'bridal', 'makeup'];

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface ConsoleAppointment {
  id: string;
  reference: string;
  line: BusinessLine;
  status: AppointmentStatus;
  /** Minutes since midnight, salon time. */
  startMinute: number;
  /**
   * Minutes since midnight, or null when this is a request.
   *
   * A request records a time the client asked for and holds no slot — `appointments.period` is
   * NULL and `requested_start` is set. It has no end because nobody has supplied the service's
   * duration (§6), and inventing one here would turn a wish into a promise on the calendar.
   */
  endMinute: number | null;
  clientName: string;
  clientPhone: string;
  staffName: string | null;
  serviceName: string | null;
  gownName: string | null;
  /** Null when the tariff publishes a range or a floor rather than a single price. */
  priceCharged: Centimes | null;
  notes: string | null;
}

export const isRequest = (appointment: ConsoleAppointment): boolean =>
  appointment.endMinute === null;

/** A cancelled or missed appointment still happened to the book, but occupies no time. */
export const occupiesTime = (appointment: ConsoleAppointment): boolean =>
  appointment.status === 'pending' || appointment.status === 'confirmed' ||
  appointment.status === 'completed';

export interface TimeWindow {
  /** Minutes since midnight. */
  from: number;
  to: number;
}

export interface OpeningWindow {
  opensAt: number;
  closesAt: number;
}

const DAY_END = 24 * 60;
const clampMinute = (minute: number) => Math.min(DAY_END, Math.max(0, minute));

/**
 * The axis the day is drawn on.
 *
 * The design hardcoded 09:00–19:00 and the brief bans it outright: opening hours are unknown
 * (§6), and an axis that asserts them would put a closed sign on a day the salon worked. So the
 * window is derived —
 *
 *   1. from `business_hours`, once somebody fills that table in;
 *   2. failing that, from the appointments actually in the book, padded by an hour so the first
 *      and last blocks are not flush against the edge;
 *   3. failing that, null — there is genuinely nothing to draw, and the view says so rather
 *      than rendering an empty grid that looks like a closed day.
 *
 * Deriving from the appointments is not a guess about opening hours: it makes no claim beyond
 * "these are the hours with something in them", which is exactly what is known.
 */
export function dayWindow(
  openings: OpeningWindow[],
  appointments: ConsoleAppointment[],
  paddingMinutes = 60,
): TimeWindow | null {
  const open = openings.filter((o) => o.closesAt > o.opensAt);
  if (open.length > 0) {
    return {
      from: clampMinute(Math.min(...open.map((o) => o.opensAt))),
      to: clampMinute(Math.max(...open.map((o) => o.closesAt))),
    };
  }

  const busy = appointments.filter(occupiesTime);
  if (busy.length === 0) return null;

  const earliest = Math.min(...busy.map((a) => a.startMinute));
  const latest = Math.max(...busy.map((a) => a.endMinute ?? a.startMinute));

  const from = clampMinute(earliest - paddingMinutes);
  const to = clampMinute(latest + paddingMinutes);

  // A single request at 09:00 would otherwise produce a zero-width axis.
  return to > from ? { from, to } : { from, to: clampMinute(from + paddingMinutes) };
}

export interface Position {
  /** 0..1 across the axis. */
  offset: number;
  /** 0..1 of the axis width. Null for a request, which occupies no time. */
  width: number | null;
}

/**
 * Where a block sits on the axis, as fractions rather than pixels — the component decides how
 * wide the axis is, and RTL flips it with logical properties rather than arithmetic.
 *
 * An appointment running past either edge is clipped to the axis rather than dropped: a block
 * that overflows is a layout bug, but a block that vanishes is a client nobody serves.
 */
export function positionOf(appointment: ConsoleAppointment, window: TimeWindow): Position {
  const span = window.to - window.from;
  if (span <= 0) return { offset: 0, width: null };

  const fraction = (minute: number) => Math.min(1, Math.max(0, (minute - window.from) / span));

  const offset = fraction(appointment.startMinute);
  if (appointment.endMinute === null) return { offset, width: null };

  return { offset, width: Math.max(0, fraction(appointment.endMinute) - offset) };
}

/**
 * Packs appointments into as few rows as will hold them without overlap.
 *
 * The exclusion constraint stops one stylist being booked twice, not one lane holding two
 * stylists — Nour and Sophie both cutting at 14:00 is a perfectly good Saturday. Drawing them on
 * top of each other would hide one, so overlapping blocks stack.
 *
 * Greedy first-fit over start-sorted intervals, which is the classic interval-graph colouring
 * and provably uses the minimum number of rows.
 */
export function packRows(appointments: ConsoleAppointment[]): ConsoleAppointment[][] {
  const sorted = [...appointments].sort(
    (a, b) => a.startMinute - b.startMinute || (a.endMinute ?? a.startMinute) - (b.endMinute ?? b.startMinute),
  );

  const rows: ConsoleAppointment[][] = [];

  for (const appointment of sorted) {
    const row = rows.find((candidate) => {
      const last = candidate[candidate.length - 1];
      return (last.endMinute ?? last.startMinute) <= appointment.startMinute;
    });

    if (row) row.push(appointment);
    else rows.push([appointment]);
  }

  return rows;
}

export interface Lane {
  line: BusinessLine;
  /** Scheduled appointments, stacked so none hides another. */
  rows: ConsoleAppointment[][];
  /**
   * Requests, kept out of the grid entirely.
   *
   * They hold no slot, so drawing them as blocks would imply a length nobody has supplied and
   * a commitment nobody has made. They are listed under the lane instead, at the time asked for.
   */
  requests: ConsoleAppointment[];
}

export function layOutDay(appointments: ConsoleAppointment[]): Lane[] {
  return LINES.map((line) => {
    const inLane = appointments.filter((a) => a.line === line && occupiesTime(a));

    return {
      line,
      rows: packRows(inLane.filter((a) => !isRequest(a))),
      requests: inLane
        .filter(isRequest)
        .sort((a, b) => a.startMinute - b.startMinute),
    };
  });
}

/** Whole-hour marks across the axis, for the ruler above the lanes. */
export function hourTicks(window: TimeWindow): { minute: number; offset: number; label: string }[] {
  const span = window.to - window.from;
  if (span <= 0) return [];

  const ticks: { minute: number; offset: number; label: string }[] = [];
  const firstHour = Math.ceil(window.from / 60);
  const lastHour = Math.floor(window.to / 60);

  for (let hour = firstHour; hour <= lastHour; hour++) {
    const minute = hour * 60;
    ticks.push({
      minute,
      offset: (minute - window.from) / span,
      // 24-hour, zero-padded: unambiguous in all three locales, and the salon's own clock.
      label: `${String(hour % 24).padStart(2, '0')}:00`,
    });
  }

  return ticks;
}

/** `14:30` from minutes since midnight. */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = Math.round(minute % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
