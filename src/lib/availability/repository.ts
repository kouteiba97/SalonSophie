import 'server-only';
import { cache } from 'react';
import { callRpc, getSupabaseServerClient } from '@/lib/supabase/server';
import { addDays, startOfDay, toIsoDate, type IsoDate } from '../datetime';
import { isTodo } from '../todo';
import { findServiceBySlug } from '@/data/catalogue';
import {
  DEFAULT_CONFIG,
  slotsForDay,
  toMinuteOfDay,
  workingWindows,
  type Busy,
  type DayAvailability,
  type OpeningWindow,
} from './engine';

/**
 * Feeds the availability engine from the database.
 *
 * Every input is fetched through a narrow, anon-safe path: opening hours from the table
 * (publicly readable), shifts and leave through `staff_shift_windows` / `staff_time_off_spans`,
 * and existing bookings through `busy_spans` — which returns occupied time with no client
 * attached. The engine itself never touches the network.
 */

import type {
  BusinessHourExceptionRow as ExceptionRow,
  BusinessHoursRow as OpeningRow,
  ShiftWindowRow as ShiftRow,
  SpanRow,
} from '@/lib/supabase/types';

export interface AvailabilityQuery {
  serviceSlug: string;
  /** Slug, or null / 'sans-preference' for no preference. */
  staffSlug: string | null;
  from: Date;
  days: number;
  now?: Date;
}

export interface AvailabilityResult {
  days: DayAvailability[];
  /** False when no database is configured; the UI then asks the client to propose a time. */
  fromDatabase: boolean;
}

/** Minutes since midnight for a `HH:MM[:SS]` value. */
const minutesOf = (time: string) => toMinuteOfDay(time.slice(0, 5));

/** A timestamp's minute-of-day in the salon's timezone. */
function minuteOfDayInSalon(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Algiers',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function dateKeyInSalon(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(iso));
}

/**
 * When there is no database — or no hours, or no duration — every day comes back in request
 * mode. That is the honest answer, and it is what the booking UI already renders.
 */
function allRequestMode(from: Date, days: number, reason: 'unknownHours' | 'unknownDuration'): DayAvailability[] {
  return Array.from({ length: days }, (_, i) => ({
    iso: toIsoDate(addDays(from, i)) as IsoDate,
    mode: 'request' as const,
    reason,
  }));
}

export const getAvailability = cache(
  async (query: AvailabilityQuery): Promise<AvailabilityResult> => {
    const now = query.now ?? new Date();
    const from = startOfDay(query.from);
    const to = addDays(from, query.days - 1);

    const service = await findServiceBySlug(query.serviceSlug);
    const duration = service && !isTodo(service.duration) ? service.duration : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return {
        days: allRequestMode(from, query.days, duration === null ? 'unknownDuration' : 'unknownHours'),
        fromDatabase: false,
      };
    }

    try {
      const fromIso = toIsoDate(from);
      const toIso = toIsoDate(to);

      const [hoursRes, exceptionsRes, shiftsRes, timeOffRes, busyRes] = await Promise.all([
        supabase.from('business_hours').select('*').returns<OpeningRow[]>(),
        supabase
          .from('business_hour_exceptions')
          .select('*')
          .gte('on_date', fromIso)
          .lte('on_date', toIso)
          .returns<ExceptionRow[]>(),
        callRpc<ShiftRow[]>(supabase, 'staff_shift_windows', { p_from: fromIso, p_to: toIso }),
        callRpc<SpanRow[]>(supabase, 'staff_time_off_spans', { p_from: fromIso, p_to: toIso }),
        callRpc<SpanRow[]>(supabase, 'busy_spans', { p_from: fromIso, p_to: toIso }),
      ]);

      if (hoursRes.error) throw hoursRes.error;
      if (exceptionsRes.error) throw exceptionsRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      if (timeOffRes.error) throw timeOffRes.error;
      if (busyRes.error) throw busyRes.error;

      const hours = hoursRes.data ?? [];

      // No hours configured means we genuinely do not know when the salon is open (§6).
      if (hours.length === 0) {
        return { days: allRequestMode(from, query.days, 'unknownHours'), fromDatabase: true };
      }
      if (duration === null) {
        return { days: allRequestMode(from, query.days, 'unknownDuration'), fromDatabase: true };
      }

      const exceptionsByDate = new Map((exceptionsRes.data ?? []).map((e) => [e.on_date, e]));
      const wanted = query.staffSlug && query.staffSlug !== 'sans-preference' ? query.staffSlug : null;

      const days: DayAvailability[] = [];

      for (let i = 0; i < query.days; i++) {
        const date = addDays(from, i);
        const iso = toIsoDate(date);

        // An exception for the day overrides the weekly pattern entirely.
        const exception = exceptionsByDate.get(iso);
        let opening: OpeningWindow[] = [];

        if (exception) {
          if (!exception.is_closed && exception.opens_at && exception.closes_at) {
            opening = [
              { opensAt: minutesOf(exception.opens_at), closesAt: minutesOf(exception.closes_at) },
            ];
          }
        } else {
          opening = hours
            .filter((h) => h.weekday === date.getDay() && !h.is_closed && h.opens_at && h.closes_at)
            .map((h) => ({ opensAt: minutesOf(h.opens_at!), closesAt: minutesOf(h.closes_at!) }));
        }

        // A closed day is closed, not "unknown" — the distinction matters to the copy shown.
        if (opening.length === 0) {
          days.push({ iso, mode: 'unavailable', reason: 'closed' });
          continue;
        }

        const shifts = (shiftsRes.data ?? [])
          .filter((s) => s.on_date === iso && (!wanted || s.staff_slug === wanted))
          .map((s) => ({ opensAt: minutesOf(s.opens_at), closesAt: minutesOf(s.closes_at) }));

        const timeOff: Busy[] = (timeOffRes.data ?? [])
          .filter((t) => (!wanted || t.staff_slug === wanted) && dateKeyInSalon(t.starts_at) <= iso)
          .filter((t) => dateKeyInSalon(t.ends_at) >= iso)
          .map((t) => ({ from: minuteOfDayInSalon(t.starts_at), to: minuteOfDayInSalon(t.ends_at) }));

        const busy: Busy[] = (busyRes.data ?? [])
          .filter((b) => (!wanted || b.staff_slug === wanted) && dateKeyInSalon(b.starts_at) === iso)
          .map((b) => ({ from: minuteOfDayInSalon(b.starts_at), to: minuteOfDayInSalon(b.ends_at) }));

        days.push(
          slotsForDay(
            { date, opening, working: workingWindows(opening, shifts, timeOff), busy },
            { ...DEFAULT_CONFIG, serviceDurationMinutes: duration, now },
          ),
        );
      }

      return { days, fromDatabase: true };
    } catch (error) {
      // Availability failing must never take the booking flow down: fall back to request mode,
      // which is a working path, not an error page.
      console.error('[N&S] availability read failed, falling back to request mode:', error);
      return { days: allRequestMode(from, query.days, 'unknownHours'), fromDatabase: false };
    }
  },
);
