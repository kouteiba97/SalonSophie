import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';

/**
 * Owner only.
 *
 * The screen mints logins to a console holding every client's phone number, so it is the one place
 * where showing the door to the wrong person matters most. Still a courtesy: every function behind
 * it checks `is_owner()` inside the database, which is what a forged request actually hits.
 */
export default async function TeamLayout({
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

  if (!isOwner(session)) {
    const t = await getTranslations({ locale: typedLocale, namespace: 'console.team.forbidden' });
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
