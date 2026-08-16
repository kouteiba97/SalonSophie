import 'server-only';
import { cache } from 'react';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import { callRpc } from '@/lib/supabase/server';
import type { GownState } from '@/lib/supabase/types';
import { demoReservations, demoUtilisation, isDemoMode } from '@/lib/console/demo';
import { parseDateRange, type DateRange } from './ranges';
import type { GownStateChange, Reservation, ReservationStatus } from './types';

/**
 * Reads the atelier as the signed-in staff member.
 *
 * Every query here goes through the session client, so RLS is doing the filtering: reception
 * sees the reservations, a stylist sees none, and neither outcome depends on this file getting
 * a `where` clause right. When a read comes back empty the honest reason may be "there are
 * none" or "not for you" — the console says the former, because the latter is already answered
 * by the layout refusing the page.
 */

interface ReservationRow {
  id: string;
  reference: string;
  period: string;
  cleaning_buffer_days: number;
  status: ReservationStatus;
  deposit_amount: number | null;
  notes: string | null;
  created_at: string;
  gowns: { slug: string; name: string } | null;
  clients: { id: string; full_name: string; phone: string } | null;
}

interface UtilisationRow {
  gown_id: string;
  slug: string;
  name: string;
  state: GownState;
  days_reserved: number;
  reservation_count: number;
}

export interface GownUtilisation {
  gownId: string;
  slug: string;
  name: string;
  state: GownState;
  daysReserved: number;
  reservationCount: number;
}

const SELECT_RESERVATION = `
  id, reference, period, cleaning_buffer_days, status, deposit_amount, notes, created_at,
  gowns ( slug, name ),
  clients ( id, full_name, phone )
`;

/*
 * The same columns, with the gown join marked `!inner`.
 *
 * PostgREST applies a filter on an embedded resource to the *embedding*, not to the parent rows:
 * `.eq('gowns.slug', …)` on the plain select above returns every reservation in the tenant, each
 * with `gowns` nulled out where it did not match. `!inner` turns it into a real inner join, so
 * the filter selects reservations — which is both the correct result and one gown's worth of
 * rows instead of all of them.
 */
const SELECT_RESERVATION_BY_GOWN = SELECT_RESERVATION.replace('gowns (', 'gowns!inner (');

/**
 * A row becomes a Reservation, or it is dropped.
 *
 * A reservation with an unparseable range or a missing gown is not something to render with a
 * placeholder — it is a row nothing should be scheduled against, and showing it as if it were
 * fine is how a dress ends up promised twice.
 */
function mapReservation(row: ReservationRow): Reservation | null {
  const range = parseDateRange(row.period);
  if (!range || !row.gowns || !row.clients) return null;

  return {
    id: row.id,
    reference: row.reference,
    gownSlug: row.gowns.slug,
    gownName: row.gowns.name,
    range,
    cleaningBufferDays: row.cleaning_buffer_days,
    status: row.status,
    depositAmount: row.deposit_amount,
    notes: row.notes,
    client: {
      id: row.clients.id,
      fullName: row.clients.full_name,
      phone: row.clients.phone,
    },
    createdAt: row.created_at,
  };
}

/** Every reservation touching the window, across all gowns. */
export const getReservations = cache(async (window: DateRange): Promise<Reservation[]> => {
  if (isDemoMode()) {
    return demoReservations().filter((r) => r.range.start < window.end && window.start < r.range.end);
  }

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('gown_reservations')
    .select(SELECT_RESERVATION)
    // Overlap, expressed the way PostgREST spells `&&`.
    .overlaps('period', `[${window.start},${window.end})`)
    .order('period')
    .returns<ReservationRow[]>();

  if (error) {
    console.error('[N&S] atelier: reading reservations failed:', error.message);
    return [];
  }

  return (data ?? []).map(mapReservation).filter((r): r is Reservation => r !== null);
});

/** One gown's whole history, newest last — the detail page's timeline. */
export const getReservationsForGown = cache(async (gownSlug: string): Promise<Reservation[]> => {
  if (isDemoMode()) return demoReservations().filter((r) => r.gownSlug === gownSlug);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('gown_reservations')
    .select(SELECT_RESERVATION_BY_GOWN)
    .eq('gowns.slug', gownSlug)
    .order('period')
    .returns<ReservationRow[]>();

  if (error) {
    console.error('[N&S] atelier: reading a gown’s reservations failed:', error.message);
    return [];
  }

  return (data ?? []).map(mapReservation).filter((r): r is Reservation => r !== null);
});

/**
 * Days reserved per gown over the window, aggregated in Postgres.
 *
 * One row per dress, rather than every reservation pulled into Node and counted there — the
 * console shows three numbers and should not need every bride's booking to produce them.
 */
export const getUtilisation = cache(async (window: DateRange): Promise<GownUtilisation[]> => {
  if (isDemoMode()) return demoUtilisation();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  // The RPC takes an inclusive last day; the window is half-open.
  const { data, error } = await callRpc<UtilisationRow[]>(supabase, 'gown_utilisation', {
    p_from: window.start,
    p_to: lastInclusiveDay(window),
  });

  if (error) {
    console.error('[N&S] atelier: utilisation failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    gownId: row.gown_id,
    slug: row.slug,
    name: row.name,
    state: row.state,
    daysReserved: row.days_reserved,
    reservationCount: row.reservation_count,
  }));
});

export const getGownStateLog = cache(async (gownId: string): Promise<GownStateChange[]> => {
  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('gown_status_log')
    .select('from_state, to_state, reason, created_at')
    .eq('gown_id', gownId)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<
      { from_state: GownState | null; to_state: GownState; reason: string | null; created_at: string }[]
    >();

  if (error) {
    console.error('[N&S] atelier: reading the state log failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason,
    createdAt: row.created_at,
  }));
});

/** Resolves a gown slug to its id — the state actions address a gown by id, not by name. */
export const getGownId = cache(async (slug: string): Promise<string | null> => {
  if (isDemoMode()) return demoUtilisation().find((g) => g.slug === slug)?.gownId ?? null;

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('gowns')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
    .returns<{ id: string } | null>();

  return data?.id ?? null;
});

function lastInclusiveDay(window: DateRange): string {
  const end = new Date(`${window.end}T00:00:00`);
  end.setDate(end.getDate() - 1);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
