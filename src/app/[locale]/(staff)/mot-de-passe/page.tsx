import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PasswordForm } from '@/components/staff/PasswordForm';
import type { Locale } from '@/i18n/routing';
import { getStaffSession } from '@/lib/auth';

/**
 * Setting a real password, before anything else.
 *
 * Deliberately outside the `(console)` group: it has no sidebar and no navigation, because the
 * whole point is that there is exactly one thing to do here. A gate you can navigate away from
 * is not a gate — and the console layout redirects back here until the flag clears.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.password' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function PasswordPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getStaffSession();
  if (!session) redirect(`/${locale}/connexion`);

  const t = await getTranslations({ locale, namespace: 'auth.password' });

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-8 px-6 py-[clamp(56px,10vw,112px)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="font-script text-[46px] leading-none text-champagne">
          N&amp;S
        </span>
        <h1 className="font-display text-[clamp(26px,4vw,34px)] font-light leading-tight text-charcoal">
          {session.mustChangePassword ? t('firstTitle') : t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">
          {session.mustChangePassword ? t('firstSubtitle') : t('subtitle')}
        </p>
      </div>

      <PasswordForm locale={locale} />
    </div>
  );
}
