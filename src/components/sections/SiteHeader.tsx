import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
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
    <header className="sticky top-0 z-60 flex flex-wrap items-center gap-[clamp(12px,2vw,32px)] border-b border-rose-soft/25 bg-cream/[.86] px-[clamp(18px,4vw,56px)] py-3.5 backdrop-blur-[20px]">
      <Link href="/" className="me-auto flex flex-col leading-none">
        <span className="font-display text-[22px] font-light tracking-[.14em] text-charcoal">
          N<span className="font-script text-champagne">&amp;</span>S
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-[.3em] text-taupe">
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

      <LanguageSwitcher />

      <BookButton label={t('book')} className="px-5 py-2 text-[13px]" />
    </header>
  );
}
