import { getTranslations } from 'next-intl/server';

import { signOut } from '@/app/actions/auth';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { StaffSession } from '@/lib/auth';

/**
 * The console's one piece of chrome: who you are, where you can go, and how to leave.
 *
 * A Server Component, so the session never crosses to the client. Sign-out is a form posting to
 * a server action rather than a link — signing out is a state change, and a GET that logs you
 * out is one prefetch away from doing it by accident.
 */
export async function StaffHeader({
  session,
  locale,
}: {
  session: StaffSession;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: 'atelier.nav' });
  const roles = await getTranslations({ locale, namespace: 'atelier.roles' });

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <Link href="/atelier" className="flex items-baseline gap-2">
          <span aria-hidden className="font-script text-[26px] leading-none text-champagne">
            N&amp;S
          </span>
          <span className="text-[11px] uppercase tracking-[.24em] text-taupe">{t('atelier')}</span>
        </Link>

        <nav aria-label={t('label')} className="flex items-center gap-5">
          <Link
            href="/atelier"
            className="text-[13px] text-ink-2 transition-colors hover:text-rose-deep"
          >
            {t('gowns')}
          </Link>
          <Link
            href="/atelier/reservations"
            className="text-[13px] text-ink-2 transition-colors hover:text-rose-deep"
          >
            {t('reservations')}
          </Link>
        </nav>

        <div className="flex items-center gap-4 ms-auto">
          <LanguageSwitcher />

          <span className="flex flex-col text-end leading-tight">
            <span className="text-[13px] text-charcoal">{session.fullName}</span>
            <span className="text-[11px] text-taupe">{roles(session.role)}</span>
          </span>

          <form action={signOut}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
            >
              {t('signOut')}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
