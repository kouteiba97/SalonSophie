'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { routing, type Locale } from '@/i18n/routing';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Staff sign-in and sign-out.
 *
 * There is no sign-up. Accounts are created by an owner in the Supabase dashboard and given a
 * `public.users` row with a role — a console that let anyone register would hand out a login to
 * a surface holding every client's phone number.
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
  redirect(`/${parsed.data.locale}/atelier`);
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
