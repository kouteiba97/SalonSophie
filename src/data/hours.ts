import { cache } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { BusinessHoursRow } from '@/lib/supabase/types';
import { BUSINESS, type OpeningDay } from './business';

/**
 * The trading week, read from the database when one is configured and from the committed seed
 * otherwise — the same arrangement `catalogue.ts` uses for the tariff, and for the same reason.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 * The hours shown to a client and the hours the booking engine honours have to be the same
 * hours. They were not. `ContactSection` printed the constant in `src/data/business.ts` while
 * `availability/repository.ts` read `business_hours` from Postgres, so the console's opening
 * hours editor — which writes to that table — moved what the engine would offer without moving
 * what the website advertised. An owner shortening Saturday would have seen the change take
 * effect in the diary and the old hours stay up on the site, with no indication the two
 * disagreed.
 *
 * That is worse than either value being wrong on its own: a client reads 17:00 on the contact
 * page, the engine refuses a 16:30 slot, and nothing on screen explains why.
 *
 * The static seed stays as the fallback rather than the source. It is correct today and it keeps
 * a credential-less build or an unreachable database showing real hours instead of nothing —
 * but once a database is configured, it is the record.
 */
export const getOpeningHours = cache(async (): Promise<{ days: OpeningDay[]; fromDatabase: boolean }> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { days: [...BUSINESS.openingHours], fromDatabase: false };

  try {
    const { data, error } = await supabase
      .from('business_hours')
      .select('weekday, opens_at, closes_at, is_closed')
      .order('weekday')
      .returns<BusinessHoursRow[]>();

    if (error) throw error;
    // An empty table means hours were never seeded, not that the salon never opens.
    if (!data?.length) return { days: [...BUSINESS.openingHours], fromDatabase: false };

    return {
      days: data.map((row) => ({
        weekday: row.weekday,
        isClosed: row.is_closed,
        // Postgres `time` comes back as "09:30:00"; the UI wants "09:30".
        opensAt: row.is_closed ? null : (row.opens_at?.slice(0, 5) ?? null),
        closesAt: row.is_closed ? null : (row.closes_at?.slice(0, 5) ?? null),
      })),
      fromDatabase: true,
    };
  } catch {
    // Hours are not worth failing a page render over — the seed is real data, not a placeholder.
    return { days: [...BUSINESS.openingHours], fromDatabase: false };
  }
});
