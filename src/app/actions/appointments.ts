'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { routing } from '@/i18n/routing';
import { getStaffSession } from '@/lib/auth';
import { salonInstant } from '@/lib/datetime';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Booking from the console — §13's "New appointment".
 *
 * A thin shell over `book_appointment_as_staff`, which is SECURITY INVOKER so RLS is what
 * actually decides. The session check here only buys a better message; a stylist is refused by
 * `appointments_front_desk_write` whether or not this function looks.
 *
 * Note what is NOT re-implemented: the phone rule and the slot guarantee both live in the
 * database, shared with the public booking path. Two validators for one rule is how they drift.
 */

const ALGERIAN_MOBILE = /^0[5-7]\d{8}$/;

const input = z
  .object({
    line: z.enum(['salon', 'bridal', 'makeup']),
    serviceSlug: z.string().trim().min(1),
    staffSlug: z.string().trim().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'invalid_time'),
    /** Set when reception picked someone already in the book. */
    clientId: z.string().uuid().optional(),
    clientName: z.string().trim().max(80).optional(),
    clientPhone: z.string().trim().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.clientId) return;
    if (!value.clientName || value.clientName.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientName'],
        message: 'invalid_name',
      });
    }
    const phone = (value.clientPhone ?? '').replace(/[\s.-]/g, '');
    if (!ALGERIAN_MOBILE.test(phone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientPhone'],
        message: 'invalid_phone',
      });
    }
  });

export type AppointmentError =
  | 'forbidden'
  | 'not_configured'
  | 'invalid'
  | 'invalid_phone'
  | 'invalid_name'
  | 'slot_taken'
  | 'unknown_service'
  | 'unknown_staff'
  | 'unavailable';

export type AppointmentState =
  | { status: 'idle' }
  | { status: 'success'; reference: string; isRequest: boolean }
  | { status: 'error'; error: AppointmentError; field?: string };

function classify(message: string): AppointmentState {
  const named: [string, AppointmentError][] = [
    ['booking_slot_taken', 'slot_taken'],
    ['booking_invalid_phone', 'invalid_phone'],
    ['booking_invalid_name', 'invalid_name'],
    ['booking_unknown_service', 'unknown_service'],
    ['booking_unknown_staff', 'unknown_staff'],
    ['booking_unknown_client', 'invalid'],
    ['booking_forbidden', 'forbidden'],
    ['row-level security', 'forbidden'],
    ['permission denied', 'forbidden'],
  ];
  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }
  console.error('[N&S] console booking: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

export async function createAppointment(
  _previous: AppointmentState,
  formData: FormData,
): Promise<AppointmentState> {
  const parsed = input.safeParse({
    line: formData.get('line'),
    serviceSlug: formData.get('serviceSlug'),
    staffSlug: String(formData.get('staffSlug') ?? '') || undefined,
    date: formData.get('date'),
    time: formData.get('time'),
    clientId: String(formData.get('clientId') ?? '') || undefined,
    clientName: String(formData.get('clientName') ?? '') || undefined,
    clientPhone: String(formData.get('clientPhone') ?? '') || undefined,
    notes: String(formData.get('notes') ?? '') || undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === 'invalid_phone') return { status: 'error', error: 'invalid_phone' };
    if (issue?.message === 'invalid_name') return { status: 'error', error: 'invalid_name' };
    return { status: 'error', error: 'invalid', field: issue?.path.join('.') };
  }

  const session = await getStaffSession();
  if (!session) return { status: 'error', error: 'forbidden' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const d = parsed.data;

  const { data: rows, error } = await callRpc<
    | {
        reference: string;
        appointment_id: string;
        staff_slug: string | null;
        is_request: boolean;
      }
    | {
        reference: string;
        appointment_id: string;
        staff_slug: string | null;
        is_request: boolean;
      }[]
  >(supabase, 'book_appointment_as_staff', {
    p_line: d.line,
    p_service_slug: d.serviceSlug,
    p_staff_slug: d.staffSlug ?? null,
    // Algeria is UTC+1 with no DST, so a local wall clock converts to an instant unambiguously.
    p_start: salonInstant(d.date, d.time),
    p_client_id: d.clientId ?? null,
    p_client_name: d.clientName ?? null,
    p_client_phone: d.clientPhone ?? null,
    p_notes: d.notes ?? null,
    p_status: 'confirmed',
  });

  if (error) return classify(error.message);

  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result) return { status: 'error', error: 'unavailable' };

  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/aujourdhui`, 'page');
  }

  return {
    status: 'success',
    reference: result.reference,
    isRequest: result.is_request,
  };
}

/** Type-ahead for reception: most people booking are already in the book. */
export async function findClients(query: string): Promise<
  {
    id: string;
    full_name: string;
    phone: string;
    is_bride: boolean;
    visits: number;
  }[]
> {
  if (query.trim().length < 2) return [];

  const session = await getStaffSession();
  if (!session) return [];

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<
    {
      id: string;
      full_name: string;
      phone: string;
      is_bride: boolean;
      visits: number;
    }[]
  >(supabase, 'search_clients', { p_query: query });

  if (error || !data) return [];
  return data;
}
