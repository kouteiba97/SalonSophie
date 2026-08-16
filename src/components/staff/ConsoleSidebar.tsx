'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { signOut } from '@/app/actions/auth';
import type { StaffRole } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * The console's navigation — §13's sidebar.
 *
 * A client component only because the active item depends on the current path. The session it
 * renders is passed down already narrowed to a name and a role, so nothing else about the user
 * crosses to the browser.
 *
 * Items a role cannot use are not rendered. That is presentation, not protection: RLS refuses
 * the data either way, and the atelier gate refuses the page. Hiding a door nobody can open
 * beats showing one that always says no.
 */

interface Item {
  href: string;
  labelKey:
    | 'today'
    | 'inbox'
    | 'atelier'
    | 'clients'
    | 'prestations'
    | 'stock'
    | 'finances'
    | 'deals';
  /** Roles that get anything useful from the screen. */
  roles: StaffRole[];
}

const ITEMS: Item[] = [
  { href: '/aujourdhui', labelKey: 'today', roles: ['owner', 'reception', 'stylist'] },
  { href: '/messages', labelKey: 'inbox', roles: ['owner', 'reception'] },
  { href: '/atelier', labelKey: 'atelier', roles: ['owner', 'reception'] },
  { href: '/clients', labelKey: 'clients', roles: ['owner', 'reception', 'stylist'] },
  { href: '/prestations', labelKey: 'prestations', roles: ['owner', 'reception', 'stylist'] },
  // Reception records what was used; `products_front_desk_read` gives a stylist nothing here.
  { href: '/stock', labelKey: 'stock', roles: ['owner', 'reception'] },
  // Owner only: payments and expenses are owner-only under RLS, so anyone else reads zeros.
  { href: '/finances', labelKey: 'finances', roles: ['owner'] },
  // The line non-negotiable #5 names outright: reception can't see brand deals.
  { href: '/collaborations', labelKey: 'deals', roles: ['owner'] },
];

export function ConsoleSidebar({
  fullName,
  role,
  locale,
}: {
  fullName: string;
  role: StaffRole;
  locale: Locale;
}) {
  const t = useTranslations('console.nav');
  const roles = useTranslations('atelier.roles');
  const pathname = usePathname();

  const visible = ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div className="flex flex-col gap-6 border-b border-line bg-white px-6 py-5 lg:h-dvh lg:w-[248px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-e lg:px-5">
      <Link href="/aujourdhui" className="flex items-baseline gap-2">
        <span aria-hidden className="font-script text-[26px] leading-none text-champagne">
          N&amp;S
        </span>
        <span className="text-[11px] uppercase tracking-[.24em] text-taupe">{t('console')}</span>
      </Link>

      <nav aria-label={t('label')} className="lg:flex-1">
        <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
          {visible.map((item) => {
            /*
             * Prefix match, so /atelier/robes/anastasia still highlights Atelier — but anchored
             * at a segment boundary, or /client would light up /clients.
             */
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-full px-4 py-2 text-[13px] transition-colors lg:rounded-[14px]',
                    active
                      ? 'bg-tint text-rose-deep'
                      : 'text-ink-2 hover:bg-cream hover:text-rose-deep',
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
        <LanguageSwitcher />

        <span className="flex flex-col leading-tight">
          <span className="text-[13px] text-charcoal">{fullName}</span>
          <span className="text-[11px] text-taupe">{roles(role)}</span>
        </span>

        {/* A form, not a link: signing out is a state change, and a GET that logs you out is
            one prefetch away from doing it by accident. */}
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
  );
}
