import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { BrandedImage } from '@/components/common/BrandedImage';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import { gownSizeLabel } from '@/data/bridal';
import type { Gown } from '@/data/types';
import { Link } from '@/i18n/navigation';
import { usePrice } from '@/lib/use-price';

/**
 * Every gown gets its own route (§5.1 item 3) — a bride must be able to send her mother a link
 * to one dress, not to an anchor halfway down a page.
 *
 * Sizes are on every card, never behind a click: §6 calls it the most frequently asked question.
 * Rental prices are unknown, so the price line reads "Sur devis" rather than the design's
 * invented 38 000 / 45 000 / 55 000 DA.
 */
export function BridalGallery({ gowns }: { gowns: Gown[] }) {
  const t = useTranslations('bridal');
  const price = usePrice();

  return (
    <Reveal
      as="section"
      id="mariee"
      className="bg-[linear-gradient(170deg,var(--color-blush-5)_0%,var(--color-cream)_62%)] px-[clamp(20px,4vw,56px)] py-[clamp(64px,7vw,120px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
          accent={t('titleAccent')}
          lead={t('lead')}
        />

        <div className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,272px),1fr))]">
          {gowns.map((gown) => (
            <article
              key={gown.slug}
              id={`robe-${gown.slug}`}
              className="group flex flex-col overflow-hidden rounded-[24px] border border-rose-soft/30 bg-white transition-colors duration-200 hover:border-rose-deep/45"
            >
              <div className="relative">
                <Link href={`/robes/${gown.slug}`} aria-label={gown.name}>
                  <BrandedImage
                    id={gown.imageId}
                    alt={gown.name}
                    width={640}
                    height={800}
                    sizes="(max-width: 640px) 100vw, 300px"
                    frameClassName="w-full"
                  />
                </Link>
                <span className="absolute top-3 end-3 rounded-full bg-cream-warm/90 px-3 py-1 text-[10px] uppercase tracking-[.2em] text-rose-deep backdrop-blur-sm">
                  {gown.tier}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-5">
                <h3 className="font-display text-[24px] font-light leading-tight text-charcoal">
                  <Link href={`/robes/${gown.slug}`} className="transition-colors hover:text-rose-deep">
                    {gown.name}
                  </Link>
                </h3>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-full bg-tint px-3 py-1 text-[12px] text-ink-2">
                    {t('sizes', { range: gownSizeLabel(gown) })}
                  </span>
                  <span className="text-[13px] text-rose-deep">{price(gown.rentalPrice)}</span>
                </div>

                <p className="text-[13px] leading-[1.7] text-ink-2">
                  {t(`gowns.${gown.slug}.silhouette`)}
                </p>

                <BookButton
                  label={t('checkAvailability')}
                  gownSlug={gown.slug}
                  variant="ghost"
                  className="mt-auto w-full py-2.5 text-[13px]"
                />
              </div>
            </article>
          ))}

          {/*
            The design's fourth card claimed "vingt-deux robes en stock, dont onze exclusivités"
            and a one-hour private fitting. §6 names three gowns and no fitting duration, so the
            card keeps its place and its invitation without the invented inventory count.
          */}
          <article className="flex flex-col justify-center gap-3 rounded-[24px] border border-dashed border-rose-soft/55 bg-cream-warm/70 p-6 text-center">
            <span aria-hidden className="text-[18px] text-champagne">
              ✦
            </span>
            <h3 className="font-display text-[21px] font-light leading-tight text-charcoal">
              {t('showroom.title')}
            </h3>
            <p className="text-[13px] leading-[1.7] text-ink-2">{t('showroom.body')}</p>
            <BookButton
              label={t('showroom.cta')}
              variant="ghost"
              className="mt-2 w-full py-2.5 text-[13px]"
            />
          </article>
        </div>
      </div>
    </Reveal>
  );
}
