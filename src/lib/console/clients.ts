import 'server-only';
import { cache } from 'react';
import type { Centimes } from '@/lib/money';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

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

export const getClients = cache(
  async (search: string | null): Promise<{ clients: ConsoleClient[]; spendVisible: boolean }> => {
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
