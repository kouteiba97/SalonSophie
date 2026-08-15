import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { BookingProvider } from '@/components/booking/BookingProvider';
import { BookingModal } from '@/components/booking/BookingModal';
import { SkipLink } from '@/components/common/SkipLink';
import { StickyCta } from '@/components/common/StickyCta';
import { WhatsAppFab } from '@/components/common/WhatsAppFab';
import { SiteFooter } from '@/components/sections/SiteFooter';
import { SiteHeader } from '@/components/sections/SiteHeader';
import { getCatalogue } from '@/data/catalogue';
import { LOCALE_DIR, routing, type Locale } from '@/i18n/routing';
import { fontVariables } from '@/lib/fonts';
import { warnUnknownData } from '@/lib/todo';

import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: 'meta.home' });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thesisters-ns.dz';

  return {
    metadataBase: new URL(base),
    title: { default: t('title'), template: '%s' },
    description: t('description'),
    // Every locale is indexable at its own path, and each declares the others (§5.6 item 23).
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: 'website',
      locale,
      siteName: 'The Sisters N&S',
      title: t('title'),
      description: t('description'),
      url: `/${locale}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts every page into static rendering rather than forcing dynamic on first hook use.
  setRequestLocale(locale);
  warnUnknownData();

  const typedLocale = locale as Locale;

  // Read once here and hand to the booking flow, so the modal's service list and the tariff on
  // the page behind it can never disagree.
  const { categories, services, gowns } = await getCatalogue();

  return (
    // dir and lang belong on <html>, never on a nested div (§5.6 item 24).
    <html lang={typedLocale} dir={LOCALE_DIR[typedLocale]} className={fontVariables}>
      <body className="min-h-screen antialiased">
        {/*
          Runs before first paint, so scroll reveals can start hidden without a flash — while
          the stylesheet keeps them visible for anyone whose JavaScript never arrives.
          Deliberately an attribute rather than a class: React renders className on <html>, and
          mutating it here would be a hydration mismatch.

          It lives here rather than in a <head> element: the App Router owns the document head,
          and hand-rendering <head> in a layout drops Next's own stylesheet link.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.setAttribute('data-js','');",
          }}
        />
        <NextIntlClientProvider>
          <BookingProvider catalogue={{ categories, services, gowns }}>
            <SkipLink />
            <SiteHeader />
            <main id="main">{children}</main>
            <SiteFooter />
            <StickyCta />
            <WhatsAppFab />
            <BookingModal />
          </BookingProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
