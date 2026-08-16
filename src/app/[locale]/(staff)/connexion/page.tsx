import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SignInForm } from '@/components/staff/SignInForm';
import type { Locale } from '@/i18n/routing';
import { getStaffSession, isAuthConfigured } from '@/lib/auth';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signIn.title') };
}

export default async function SignInPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Already signed in: the login form would be a dead end.
  const session = await getStaffSession();
  if (session) redirect(`/${locale}/aujourdhui`);

  const t = await getTranslations({ locale, namespace: 'auth.signIn' });

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-8 px-6 py-[clamp(56px,10vw,112px)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden className="font-script text-[46px] leading-none text-champagne">
          N&amp;S
        </span>
        <h1 className="font-display text-[clamp(26px,4vw,34px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>
      </div>

      {isAuthConfigured ? (
        <SignInForm locale={locale} />
      ) : (
        /*
         * No Supabase project is provisioned yet. A login form that could never succeed would
         * read as a broken password rather than an unfinished deployment, so say which it is —
         * the same honesty the booking flow uses when it degrades to request mode.
         */
        <div
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('notConfigured')}
        </div>
      )}
    </div>
  );
}
