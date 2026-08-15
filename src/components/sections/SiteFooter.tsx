import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { GOWNS } from '@/data/bridal';
import { Link } from '@/i18n/navigation';
import { isTodo } from '@/lib/todo';
import { BUSINESS } from '@/data/business';

export function SiteFooter() {
  const t = useTranslations('footer');
  const nav = useTranslations('nav');
  const brand = useTranslations('brand');
  const instagram = useTranslations('instagram');

  return (
    <footer className="bg-charcoal px-[clamp(20px,4vw,56px)] pb-[clamp(90px,9vw,120px)] pt-[clamp(48px,5vw,86px)] text-line">
      <div className="mx-auto grid w-full max-w-[1180px] gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <p className="font-display text-[26px] font-light tracking-[.14em] text-cream">
            N<span className="font-script text-champagne">&amp;</span>S
          </p>
          <p className="text-[10px] uppercase tracking-[.3em] text-taupe">{brand('tagline')}</p>
          <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.75] text-muted-2/80">
            {brand('description')}
          </p>
        </div>

        <nav aria-label={t('salon')} className="flex flex-col gap-2.5">
          <p className="mb-1 text-[11px] uppercase tracking-[.24em] text-champagne">{t('salon')}</p>
          {(['services', 'prices', 'sisters', 'contact'] as const).map((key) => (
            <Link
              key={key}
              href={`/#${key === 'services' ? 'services' : key === 'prices' ? 'tarifs' : key === 'sisters' ? 'soeurs' : 'contact'}`}
              className="text-[13px] text-muted-2/80 transition-colors hover:text-blush"
            >
              {nav(key)}
            </Link>
          ))}
        </nav>

        <nav aria-label={t('bridal')} className="flex flex-col gap-2.5">
          <p className="mb-1 text-[11px] uppercase tracking-[.24em] text-champagne">{t('bridal')}</p>
          <Link href="/robes" className="text-[13px] text-muted-2/80 transition-colors hover:text-blush">
            {t('rentGowns')}
          </Link>
          {GOWNS.map((gown) => (
            <Link
              key={gown.slug}
              href={`/robes/${gown.slug}`}
              className="text-[13px] text-muted-2/80 transition-colors hover:text-blush"
            >
              {gown.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-2.5">
          <p className="mb-1 text-[11px] uppercase tracking-[.24em] text-champagne">
            {t('instagram')}
          </p>
          {/*
            The design listed four handles (@thesisters.ns, @ns.institut, @ns.mariee, @ns.hair).
            None is verified, and a dead link in the footer of a real business is worse than none.
          */}
          {isTodo(BUSINESS.instagram) ? (
            <p className="max-w-[28ch] text-[13px] leading-[1.7] text-muted-2/55">
              {instagram('empty')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
        <span className="text-[12px] text-muted-2/60">
          {t('rights', { year: new Date().getFullYear() })}
        </span>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
