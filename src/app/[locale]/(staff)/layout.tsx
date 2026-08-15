import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SkipLink } from '@/components/common/SkipLink';
import type { Locale } from '@/i18n/routing';

/**
 * The staff surface.
 *
 * Shares the document shell — fonts, tokens, locale, direction — with the public site and
 * nothing else. No sticky "Réserver" bar, no WhatsApp bubble, no booking modal: this is where
 * the salon works, not where it sells.
 */

/*
 * Nothing under here is ever prerendered.
 *
 * Not a performance choice — a correctness one. With no Supabase credentials present, as during
 * a build, `getStaffSession()` short-circuits to null without ever reading a cookie, so these
 * pages look perfectly static and Next happily prerenders the signed-out redirect. Deployed with
 * credentials, that cached redirect is what every member of staff would get, forever.
 *
 * It sits on the group layout rather than each page so a new console screen inherits it.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  /*
   * The one metadata rule that matters here. The public site wants all three locales indexed;
   * the console wants none of it in a search result, and `nofollow` keeps a crawler that found
   * the login page from walking into the rest.
   */
  robots: { index: false, follow: false, nocache: true },
};

export default async function StaffLayout({
  children,
  params,
}: {
  children: ReactNode;
  // Next's generated layout types widen the segment to `string`; the locale was already
  // validated by the layout above this one.
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <div className="min-h-screen bg-cream-warm">
      <SkipLink />
      <main id="main">{children}</main>
    </div>
  );
}
