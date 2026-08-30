import 'server-only';
import { cache } from 'react';
import { isDemoMode } from '@/lib/console/demo';
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
  /**
   * True while the account still carries the temporary password an owner set for it.
   *
   * The console gates everything behind changing it. A password that was said out loud once has
   * been said out loud, and a salon's console is not a place to leave that standing.
   */
  mustChangePassword: boolean;
}

interface UserRow {
  id: string;
  tenant_id: string;
  role_key: StaffRole;
  full_name: string;
  email: string | null;
  is_active: boolean;
  must_change_password: boolean;
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
  /*
   * Demo mode signs you in as an owner without an auth server.
   *
   * Safe because `isDemoMode()` requires the *absence* of a configured database: there is no
   * real client data for this session to reach, because there is no data. The moment Supabase
   * credentials exist the flag stops having any effect, and this branch is unreachable.
   */
  if (isDemoMode()) {
    const { DEMO_SESSION } = await import('@/lib/console/demo');
    return DEMO_SESSION;
  }

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
    .select('id, tenant_id, role_key, full_name, email, is_active, must_change_password')
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
    mustChangePassword: profile.must_change_password,
  };
});

/** Sophie and Nour. The only role that may write to the atelier (see the RLS migration). */
export const isOwner = (session: StaffSession | null): boolean => session?.role === 'owner';

/**
 * The two dashboards.
 *
 * An owner runs the business: money, stock, the tariff, who works here. Everyone else runs the
 * day: appointments, clients, and telling the owner what is running out. `isAdmin` is `isOwner`
 * under the name the console uses when it is deciding which dashboard to show, because the two
 * questions are genuinely different and only happen to share an answer today — a fourth role
 * would change one and not the other.
 */
export const isAdmin = (session: StaffSession | null): boolean => isOwner(session);

/** Reception and stylists — the people on the floor. */
export const isWorker = (session: StaffSession | null): boolean =>
  session?.role === 'reception' || session?.role === 'stylist';

/** Owner or reception — the two roles that run the day across every client. */
export const isFrontDesk = (session: StaffSession | null): boolean =>
  session?.role === 'owner' || session?.role === 'reception';

export { isAuthConfigured };
