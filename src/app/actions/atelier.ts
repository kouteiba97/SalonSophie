'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import {
  gownStateInput,
  reservationInput,
  reservationStatusInput,
} from '@/lib/atelier/schema';
import { getStaffSession, isOwner } from '@/lib/auth';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * The atelier's three write paths.
 *
 * Each one is a thin shell around a Postgres function: validate the shape, call it, translate
 * the named exception into something the console can say out loud. The decisions — is this dress
 * free, may this person write, is this transition legal — all happen inside the transaction,
 * because a check made here would be a check made in a different transaction from the write.
 *
 * The role test below is a courtesy that produces a better message. RLS is what actually refuses
 * a non-owner, and `reserve_gown` is deliberately not `security definer` so that stays true.
 */

export type AtelierError =
  | 'forbidden'
  | 'not_configured'
  | 'double_booked'
  | 'invalid'
  | 'invalid_period'
  | 'in_the_past'
  | 'invalid_phone'
  | 'invalid_name'
  | 'unknown_gown'
  | 'unknown_accessory'
  | 'accessory_out_of_stock'
  | 'invalid_transition'
  | 'not_found'
  | 'unavailable';

export type AtelierState =
  | { status: 'idle' }
  | { status: 'success'; reference?: string }
  | { status: 'error'; error: AtelierError; field?: string };

/** Maps a database exception onto something the console can say in the brand's voice. */
function classify(message: string): AtelierState {
  const named: [string, AtelierError][] = [
    ['gown_double_booked', 'double_booked'],
    ['reservation_invalid_period', 'invalid_period'],
    ['reservation_in_the_past', 'in_the_past'],
    ['reservation_invalid_phone', 'invalid_phone'],
    ['reservation_invalid_name', 'invalid_name'],
    ['reservation_unknown_gown', 'unknown_gown'],
    ['reservation_unknown_accessory', 'unknown_accessory'],
    ['accessory_out_of_stock', 'accessory_out_of_stock'],
    ['reservation_invalid_transition', 'invalid_transition'],
    ['reservation_not_found', 'not_found'],
    ['reservation_forbidden', 'forbidden'],
    ['gown_forbidden', 'forbidden'],
    // Raw RLS refusal, if a policy rejects before the function's own handler sees it.
    ['row-level security', 'forbidden'],
  ];

  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }

  console.error('[N&S] atelier: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

/** Revalidates both atelier surfaces in every locale after a write. */
function revalidateAtelier() {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/atelier`, 'layout');
  }
}

/* ── reserve ──────────────────────────────────────────────────────────────────────────────── */

export async function reserveGown(_previous: AtelierState, formData: FormData): Promise<AtelierState> {
  const session = await getStaffSession();
  if (!session) return { status: 'error', error: 'forbidden' };
  if (!isOwner(session)) return { status: 'error', error: 'forbidden' };

  const parsed = reservationInput.safeParse({
    gownSlug: formData.get('gownSlug'),
    clientName: formData.get('clientName'),
    clientPhone: formData.get('clientPhone'),
    firstDay: formData.get('firstDay'),
    lastDay: formData.get('lastDay'),
    cleaningBufferDays: formData.get('cleaningBufferDays') ?? 0,
    status: formData.get('status') ?? 'held',
    depositDinars: formData.get('depositDinars') ?? '',
    notes: formData.get('notes') ?? undefined,
    accessorySlugs: formData.getAll('accessorySlugs').map(String),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // The one refinement worth its own message; everything else is "fill this in".
    if (issue?.message === 'invalid_period') return { status: 'error', error: 'invalid_period' };
    return { status: 'error', error: 'invalid', field: issue?.path.join('.') };
  }

  const data = parsed.data;

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { data: rows, error } = await callRpc<
    { reservation_id: string; reference: string; client_id: string }[] | { reference: string }
  >(supabase, 'reserve_gown', {
    p_gown_slug: data.gownSlug,
    p_client_name: data.clientName,
    p_client_phone: data.clientPhone,
    p_from: data.firstDay,
    p_to: data.lastDay,
    p_cleaning_buffer_days: data.cleaningBufferDays,
    p_status: data.status,
    p_deposit_amount: data.depositDinars,
    p_notes: data.notes ?? null,
    p_accessory_slugs: data.accessorySlugs,
  });

  if (error) return classify(error.message);

  revalidateAtelier();

  const result = Array.isArray(rows) ? rows[0] : rows;
  return { status: 'success', reference: result?.reference };
}

/* ── reservation status ───────────────────────────────────────────────────────────────────── */

export async function setReservationStatus(
  _previous: AtelierState,
  formData: FormData,
): Promise<AtelierState> {
  const session = await getStaffSession();
  if (!isOwner(session)) return { status: 'error', error: 'forbidden' };

  const parsed = reservationStatusInput.safeParse({
    reservationId: formData.get('reservationId'),
    status: formData.get('status'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await callRpc<string>(supabase, 'set_reservation_status', {
    p_reservation_id: parsed.data.reservationId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return classify(error.message);

  revalidateAtelier();
  return { status: 'success' };
}

/* ── gown state ───────────────────────────────────────────────────────────────────────────── */

export async function setGownState(
  _previous: AtelierState,
  formData: FormData,
): Promise<AtelierState> {
  const session = await getStaffSession();
  if (!isOwner(session)) return { status: 'error', error: 'forbidden' };

  const parsed = gownStateInput.safeParse({
    gownId: formData.get('gownId'),
    state: formData.get('state'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await callRpc<string>(supabase, 'set_gown_state', {
    p_gown_id: parsed.data.gownId,
    p_state: parsed.data.state,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return classify(error.message);

  revalidateAtelier();
  return { status: 'success' };
}
