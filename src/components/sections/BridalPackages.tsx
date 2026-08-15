import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import { BRIDAL_PACKAGES } from '@/data/bridal';
import { usePrice } from '@/lib/use-price';
import { cn } from '@/lib/utils';

/**
 * Bridal packages — one of the four sections the brief's anchor list does not name but which
 * are part of the approved visual.
 *
 * Both the prices and the contents are held back. The design listed bullets like
 * "Location robe (3 jours)" and "Retouches sur place le jour J": those are policy — how long a
 * gown goes out for, what is included on the day — and §14 is explicit that inventing policy is
 * the same failure as inventing a price.
 */
export function BridalPackages() {
  const t = useTranslations('bridal.packages');
  const price = usePrice();

  return (
    <Reveal
      as="section"
      className="bg-cream px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,104px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
          accent={t('titleAccent')}
          lead={t('lead')}
        />

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {BRIDAL_PACKAGES.map((pkg) => {
            const highlighted = pkg.slug === 'signature';
            return (
              <article
                key={pkg.slug}
                className={cn(
                  'relative flex flex-col gap-5 rounded-[24px] border bg-white p-6',
                  highlighted
                    ? 'border-rose-deep shadow-[0_18px_44px_-26px_rgba(139,111,125,.8)]'
                    : 'border-rose-soft/30',
                )}
              >
                {highlighted ? (
                  <span className="absolute -top-3 start-6 rounded-full bg-rose-deep px-3 py-1 text-[10px] uppercase tracking-[.18em] text-white">
                    {t('mostChosen')}
                  </span>
                ) : null}

                <div className="flex flex-col gap-1">
                  <p className="text-[11px] uppercase tracking-[.24em] text-taupe">{pkg.name}</p>
                  <p className="font-display text-[30px] font-light leading-none text-charcoal">
                    {price(pkg.price)}
                  </p>
                </div>

                <p className="flex-1 text-[13px] leading-[1.75] text-ink-2">
                  {t('detailsOnRequest')}
                </p>

                <BookButton
                  label={t('choose', { name: pkg.name.replace('Forfait ', '') })}
                  variant={highlighted ? 'solid' : 'ghost'}
                  className="w-full py-3 text-[13px]"
                />
              </article>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}
