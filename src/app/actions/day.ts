'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { routing } from '@/i18n/routing';
import { getStaffSession } from '@/lib/auth';
import { dinarsToCentimes } from '@/lib/management/schema';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * What a worker does during the day: move an appointment along, take the money, flag a shortage.
 *
 * Every function behind these is SECURITY INVOKER, so RLS decides. A stylist may move their own
 * appointments and no one else's — `appointments_stylist_update` says so — and that boundary holds
 * whether or not this file checks anything.
 */

export type DayError =
  | 'forbidden'
  | 'not_configured'
  | 'invalid'
  | 'invalid_amount'
  | 'unknown_appointment'
  | 'unknown_product'
  | 'unavailable';

export type DayState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; error: DayError };

function classify(message: string): DayState {
  const named: [string, DayError][] = [
    ['payment_invalid_amount', 'invalid_amount'],
    ['payment_unknown_appointment', 'unknown_appointment'],
    ['appointment_invalid_status', 'invalid'],
    ['appointment_forbidden', 'forbidden'],
    ['payment_forbidden', 'forbidden'],
    ['alert_unknown_product', 'unknown_product'],
    ['alert_invalid_kind', 'invalid'],
    ['alert_forbidden', 'forbidden'],
    ['row-level security', 'forbidden'],
    ['permission denied', 'forbidden'],
  ];

  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }

  console.error('[N&S] day: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

function revalidateDay() {
  for (const locale of routing.locales) revalidatePath(`/${locale}`, 'layout');
}

async function signedIn() {
  const session = await getStaffSession();
  if (!session) return { supabase: null, error: 'forbidden' as const };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { supabase: null, error: 'not_configured' as const };

  return { supabase, error: null };
}

const statusInput = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']),
});

/** Marking an appointment done, or that nobody came. */
export async function setAppointmentStatus(
  _previous: DayState,
  formData: FormData,
): Promise<DayState> {
  const parsed = statusInput.safeParse({
    appointmentId: formData.get('appointmentId'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const session = await signedIn();
  if (!session.supabase) return { status: 'error', error: session.error };

  const { error } = await callRpc<string>(session.supabase, 'set_appointment_status', {
    p_appointment_id: parsed.data.appointmentId,
    p_status: parsed.data.status,
  });

  if (error) return classify(error.message);

  revalidateDay();
  return { status: 'success' };
}

const paymentInput = z.object({
  appointmentId: z.string().uuid(),
  /** Typed in dinars, stored in centimes (§7). */
  amount: dinarsToCentimes.refine((value) => value !== null && value > 0, 'invalid_amount'),
  method: z.enum(['cash', 'transfer', 'cib', 'edahabia', 'other']).default('cash'),
});

/**
 * Taking the money.
 *
 * The amount is typed rather than taken from the tariff, because most of the published prices are
 * ranges and floors — what a client actually paid is settled at the chair. Reception may record
 * this and still cannot read the ledger, which is the point of doing it through the function.
 */
export async function recordPayment(_previous: DayState, formData: FormData): Promise<DayState> {
  const parsed = paymentInput.safeParse({
    appointmentId: formData.get('appointmentId'),
    amount: formData.get('amount') ?? '',
    method: formData.get('method') ?? 'cash',
  });
  if (!parsed.success) return { status: 'error', error: 'invalid_amount' };

  const session = await signedIn();
  if (!session.supabase) return { status: 'error', error: session.error };

  const { error } = await callRpc<string>(session.supabase, 'record_payment', {
    p_appointment_id: parsed.data.appointmentId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_paid_at: null,
  });

  if (error) return classify(error.message);

  revalidateDay();
  return { status: 'success' };
}

const alertInput = z.object({
  kind: z.enum(['stock_low', 'equipment', 'other']).default('stock_low'),
  productSlug: z.string().trim().optional(),
  note: z.string().trim().max(300).optional(),
});

/**
 * "We are nearly out of the 7.3."
 *
 * The one thing a person in the room knows before any counter does. Open flags for the same
 * product collapse in the database, so three people noticing the same empty shelf is one line on
 * the owner's screen rather than three.
 */
export async function raiseAlert(_previous: DayState, formData: FormData): Promise<DayState> {
  const parsed = alertInput.safeParse({
    kind: formData.get('kind') ?? 'stock_low',
    productSlug: formData.get('productSlug') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const session = await signedIn();
  if (!session.supabase) return { status: 'error', error: session.error };

  const { error } = await callRpc<string>(session.supabase, 'raise_alert', {
    p_kind: parsed.data.kind,
    p_product_slug: parsed.data.productSlug ?? null,
    p_note: parsed.data.note ?? null,
  });

  if (error) return classify(error.message);

  revalidateDay();
  return { status: 'success' };
}

/** Clearing a flag once it has been dealt with. Owner only — see the policy. */
export async function resolveAlert(_previous: DayState, formData: FormData): Promise<DayState> {
  const alertId = String(formData.get('alertId') ?? '');
  if (!alertId) return { status: 'error', error: 'invalid' };

  const session = await signedIn();
  if (!session.supabase) return { status: 'error', error: session.error };

  const { error } = await callRpc<null>(session.supabase, 'resolve_alert', {
    p_alert_id: alertId,
  });

  if (error) return classify(error.message);

  revalidateDay();
  return { status: 'success' };
}
