'use server';

import { z } from 'zod';

import { getAvailability } from '@/lib/availability/repository';
import type { DayAvailability } from '@/lib/availability/engine';
import { fromIsoDate } from '@/lib/datetime';

/**
 * Real availability, for the public booking modal.
 *
 * The engine and its repository were built in Phase 3 and nothing client-facing ever called
 * them. Step 3 rendered seven fixed times — 09:00, 10:30, 12:00 … — and a line saying real
 * availability was coming soon. That was honest while durations and opening hours were unknown,
 * and stopped being honest the day both were filled in: the database now holds a real slot and
 * refuses a second client the same one, while the website was still offering a grid of times
 * unrelated to the service, the stylist's shift, or what was already booked.
 *
 * A thin shell on purpose. Everything that decides anything lives in the pure engine, which is
 * where it can be tested without a clock or a network; this only validates the request and hands
 * back the days.
 *
 * No authentication: the caller is an anonymous visitor choosing a time, and the underlying
 * functions return slugs and times only — no client, no name, no reason (§ availability reads
 * never expose people).
 */

const input = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  /** Null, or 'sans-preference', means the first expert who can take it. */
  staffSlug: z.string().trim().max(80).nullable(),
  fromIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** One screenful of calendar. Capped so a crafted payload cannot ask for a year of days. */
  days: z.number().int().min(1).max(45),
});

export type AvailabilityDays =
  | { status: 'ok'; days: DayAvailability[]; fromDatabase: boolean }
  | { status: 'error' };

export async function fetchAvailability(raw: {
  serviceSlug: string;
  staffSlug: string | null;
  fromIso: string;
  days: number;
}): Promise<AvailabilityDays> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: 'error' };

  const { serviceSlug, staffSlug, fromIso, days } = parsed.data;

  try {
    const result = await getAvailability({
      serviceSlug,
      staffSlug,
      from: fromIsoDate(fromIso),
      days,
    });
    return { status: 'ok', days: result.days, fromDatabase: result.fromDatabase };
  } catch (error) {
    /*
     * A failed availability read must not take the booking flow down with it. The caller falls
     * back to request mode, which is what the whole flow did until now and still works: the
     * client proposes a time and the salon confirms on WhatsApp.
     */
    console.error('[N&S] availability read failed, falling back to request mode:', error);
    return { status: 'error' };
  }
}
