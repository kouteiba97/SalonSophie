import 'server-only';
import { cache } from 'react';
import { getSupabaseSessionClient, isAuthConfigured } from '@/lib/supabase/session';

/**
 * Who is signed in, and what the console may therefore show them.
 *
 * This is a convenience, not a security boundary. Every query the console makes is filtered by
 * RLS with the same JWT, so hiding a link and refusing a row are independent — the first is
 * courtesy, the second is enforcement. A bug here shows someone an empty page; it cannot show
 * them another stylist's clients.
 */

export type StaffRole = 'owner' | 'reception' | 'stylist';

export interface StaffSession {
  userId: string;
  email: string | null;
  fullName: string;
  role: StaffRole;
  tenantId: string;
  /** The bookable-person row, when this user is one. Reception may have no staff row. */
  staffId: string | null;
  staffSlug: string | null;
}

interface UserRow {
  id: string;
  tenant_id: string;
  role_key: StaffRole;
  full_name: string;
  email: string | null;
  is_active: boolean;
}

interface StaffRow {
  id: string;
  slug: string;
}

/**
 * The signed-in staff member, or null.
 *
 * `cache()` scopes this to one request, so a layout, a page and three server components asking
 * "who is this?" cost one round trip rather than five.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const supabase = await getSupabaseSessionClient();
  if (!supabase) return null;

  /*
   * getUser(), never getSession(). getSession() reads the cookie and trusts it; getUser()
   * revalidates the token with the auth server. On a page that decides what someone may see,
   * trusting an unverified cookie is the whole vulnerability.
   */
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // `users_self_read` lets any authenticated user read their own row and nothing else.
  const { data: profile } = await supabase
    .from('users')
    .select('id, tenant_id, role_key, full_name, email, is_active')
    .eq('id', user.id)
    .maybeSingle()
    .returns<UserRow | null>();

  /*
   * An auth account with no `public.users` row is not staff. That happens if someone is invited
   * in the Supabase dashboard and never given a role — they get no console, rather than a
   * default one.
   */
  if (!profile || !profile.is_active) return null;

  const { data: staff } = await supabase
    .from('staff')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle()
    .returns<StaffRow | null>();

  return {
    userId: profile.id,
    email: profile.email ?? user.email ?? null,
    fullName: profile.full_name,
    role: profile.role_key,
    tenantId: profile.tenant_id,
    staffId: staff?.id ?? null,
    staffSlug: staff?.slug ?? null,
  };
});

/** Sophie and Nour. The only role that may write to the atelier (see the RLS migration). */
export const isOwner = (session: StaffSession | null): boolean => session?.role === 'owner';

/** Owner or reception — the two roles that run the day across every client. */
export const isFrontDesk = (session: StaffSession | null): boolean =>
  session?.role === 'owner' || session?.role === 'reception';

export { isAuthConfigured };
