import 'server-only';
import { cache } from 'react';
import type { Centimes } from '@/lib/money';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import { demoClient, demoClients, isDemoMode } from './demo';

/**
 * The clients list — §13: "unified list across all three business lines, with a bride flag,
 * visit count, lifetime spend, and free-text notes".
 *
 * Unified is the point. The salon, the atelier and the makeup line share one address, one phone
 * and, it turns out, one set of clients — a bride booking a fitting is very often already
 * somebody's Thursday brushing. Three separate lists is the situation the console exists to end.
 */

export interface ConsoleClient {
  id: string;
  fullName: string;
  phone: string;
  isBride: boolean;
  /** Appointments that actually happened. */
  visitCount: number;
  /**
   * Null when the caller may not read payments.
   *
   * `payments_owner_all` restricts them to owners, so reception gets null here and the column
   * renders as "—" rather than as a confident 0 DA. Showing a receptionist zero spend for a
   * client who has spent a fortune is worse than showing her nothing.
   */
  lifetimeSpend: Centimes | null;
  lastVisit: string | null;
}

interface ClientRow {
  id: string;
  full_name: string;
  phone: string;
  is_bride: boolean;
  created_at: string;
  appointments: { id: string; status: string; period: string | null; requested_start: string | null }[] | null;
}

interface PaymentRow {
  client_id: string;
  amount: number;
}

export interface ClientNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface ClientHistoryEntry {
  id: string;
  reference: string;
  line: 'salon' | 'bridal' | 'makeup';
  status: string;
  /** The instant it was booked for, scheduled or merely requested. */
  at: string | null;
  isRequest: boolean;
  serviceName: string | null;
  staffName: string | null;
}

export interface ClientDetail extends ConsoleClient {
  notes: ClientNote[];
  history: ClientHistoryEntry[];
  reservations: { id: string; reference: string; gownName: string; period: string; status: string }[];
}

/** The detail query selects more per appointment than the list does. */
interface ClientDetailRow {
  id: string;
  full_name: string;
  phone: string;
  is_bride: boolean;
  created_at: string;
  appointments:
    | {
        id: string;
        reference: string;
        line: 'salon' | 'bridal' | 'makeup';
        status: string;
        period: string | null;
        requested_start: string | null;
        staff: { display_name: string } | null;
        appointment_services: { services: { name: string } | null }[] | null;
      }[]
    | null;
}

/**
 * One client, with everything the salon knows about her in one place.
 *
 * §13: "free-text notes (colour formulas, allergies, wedding dates)". Those are the details that
 * currently live in someone's memory, which is the problem the console exists to solve — a
 * colour formula nobody wrote down is a colour nobody can repeat.
 *
 * The three reads are separate and independently allowed to fail, because RLS grants them
 * differently: a stylist may read a client she has served and her notes, but never the gown
 * reservations. Failing one must not blank the page.
 */
export const getClient = cache(async (id: string): Promise<ClientDetail | null> => {
  if (isDemoMode()) return demoClient(id);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return null;

  const { data: row, error } = await supabase
    .from('clients')
    .select(
      `id, full_name, phone, is_bride, created_at,
       appointments ( id, reference, line, status, period, requested_start,
                      staff ( display_name ),
                      appointment_services ( services ( name ) ) )`,
    )
    .eq('id', id)
    .maybeSingle()
    // Its own row type rather than an intersection with ClientRow: intersecting two array types
    // does not widen the element, so `reference` stayed invisible on the narrower one.
    .returns<ClientDetailRow | null>();

  if (error || !row) return null;

  const [{ data: notes }, { data: payments }, { data: reservations }] = await Promise.all([
    supabase
      .from('client_notes')
      .select('id, body, created_at, users ( full_name )')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .returns<{ id: string; body: string; created_at: string; users: { full_name: string } | null }[]>(),
    supabase
      .from('payments')
      .select('client_id, amount')
      .eq('client_id', id)
      .eq('status', 'paid')
      .returns<PaymentRow[]>(),
    supabase
      .from('gown_reservations')
      .select('id, reference, period, status, gowns ( name )')
      .eq('client_id', id)
      .order('period')
      .returns<
        { id: string; reference: string; period: string; status: string; gowns: { name: string } | null }[]
      >(),
  ]);

  const appointments = row.appointments ?? [];

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    isBride: row.is_bride,
    visitCount: appointments.filter((a) => a.status === 'completed').length,
    // Null when payments were refused — an em dash beats a confident zero.
    lifetimeSpend: payments ? payments.reduce((sum, p) => sum + p.amount, 0) : null,
    lastVisit:
      appointments
        .map((a) => (a.period ? a.period.slice(1).split(',')[0] : a.requested_start))
        .filter((t): t is string => Boolean(t))
        .sort()
        .at(-1) ?? null,
    notes: (notes ?? []).map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.users?.full_name ?? null,
      createdAt: note.created_at,
    })),
    history: appointments
      .map((a) => ({
        id: a.id,
        reference: a.reference,
        line: a.line,
        status: a.status,
        at: a.period ? a.period.slice(1).split(',')[0] : a.requested_start,
        isRequest: a.period === null,
        serviceName: a.appointment_services?.[0]?.services?.name ?? null,
        staffName: a.staff?.display_name ?? null,
      }))
      .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
      .reverse(),
    reservations: (reservations ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      gownName: r.gowns?.name ?? '—',
      period: r.period,
      status: r.status,
    })),
  };
});

export const getClients = cache(
  async (search: string | null): Promise<{ clients: ConsoleClient[]; spendVisible: boolean }> => {
    if (isDemoMode()) {
      const all = demoClients();
      const needle = search?.toLowerCase() ?? null;
      return {
        clients: needle
          ? all.filter(
              (c) => c.fullName.toLowerCase().includes(needle) || c.phone.includes(needle),
            )
          : all,
        spendVisible: true,
      };
    }

    const supabase = await getSupabaseSessionClient();
    if (!supabase) return { clients: [], spendVisible: false };

    let query = supabase
      .from('clients')
      .select(
        `id, full_name, phone, is_bride, created_at,
         appointments ( id, status, period, requested_start )`,
      )
      .order('full_name')
      .limit(200);

    if (search) {
      /*
       * Name or phone, because reception searches by whichever they have. Commas and parentheses
       * would otherwise terminate the `or` filter's own syntax, so they are stripped rather than
       * escaped — no legitimate name or Algerian mobile contains one.
       */
      const safe = search.replace(/[,()*]/g, ' ').trim();
      if (safe) query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data, error } = await query.returns<ClientRow[]>();

    if (error) {
      console.error('[N&S] console: reading clients failed:', error.message);
      return { clients: [], spendVisible: false };
    }

    const rows = data ?? [];

    /*
     * Attempted separately, and allowed to fail. RLS refuses this to anyone but an owner, and a
     * receptionist opening the clients list should get the list — not an error page because one
     * optional column was not hers to see.
     */
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('client_id, amount')
      .eq('status', 'paid')
      .returns<PaymentRow[]>();

    const spendVisible = !paymentsError && payments !== null;

    const spendByClient = new Map<string, number>();
    for (const payment of payments ?? []) {
      spendByClient.set(payment.client_id, (spendByClient.get(payment.client_id) ?? 0) + payment.amount);
    }

    const clients = rows.map((row): ConsoleClient => {
      const appointments = row.appointments ?? [];
      // A visit is an appointment that happened. A cancellation is not a visit, and a request
      // is not yet one.
      const visits = appointments.filter((a) => a.status === 'completed');

      const times = appointments
        .map((a) => (a.period ? a.period.slice(1).split(',')[0] : a.requested_start))
        .filter((t): t is string => Boolean(t))
        .sort();

      return {
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        isBride: row.is_bride,
        visitCount: visits.length,
        lifetimeSpend: spendVisible ? (spendByClient.get(row.id) ?? 0) : null,
        lastVisit: times.length > 0 ? times[times.length - 1] : null,
      };
    });

    return { clients, spendVisible };
  },
);
