import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { MobileNav } from '@/components/common/MobileNav';
import { Link } from '@/i18n/navigation';

const NAV = [
  { key: 'home', hash: '#top' },
  { key: 'services', hash: '#services' },
  { key: 'bridal', hash: '#mariee' },
  { key: 'prices', hash: '#tarifs' },
  { key: 'sisters', hash: '#soeurs' },
  { key: 'contact', hash: '#contact' },
] as const;

export function SiteHeader() {
  const t = useTranslations('nav');
  const brand = useTranslations('brand');

  return (
    /*
      `flex-nowrap` on small screens, and that is a fix rather than a tidy-up.

      With wrapping on, 375px could not fit the logo, the three language pills and the Réserver
      button on one line, so the header folded into two rows and stood 122px tall — fifteen per
      cent of the screen, permanently, on the device almost every visitor uses. It now carries
      the logo, the switcher and the menu, and comes in at one row.
    */
    <header className="sticky top-0 z-60 flex flex-nowrap items-center gap-[clamp(10px,2vw,32px)] border-b border-rose-soft/25 bg-cream/[.86] px-[clamp(16px,4vw,56px)] py-3.5 backdrop-blur-[20px] lg:flex-wrap">
      <Link href="/" className="me-auto flex flex-col leading-none">
        <span className="font-display text-[22px] font-light tracking-[.14em] text-charcoal">
          N<span className="font-script text-champagne">&amp;</span>S
        </span>
        {/* ink-2, not taupe: taupe on cream is 2.87:1, and this is 9px. */}
        <span className="mt-0.5 text-[9px] uppercase tracking-[.3em] text-ink-2">
          {brand('tagline')}
        </span>
      </Link>

      <nav
        aria-label={t('mainNavigation')}
        className="hidden items-center gap-[clamp(14px,2.2vw,34px)] text-[14px] tracking-[.02em] lg:flex"
      >
        {NAV.map(({ key, hash }) => (
          <Link
            key={key}
            href={`/${hash}`}
            className="text-ink-2 transition-colors duration-200 hover:text-rose-deep"
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      {/*
        Desktop only. All three of the logo, the switcher and Réserver cannot share a 375px row
        (181 + 132 + 110 + the menu button overflows it), so one had to move, and the switcher is
        the one that belongs with navigation rather than beside the call to action. MobileNav
        carries it, so Arabic is one tap away rather than gone.
      */}
      <div className="hidden lg:flex">
        <LanguageSwitcher />
      </div>

      {/*
        Stays on every width. Hiding it on mobile was tried and was wrong: it is the primary
        conversion action, and the booking e2e caught the regression immediately — with the
        header button gone, the first "Réserver" on the page became a service card's, which
        pre-selects that service and drops the client at step 2 of 5 having chosen nothing.
      */}
      <BookButton label={t('book')} className="shrink-0 px-5 py-2 text-[13px]" />

      <MobileNav items={NAV} />
    </header>
  );
}
