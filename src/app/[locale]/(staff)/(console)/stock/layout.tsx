import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/routing';
import { getStaffSession, isFrontDesk } from '@/lib/auth';

/**
 * The shelf's own gate, for the same reason the atelier has one.
 *
 * `products_front_desk_read` is limited to owner and reception, so a stylist reaching this URL
 * would see two empty panels and reasonably conclude the screen is broken. Saying why is better.
 *
 * A courtesy, not the boundary — RLS refuses the rows whatever this file does.
 */
export default async function StockLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  setRequestLocale(typedLocale);

  const session = await getStaffSession();

  if (!isFrontDesk(session)) {
    const t = await getTranslations({ locale: typedLocale, namespace: 'atelier.forbidden' });
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-[clamp(48px,9vw,112px)] text-center">
        <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.8] text-ink-2">{t('body')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
