import type { Centimes } from '@/lib/money';
import { isRequest, occupiesTime, type ConsoleAppointment } from './day-line';

/**
 * The four cards above the day-line (§13).
 *
 * Pure, and deliberately shaped so that "we do not know" is a value rather than a zero. Booked
 * revenue is the one that would be easy to get quietly wrong: most of the published tariff is
 * ranges and floors, so a naive sum reports the cheapest possible day as though it were a
 * forecast, and reports it confidently.
 */

export interface DayKpis {
  /** Appointments in the book today, requests included — they are still people expecting a reply. */
  appointmentCount: number;
  /** Of those, the ones holding no slot until someone confirms them. */
  requestCount: number;
  /**
   * Sum of the prices that are actually settled.
   *
   * Null when nothing on the day has a settled price at all, which is different from zero: zero
   * is a day with no bookings, null is a day whose value nobody can state yet.
   */
  bookedRevenue: Centimes | null;
  /** How many of the day's appointments have no settled price, so the figure can be qualified. */
  unpricedCount: number;
  /** Gowns physically out today. */
  gownsOut: number;
  /** Client messages nobody has answered — §13 wants this styled as an alert. */
  unansweredMessages: number;
}

export function dayKpis(input: {
  appointments: ConsoleAppointment[];
  gownsOut: number;
  unansweredMessages: number;
}): DayKpis {
  // Cancelled and no-show appointments are history, not today's workload.
  const live = input.appointments.filter(occupiesTime);

  const priced = live.filter((a) => a.priceCharged !== null);
  const unpricedCount = live.length - priced.length;

  return {
    appointmentCount: live.length,
    requestCount: live.filter(isRequest).length,
    bookedRevenue:
      priced.length > 0 ? priced.reduce((total, a) => total + (a.priceCharged ?? 0), 0) : null,
    unpricedCount,
    gownsOut: input.gownsOut,
    unansweredMessages: input.unansweredMessages,
  };
}
