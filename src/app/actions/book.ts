'use server';

import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { BUSINESS } from '@/data/business';
import { findGownBySlug, findServiceBySlug } from '@/data/catalogue';
import { routing, type Locale } from '@/i18n/routing';
import { getNotifier } from '@/lib/notifications';
import { checkBookingRateLimit } from '@/lib/rate-limit';
import { callRpc, getSupabaseServerClient } from '@/lib/supabase/server';
import type { BookAppointmentRow } from '@/lib/supabase/types';

/**
 * The public booking endpoint — BUILD_BRIEF §5.3 items 9 and 11, §12.6.
 *
 * Everything the client sent is re-validated here and again inside the database function. The
 * browser's optimistic UI is a courtesy; this is the decision.
 */

const ALGERIAN_MOBILE = /^0[5-7]\d{8}$/;

const submission = z.object({
  serviceSlug: z.string().min(1).nullable(),
  gownSlug: z.string().min(1).nullable(),
  staffSlug: z.string().min(1).nullable(),
  /** ISO instant for the requested start. */
  startsAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .refine((v) => ALGERIAN_MOBILE.test(v), 'invalid_phone'),
  notes: z.string().trim().max(500).optional(),
  locale: z.enum(routing.locales),
});

export type BookingInput = z.input<typeof submission>;

export type BookingResult =
  | { ok: true; reference: string; isRequest: boolean; staffSlug: string | null; notified: boolean }
  | { ok: false; error: 'invalid' | 'slot_taken' | 'rate_limited' | 'unavailable'; message?: string };

/** Maps the database function's named exceptions onto results the UI can speak about. */
function classify(message: string): BookingResult {
  if (message.includes('booking_slot_taken')) return { ok: false, error: 'slot_taken' };
  if (message.includes('booking_invalid_phone')) return { ok: false, error: 'invalid', message: 'phone' };
  if (message.includes('booking_invalid_name')) return { ok: false, error: 'invalid', message: 'name' };
  if (message.includes('booking_in_the_past')) return { ok: false, error: 'invalid', message: 'time' };
  if (message.includes('booking_too_far')) return { ok: false, error: 'invalid', message: 'time' };
  if (message.includes('booking_unknown')) return { ok: false, error: 'invalid', message: 'subject' };
  return { ok: false, error: 'unavailable' };
}

export async function bookAppointment(input: BookingInput): Promise<BookingResult> {
  const parsed = submission.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid', message: parsed.error.issues[0]?.path.join('.') };
  }
  const data = parsed.data;

  // ── rate limit (§5.3 item 11) ──────────────────────────────────────────────────────────────
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || null;

  const limit = await checkBookingRateLimit({ ip, phone: data.phone });
  if (!limit.allowed) return { ok: false, error: 'rate_limited' };

  const supabase = getSupabaseServerClient();

  /*
   * No database configured. Rather than fail, report the booking as a request: the confirmation
   * screen already hands the client a WhatsApp link, which is how the salon takes bookings
   * today. A reference is deliberately NOT invented here — it would match nothing.
   */
  if (!supabase) {
    return { ok: true, reference: '', isRequest: true, staffSlug: data.staffSlug, notified: false };
  }

  const { data: rows, error } = await callRpc<BookAppointmentRow | BookAppointmentRow[]>(
    supabase,
    'book_appointment',
    {
      p_service_slug: data.serviceSlug,
      p_gown_slug: data.gownSlug,
      p_staff_slug: data.staffSlug,
      p_start: data.startsAt,
      p_client_name: data.name,
      p_client_phone: data.phone,
      p_notes: data.notes ?? null,
    },
  );

  if (error) return classify(error.message);

  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result) return { ok: false, error: 'unavailable' };

  // ── notify (never fatal) ───────────────────────────────────────────────────────────────────
  // The appointment is committed. A failure to message is recoverable; losing the booking is not.
  let notified = false;
  try {
    const summary = await describe(data);
    const notification = {
      kind: 'booking_confirmation' as const,
      toPhone: `213${data.phone.slice(1)}`,
      clientName: data.name,
      reference: result.reference,
      locale: data.locale as Locale,
      summary,
      startsAt: result.is_request ? null : new Date(data.startsAt),
      isRequest: result.is_request,
    };

    const notifier = getNotifier();
    const delivery = await notifier.send(notification);
    notified = delivery.delivered;
    await notifier.scheduleReminders(notification);
  } catch (notifyError) {
    console.error('[N&S] booking saved but notification failed:', notifyError);
  }

  return {
    ok: true,
    reference: result.reference,
    isRequest: result.is_request,
    staffSlug: result.staff_slug,
    notified,
  };
}

/** A one-line description of what was booked, for the message body. */
async function describe(data: z.infer<typeof submission>): Promise<string> {
  const t = await getTranslations({ locale: data.locale, namespace: 'booking' });

  if (data.gownSlug) {
    const gown = await findGownBySlug(data.gownSlug);
    return `${t('fitting')} · ${gown?.name ?? data.gownSlug}`;
  }

  const service = data.serviceSlug ? await findServiceBySlug(data.serviceSlug) : undefined;
  return service?.name ?? BUSINESS.name;
}
