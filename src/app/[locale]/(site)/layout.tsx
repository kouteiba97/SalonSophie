import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { BookingModal } from '@/components/booking/BookingModal';
import { BookingProvider } from '@/components/booking/BookingProvider';
import { SkipLink } from '@/components/common/SkipLink';
import { StickyCta } from '@/components/common/StickyCta';
import { WhatsAppFab } from '@/components/common/WhatsAppFab';
import { SiteFooter } from '@/components/sections/SiteFooter';
import { SiteHeader } from '@/components/sections/SiteHeader';
import { getCatalogue } from '@/data/catalogue';
import { routing, type Locale } from '@/i18n/routing';

/**
 * The public site's chrome.
 *
 * Split out of the locale layout when the staff console arrived: a console with a "Réserver"
 * sticky CTA and a WhatsApp bubble over it would be the wrong surface entirely.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function SiteLayout({
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

  // Read once here and hand to the booking flow, so the modal's service list and the tariff on
  // the page behind it can never disagree.
  const { categories, services, gowns } = await getCatalogue();

  return (
    <BookingProvider catalogue={{ categories, services, gowns }}>
      <SkipLink />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <StickyCta />
      <WhatsAppFab />
      <BookingModal />
    </BookingProvider>
  );
}
