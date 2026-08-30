'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { passwordResetInput, staffAccountInput, staffActiveInput } from '@/lib/accounts/schema';
import { getStaffSession, isOwner } from '@/lib/auth';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Who works here, managed by an owner.
 *
 * Every function behind these is SECURITY DEFINER, because creating a login means writing into
 * the `auth` schema and no application role may touch it. That makes the `is_owner()` check
 * *inside* the database function the real boundary — the role check here only buys a better
 * message, exactly as everywhere else in this console.
 */

export type AccountError =
  | 'forbidden'
  | 'not_configured'
  | 'invalid'
  | 'invalid_email'
  | 'invalid_name'
  | 'weak_password'
  | 'email_taken'
  | 'unknown_staff'
  | 'cannot_disable_self'
  | 'not_found'
  | 'unavailable';

export type AccountState =
  | { status: 'idle' }
  /** Carries the password back so the owner can read it out once, then never again. */
  | { status: 'created'; email: string; password: string }
  | { status: 'success' }
  | { status: 'error'; error: AccountError; field?: string };

function classify(message: string): AccountState {
  const named: [string, AccountError][] = [
    ['account_email_taken', 'email_taken'],
    ['account_invalid_email', 'invalid_email'],
    ['account_invalid_name', 'invalid_name'],
    ['account_weak_password', 'weak_password'],
    ['account_invalid_role', 'invalid'],
    ['account_unknown_staff', 'unknown_staff'],
    ['account_cannot_disable_self', 'cannot_disable_self'],
    ['account_not_found', 'not_found'],
    ['account_forbidden', 'forbidden'],
    ['row-level security', 'forbidden'],
    ['permission denied', 'forbidden'],
  ];

  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }

  console.error('[N&S] accounts: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

function revalidateTeam() {
  for (const locale of routing.locales) revalidatePath(`/${locale}`, 'layout');
}

async function requireOwner() {
  const session = await getStaffSession();
  if (!session || !isOwner(session)) return { supabase: null, error: 'forbidden' as const };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { supabase: null, error: 'not_configured' as const };

  return { supabase, error: null };
}

/**
 * Creates a worker's login.
 *
 * The password comes back in the result on purpose. There is no SMTP configured and most of the
 * team will not have a working email address anyway — the delivery mechanism is an owner reading
 * it out. It is shown once, on this screen, and never retrievable afterwards: the database stores
 * only a bcrypt hash, and the account is forced to replace it at first sign-in.
 */
export async function createStaffAccount(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const parsed = staffAccountInput.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
    staffSlug: formData.get('staffSlug') ?? '',
    bookable: formData.get('bookable') === 'true',
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const known: Record<string, AccountError> = {
      invalid_email: 'invalid_email',
      invalid_name: 'invalid_name',
      weak_password: 'weak_password',
    };
    return {
      status: 'error',
      error: (issue && known[issue.message]) ?? 'invalid',
      field: issue?.path.join('.'),
    };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };

  const d = parsed.data;
  const { error } = await callRpc<string>(owner.supabase, 'create_staff_account', {
    p_email: d.email,
    p_password: d.password,
    p_full_name: d.fullName,
    p_role: d.role,
    p_staff_slug: d.staffSlug,
    p_bookable: d.bookable,
  });

  if (error) return classify(error.message);

  revalidateTeam();
  return { status: 'created', email: d.email, password: d.password };
}

/** Turning an account off, and back on. A leaver is deactivated, never deleted. */
export async function setStaffActive(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const parsed = staffActiveInput.safeParse({
    userId: formData.get('userId'),
    active: formData.get('active') === 'true',
  });
  if (!parsed.success) return { status: 'error', error: 'invalid' };

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };

  const { error } = await callRpc<null>(owner.supabase, 'set_staff_active', {
    p_user_id: parsed.data.userId,
    p_active: parsed.data.active,
  });

  if (error) return classify(error.message);

  revalidateTeam();
  return { status: 'success' };
}

/**
 * A forgotten password, reset to another temporary one.
 *
 * The reset re-arms `must_change_password`, so an owner never ends up permanently knowing what a
 * member of their team signs in with.
 */
export async function resetStaffPassword(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const parsed = passwordResetInput.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { status: 'error', error: 'weak_password' };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };

  const { error } = await callRpc<null>(owner.supabase, 'reset_staff_password', {
    p_user_id: parsed.data.userId,
    p_password: parsed.data.password,
  });

  if (error) return classify(error.message);

  revalidateTeam();
  return { status: 'created', email: '', password: parsed.data.password };
}
