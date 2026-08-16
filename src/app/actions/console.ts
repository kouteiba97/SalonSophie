'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { getStaffSession, isFrontDesk, isOwner } from '@/lib/auth';
import {
  clientNoteInput,
  dealInput,
  dealStageInput,
  logMessageInput,
} from '@/lib/console/schema';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Phase 6's writes: a note on a client, a message in the inbox, a deal on the board.
 *
 * Same shape as the atelier's actions — validate, call, translate the named exception. The role
 * checks here produce a better message; RLS is what actually refuses, which is why none of the
 * functions behind them is `security definer`.
 */

export type ConsoleError =
  | 'forbidden'
  | 'not_configured'
  | 'invalid'
  | 'empty'
  | 'unknown_client'
  | 'not_found'
  | 'unavailable';

export type ConsoleState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; error: ConsoleError };

function classify(message: string): ConsoleState {
  const named: [string, ConsoleError][] = [
    ['message_empty', 'empty'],
    ['message_needs_client', 'invalid'],
    ['message_unknown_client', 'unknown_client'],
    ['message_forbidden', 'forbidden'],
    ['deal_forbidden', 'forbidden'],
    ['row-level security', 'forbidden'],
  ];

  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }

  console.error('[N&S] console: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

function revalidateConsole(...paths: string[]) {
  for (const locale of routing.locales) {
    for (const path of paths) revalidatePath(`/${locale}${path}`, 'layout');
  }
}

/* ── client notes ─────────────────────────────────────────────────────────────────────────── */

/**
 * A colour formula, an allergy, a wedding date (§13).
 *
 * Written by whoever is signed in and attributed to them, because "who said this" is half the
 * value of a note six months later. A stylist may write on a client she has served —
 * `client_notes_write` decides that, not this function.
 */
export async function addClientNote(
  _previous: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const session = await getStaffSession();
  if (!session) return { status: 'error', error: 'forbidden' };

  const parsed = clientNoteInput.safeParse({
    clientId: formData.get('clientId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { status: 'error', error: 'empty' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await supabase.from('client_notes').insert({
    tenant_id: session.tenantId,
    client_id: parsed.data.clientId,
    author_id: session.userId,
    body: parsed.data.body,
  });

  if (error) return classify(error.message);

  revalidateConsole('/clients');
  return { status: 'success' };
}

/* ── inbox ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Records what was said. It does not send anything.
 *
 * There is no Meta integration (§10), and pretending otherwise would be the communications
 * equivalent of inventing a price: the console would show a reply the client never received. The
 * UI puts a WhatsApp link beside this so the message actually goes, and this keeps the thread
 * honest afterwards.
 */
export async function logMessage(
  _previous: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const session = await getStaffSession();
  if (!isFrontDesk(session)) return { status: 'error', error: 'forbidden' };

  const parsed = logMessageInput.safeParse({
    clientId: formData.get('clientId'),
    conversationId: formData.get('conversationId'),
    channel: formData.get('channel'),
    direction: formData.get('direction'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { status: 'error', error: 'empty' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await callRpc<string>(supabase, 'log_message', {
    p_client_id: parsed.data.clientId,
    p_channel: parsed.data.channel,
    p_direction: parsed.data.direction,
    p_body: parsed.data.body,
    p_conversation_id: parsed.data.conversationId,
    p_subject: null,
  });

  if (error) return classify(error.message);

  revalidateConsole('/messages', '/aujourdhui');
  return { status: 'success' };
}

/* ── brand deals ──────────────────────────────────────────────────────────────────────────── */

export async function setDealStage(
  _previous: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const session = await getStaffSession();
  if (!isOwner(session)) return { status: 'error', error: 'forbidden' };

  const parsed = dealStageInput.safeParse({
    dealId: formData.get('dealId'),
    stage: formData.get('stage'),
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await callRpc<string>(supabase, 'set_deal_stage', {
    p_deal_id: parsed.data.dealId,
    p_stage: parsed.data.stage,
  });

  if (error) return classify(error.message);

  revalidateConsole('/collaborations');
  return { status: 'success' };
}

export async function createDeal(
  _previous: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const session = await getStaffSession();
  if (!session || !isOwner(session)) return { status: 'error', error: 'forbidden' };

  const parsed = dealInput.safeParse({
    brandName: formData.get('brandName'),
    valueDinars: formData.get('valueDinars') ?? '',
    contactName: formData.get('contactName') ?? undefined,
    contactHandle: formData.get('contactHandle') ?? undefined,
    nextAction: formData.get('nextAction') ?? undefined,
    nextActionDue: formData.get('nextActionDue') ?? '',
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await supabase.from('brand_deals').insert({
    tenant_id: session.tenantId,
    brand_name: parsed.data.brandName,
    stage: 'pitched',
    value_amount: parsed.data.valueDinars,
    contact_name: parsed.data.contactName ?? null,
    contact_handle: parsed.data.contactHandle ?? null,
    next_action: parsed.data.nextAction ?? null,
    next_action_due: parsed.data.nextActionDue,
  });

  if (error) return classify(error.message);

  revalidateConsole('/collaborations');
  return { status: 'success' };
}
