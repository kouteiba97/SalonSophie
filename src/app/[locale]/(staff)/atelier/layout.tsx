import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { StaffHeader } from '@/components/staff/StaffHeader';
import type { Locale } from '@/i18n/routing';
import { getStaffSession, isFrontDesk } from '@/lib/auth';

/**
 * The atelier console — everything below this is signed in.
 *
 * The guard is a courtesy, not the boundary. RLS decides what any of these pages can actually
 * read: `gown_reservations_read` is limited to owner and reception, so a stylist who reached
 * this URL would see an empty console rather than someone else's brides. Saying so plainly is
 * better than showing them nothing and letting them think it is broken.
 */

export default async function AtelierLayout({
  children,
  params,
}: {
  children: ReactNode;
  // Next's generated layout types widen the segment to `string`; the locale was already
  // validated by the layout above this one.
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  setRequestLocale(typedLocale);

  const session = await getStaffSession();
  if (!session) redirect(`/${typedLocale}/connexion`);

  if (!isFrontDesk(session)) {
    const t = await getTranslations({ locale: typedLocale, namespace: 'atelier.forbidden' });
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 px-6 py-[clamp(64px,11vw,140px)] text-center">
        <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.8] text-ink-2">{t('body')}</p>
      </div>
    );
  }

  return (
    <>
      <StaffHeader session={session} locale={typedLocale} />
      <div className="mx-auto w-full max-w-[1180px] px-6 py-8">{children}</div>
    </>
  );
}
