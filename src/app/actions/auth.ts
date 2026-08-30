'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { routing, type Locale } from '@/i18n/routing';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Staff sign-in and sign-out.
 *
 * There is no public sign-up. Accounts are created by an owner from inside the console
 * (`create_staff_account`), because a console that let anyone register would hand out a login to
 * a surface holding every client's phone number. What a new worker gets is a temporary password
 * said out loud once; `changePassword` below is how it stops being valid.
 *
 * Both actions take FormData so the forms work with JavaScript disabled or still downloading,
 * which on Algerian 4G is a real state and not a theoretical one.
 */

const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  locale: z.enum(routing.locales),
});

export type SignInState =
  | { status: 'idle' }
  /*
   * One error for every failure. "No such account" and "wrong password" are deliberately the
   * same message: telling them apart turns the login form into a way to ask whether a given
   * person works here.
   */
  | { status: 'error'; error: 'invalid_credentials' | 'not_configured' | 'unavailable' };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', error: 'invalid_credentials' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Anything the auth server rejects is a failed sign-in as far as this form is concerned.
    if (error.status === 400 || error.status === 401) {
      return { status: 'error', error: 'invalid_credentials' };
    }
    console.error('[N&S] sign-in failed:', error.message);
    return { status: 'error', error: 'unavailable' };
  }

  revalidatePath('/', 'layout');
  // Outside the error handling above on purpose: redirect() signals by throwing.
  // The day is the console's home — §13 calls the day-line its most important screen, and it is
  // the one view every role can use.
  redirect(`/${parsed.data.locale}/ma-journee`);
}

export async function signOut(formData: FormData): Promise<void> {
  const raw = formData.get('locale');
  const locale = (routing.locales as readonly string[]).includes(String(raw))
    ? (raw as Locale)
    : routing.defaultLocale;

  const supabase = await getSupabaseSessionClient();
  if (supabase) await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect(`/${locale}/connexion`);
}

/* ── changing your own password ───────────────────────────────────────────────────────────── */

export type PasswordState =
  | { status: 'idle' }
  | { status: 'error'; error: 'too_short' | 'mismatch' | 'not_configured' | 'unavailable' };

/**
 * Sets a new password for whoever is signed in.
 *
 * The database function takes the subject from `auth.uid()` rather than a parameter, so this
 * cannot be aimed at another account no matter what is posted. Clearing
 * `must_change_password` is part of the same transaction — a password that changed but left the
 * flag set would lock someone in the gate forever.
 */
export async function changePassword(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const locale = String(formData.get('locale') ?? 'fr') as Locale;

  if (password.length < 10) return { status: 'error', error: 'too_short' };
  if (password !== confirm) return { status: 'error', error: 'mismatch' };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const { error } = await callRpc<null>(supabase, 'change_own_password', {
    p_new_password: password,
  });

  if (error) {
    console.error('[N&S] password change failed:', error.message);
    return { status: 'error', error: 'unavailable' };
  }

  revalidatePath(`/${locale}`, 'layout');
  redirect(`/${locale}/ma-journee`);
}
