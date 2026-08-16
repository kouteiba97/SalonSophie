import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client for the staff console — the anon key plus the caller's session cookie.
 *
 * The distinction from `server.ts` matters. That client is deliberately session-less: the public
 * site should see exactly what an anonymous visitor sees. This one carries the logged-in staff
 * member's JWT, so every query it makes is filtered by the RLS policies written for their role —
 * reception cannot read brand deals, a stylist cannot read another stylist's clients, and neither
 * is enforced by anything in this process.
 *
 * It is still the anon key. There is no service-role key anywhere in this application: a key that
 * bypasses RLS on every table, held by a process that also renders HTML, is how the console's
 * authorisation model would quietly stop being the database's problem.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether staff sign-in is possible at all. No Supabase project is provisioned yet. */
export const isAuthConfigured = Boolean(url && anonKey);

/**
 * Returns null when no project is configured, so callers can render an honest "not connected"
 * state instead of throwing behind a login form that could never have worked.
 *
 * Not memoised: it reads the request's cookie jar, and `cookies()` is per-request already.
 */
export async function getSupabaseSessionClient(): Promise<SupabaseClient | null> {
  if (!isAuthConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * Server Components cannot set cookies. That is fine and expected: the middleware
           * refreshes the session on every request, so a read here never needs to write one.
           * Swallowing it is the documented pattern, not an ignored error.
           */
        }
      },
    },
  });
}
