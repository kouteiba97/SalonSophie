import 'server-only';
import { cache } from 'react';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import type { BusinessHoursRow } from '@/lib/supabase/types';
import type { IsoDate } from '@/lib/datetime';
import { SALON_TIME_ZONE } from '@/lib/datetime';
import type { AppointmentStatus, BusinessLine, ConsoleAppointment, OpeningWindow } from './day-line';
import {
  DEMO_GOWNS_OUT,
  demoAppointments,
  demoOpeningWindows,
  demoUnansweredCount,
  isDemoMode,
} from './demo';

/**
 * Feeds the console from the database, as the signed-in staff member.
 *
 * RLS does the filtering, which is what makes the same page correct for three different roles:
 * `appointments_read` gives owner and reception every appointment and a stylist only their own,
 * so "the day" means the right thing without this file knowing who is asking.
 */

interface AppointmentRow {
  id: string;
  reference: string;
  line: BusinessLine;
  status: AppointmentStatus;
  period: string | null;
  requested_start: string | null;
  notes: string | null;
  clients: { full_name: string; phone: string } | null;
  staff: { display_name: string } | null;
  gowns: { name: string } | null;
  appointment_services: { price_charged: number | null; services: { name: string } | null }[] | null;
}

const SELECT_APPOINTMENT = `
  id, reference, line, status, period, requested_start, notes,
  clients ( full_name, phone ),
  staff ( display_name ),
  gowns ( name ),
  appointment_services ( price_charged, services ( name ) )
`;

/** Minutes since midnight in Africa/Algiers for a stored UTC instant. */
function minuteOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALON_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** The calendar day a stored instant falls on, in the salon's timezone. */
function dateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SALON_TIME_ZONE }).format(new Date(iso));
}

/** `[2026-08-16 09:00:00+00,2026-08-16 10:00:00+00)` → its two instants. */
function parseTstzRange(literal: string): { start: string; end: string } | null {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal.trim());
  if (!match) return null;
  return { start: match[1].trim(), end: match[2].trim() };
}

function mapAppointment(row: AppointmentRow, day: IsoDate): ConsoleAppointment | null {
  if (!row.clients) return null;

  let startMinute: number;
  let endMinute: number | null;

  if (row.period) {
    const period = parseTstzRange(row.period);
    if (!period) return null;
    // An appointment spilling over midnight would otherwise draw at the wrong end of the axis.
    startMinute = dateKey(period.start) === day ? minuteOfDay(period.start) : 0;
    endMinute = dateKey(period.end) === day ? minuteOfDay(period.end) : 24 * 60;
  } else if (row.requested_start) {
    startMinute = minuteOfDay(row.requested_start);
    // A request has no end, because nobody has supplied the duration (§6).
    endMinute = null;
  } else {
    // The schema forbids this: exactly one of period/requested_start must be set.
    return null;
  }

  const booked = row.appointment_services?.[0] ?? null;

  return {
    id: row.id,
    reference: row.reference,
    line: row.line,
    status: row.status,
    startMinute,
    endMinute,
    clientName: row.clients.full_name,
    clientPhone: row.clients.phone,
    staffName: row.staff?.display_name ?? null,
    serviceName: booked?.services?.name ?? null,
    gownName: row.gowns?.name ?? null,
    priceCharged: booked?.price_charged ?? null,
    notes: row.notes,
  };
}

/**
 * Every appointment touching one calendar day.
 *
 * The day is bounded in UTC around the salon's midnight rather than filtered in SQL by local
 * date — Algeria is UTC+1 with no DST, so the offset is fixed, but the comparison still has to
 * happen against instants because that is what the column stores.
 */
export const getDayAppointments = cache(async (day: IsoDate): Promise<ConsoleAppointment[]> => {
  if (isDemoMode()) return demoAppointments(day);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const dayStart = `${day}T00:00:00+01:00`;
  const dayEnd = `${day}T23:59:59.999+01:00`;

  const [scheduled, requested] = await Promise.all([
    supabase
      .from('appointments')
      .select(SELECT_APPOINTMENT)
      .overlaps('period', `[${dayStart},${dayEnd})`)
      .returns<AppointmentRow[]>(),
    supabase
      .from('appointments')
      .select(SELECT_APPOINTMENT)
      .gte('requested_start', dayStart)
      .lte('requested_start', dayEnd)
      .returns<AppointmentRow[]>(),
  ]);

  if (scheduled.error || requested.error) {
    console.error(
      '[N&S] console: reading the day failed:',
      scheduled.error?.message ?? requested.error?.message,
    );
    return [];
  }

  const rows = [...(scheduled.data ?? []), ...(requested.data ?? [])];

  return rows
    .map((row) => mapAppointment(row, day))
    .filter((a): a is ConsoleAppointment => a !== null)
    .sort((a, b) => a.startMinute - b.startMinute);
});

/** Opening hours for a weekday, plus any exception that overrides them for this exact date. */
export const getOpeningWindows = cache(async (day: IsoDate): Promise<OpeningWindow[]> => {
  if (isDemoMode()) return demoOpeningWindows();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const weekday = new Date(`${day}T12:00:00+01:00`).getUTCDay();

  const [hours, exception] = await Promise.all([
    supabase
      .from('business_hours')
      .select('weekday, opens_at, closes_at, is_closed')
      .eq('weekday', weekday)
      .returns<BusinessHoursRow[]>(),
    supabase
      .from('business_hour_exceptions')
      .select('on_date, opens_at, closes_at, is_closed')
      .eq('on_date', day)
      .maybeSingle()
      .returns<{ opens_at: string | null; closes_at: string | null; is_closed: boolean } | null>(),
  ]);

  const toMinutes = (time: string) => {
    const [h, m] = time.split(':');
    return Number(h) * 60 + Number(m);
  };

  // An exception for the date overrides the weekly pattern entirely, including by closing.
  if (exception.data) {
    if (exception.data.is_closed || !exception.data.opens_at || !exception.data.closes_at) return [];
    return [
      {
        opensAt: toMinutes(exception.data.opens_at),
        closesAt: toMinutes(exception.data.closes_at),
      },
    ];
  }

  if (hours.error) return [];

  return (hours.data ?? [])
    .filter((row) => !row.is_closed && row.opens_at && row.closes_at)
    .map((row) => ({ opensAt: toMinutes(row.opens_at!), closesAt: toMinutes(row.closes_at!) }));
});

/** Gowns physically out on a given day — one of the four KPI cards. */
export const getGownsOut = cache(async (day: IsoDate): Promise<number> => {
  if (isDemoMode()) return DEMO_GOWNS_OUT;

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return 0;

  /*
   * `[day, day)` is the *empty* range and overlaps nothing, so the obvious spelling silently
   * reports zero gowns out every day of the year. One day is `[day, day + 1)`.
   */
  const nextDay = new Date(`${day}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayAfter = nextDay.toISOString().slice(0, 10);

  const { count, error } = await supabase
    .from('gown_reservations')
    .select('id', { count: 'exact', head: true })
    .overlaps('period', `[${day},${dayAfter})`)
    .in('status', ['held', 'confirmed']);

  if (error) {
    // Reception can read reservations; a stylist cannot, and gets zero rather than an error page.
    return 0;
  }

  return count ?? 0;
});

/**
 * Client messages nobody has answered — §13 wants this as an alert, because an unanswered
 * message is a known failure mode of running the business out of one phone.
 *
 * There is no inbox yet (Phase 6) and no Meta integration, so this is zero until messages start
 * arriving. It reads the real table rather than returning a hardcoded 0, so it starts working
 * the day the inbox does.
 */
export const getUnansweredMessages = cache(async (): Promise<number> => {
  if (isDemoMode()) return demoUnansweredCount();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('is_answered', false);

  if (error) return 0;
  return count ?? 0;
});
