import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';

/**
 * Owner only — a stricter gate than the atelier's or the shelf's, and deliberately so.
 *
 * Payments, invoices and expenses are owner-only under RLS, and every reporting function is
 * `security invoker`, so reception calling one gets an empty result rather than the ledger. This
 * screen would therefore render as a row of zeros for them: an answer that looks like a bad month
 * rather than like a closed door, which is worse than saying no.
 *
 * Still a courtesy. RLS is the boundary, and it holds whatever this file does.
 */
export default async function FinancesLayout({
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
