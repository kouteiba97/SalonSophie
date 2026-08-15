import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Two jobs, in order: resolve the locale, then refresh the staff session.
 *
 * next-intl owns the response — it may redirect `/` to `/fr`, or rewrite — so the Supabase client
 * writes its refreshed cookies onto whatever response next-intl produced rather than building a
 * second one. Getting that order wrong is how a signed-in user gets silently logged out on the
 * first redirect.
 *
 * The refresh has to happen in middleware: Server Components cannot set cookies, so a rotated
 * refresh token discovered while rendering a page would be thrown away.
 */

const handleI18n = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const response = handleI18n(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No project provisioned yet: the public site runs on the committed seed and there is no
  // session to refresh.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  /*
   * This call is the point of the whole function. getUser() revalidates the token with the auth
   * server and, if the access token had expired, writes a rotated pair through setAll above.
   * Nothing may run between creating the client and calling it.
   */
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
