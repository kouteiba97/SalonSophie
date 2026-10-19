import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { Link } from '@/i18n/navigation';
import { HeroParallax } from './HeroParallax';
import { HeroBookingCard } from './HeroBookingCard';

const BADGES = ['products', 'punctuality', 'care', 'hygiene'] as const;
const BADGE_GLYPH: Record<(typeof BADGES)[number], string> = {
  products: '❀',
  punctuality: '◷',
  care: '❍',
  hygiene: '✜',
};

export function Hero() {
  const t = useTranslations('hero');

  return (
    <section
      id="top"
      className="relative grid bg-cream [grid-template-columns:repeat(auto-fit,minmax(min(100%,470px),1fr))]"
    >
      {/* ── Left: the words ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center gap-7 px-[clamp(20px,4vw,72px)] py-[clamp(56px,7vw,110px)]">
        <p className="ns-word flex items-center gap-3 text-[11px] font-normal uppercase tracking-[.28em] text-taupe">
          <span aria-hidden className="text-champagne">
            ✦
          </span>
          {t('eyebrow')}
        </p>

        <h1 className="font-display text-[clamp(46px,7.2vw,92px)] font-light leading-[.98] tracking-[-.02em] text-balance text-charcoal">
          <span className="ns-word inline-block">{t('titleLine1')}</span>{' '}
          <span className="ns-word inline-block [animation-delay:.12s]">{t('titleLine2')}</span>{' '}
          {/* Exactly one Parisienne word per headline (§4). */}
          <span className="ns-word inline-block font-script text-[1.05em] leading-none text-rose-deep [animation-delay:.24s]">
            {t('titleAccent')}
          </span>
        </h1>

        <p className="ns-word max-w-[46ch] text-[15px] leading-[1.8] text-ink-2 [animation-delay:.34s]">
          {t('subtitle')}
          <br />
          {t('subtitle2')}
        </p>

        <div className="ns-word flex flex-wrap items-center gap-3 [animation-delay:.44s]">
          <BookButton label={t('ctaBook')} className="px-7 py-3.5 text-[15px]" />
          <Link
            href="/#soeurs"
            className="inline-flex items-center gap-2.5 rounded-full border border-rose-soft/55 px-6 py-3.5 text-[14px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-full bg-rose-deep/10 text-[10px] text-rose-deep"
            >
              ▶
            </span>
            {t('ctaStudio')}
          </Link>
        </div>

        {/*
          The design's stat strip sat here: "500+ Clientes heureuses · 15+ Expertes beauté ·
          8+ Ans d'excellence". The middle figure contradicts §6 — only Nour and Sophie are
          confirmed — so all three are held behind TODO_HERO_STATS rather than shown.
        */}

        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-rose-soft/25 pt-6 text-[12px] text-taupe-2">
          {BADGES.map((badge) => (
            <li key={badge} className="flex items-center gap-2">
              <span aria-hidden className="text-champagne">
                {BADGE_GLYPH[badge]}
              </span>
              {t(`badges.${badge}`)}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right: the studio ────────────────────────────────────────────────────────── */}
      {/*
        `min-h` floors at 460px on a phone rather than 420.

        At 375px the 58vw term resolves to 217px, so the clamp always takes its minimum — and 420
        was not enough to hold what sits inside it. The neon starts 24px down and ran to about
        107px over three lines; the booking card is roughly 280px tall and anchored 34px off the
        bottom. That totals 445px in a 420px box, so the card landed on the neon's last line and
        "beautiful" was cut in half.

        The extra 40px is 0.05 of a screen — a fair price for the brand line being readable, and
        far cheaper than the alternative of shrinking the card that takes the bookings.
      */}
      <div className="relative min-h-[clamp(460px,58vw,760px)]">
        <HeroParallax alt={t('imageAlt')} />

        {/* Neon sign — nsFlicker, 2.6s ease-out .4s both, exactly as designed. */}
        {/*
          62% of the column on a phone, 46% from `sm`.

          46% is 154px at 375px wide, which broke "Be your own kind of beautiful" across three
          lines of script and made the sign tall enough to collide with the card below it. The
          width was tuned for a desktop column where 46% is comfortably over 300px; on a phone it
          was squeezing a decorative line into a column narrower than the words.
        */}
        <div className="pointer-events-none absolute top-[clamp(24px,3.5vw,54px)] end-[clamp(22px,3.5vw,60px)] max-w-[min(260px,62%)] text-end [animation:nsFlicker_2.6s_ease-out_.4s_both] sm:max-w-[min(260px,46%)]">
          <span className="font-script text-[clamp(24px,2.6vw,38px)] leading-[1.15] text-champagne-3 [text-shadow:0_0_6px_rgba(255,214,175,.95),0_0_22px_rgba(255,190,150,.75),0_0_48px_rgba(255,170,130,.45)]">
            {t('neon')}
          </span>
        </div>

        <HeroBookingCard />
      </div>
    </section>
  );
}
