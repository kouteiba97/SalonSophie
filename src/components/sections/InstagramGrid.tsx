import { useTranslations } from 'next-intl';
import { BrandedImage } from '@/components/common/BrandedImage';
import { Reveal } from '@/components/common/Reveal';
import { BUSINESS } from '@/data/business';
import { isTodo } from '@/lib/todo';

const TILES = ['ns-ig-1', 'ns-ig-2', 'ns-ig-3', 'ns-ig-4', 'ns-ig-5', 'ns-ig-6'];

/**
 * The Instagram strip. Handles are unverified (§ TODO_INSTAGRAM_HANDLES) — the design linked
 * four accounts, all pointing at instagram.com with no path — so no link is rendered until the
 * real accounts are confirmed. Phase 6 replaces the tiles with live posts from the Graph API,
 * behind the adapter interface §10 requires.
 */
export function InstagramGrid() {
  const t = useTranslations('instagram');

  return (
    <Reveal
      as="section"
      className="bg-blush-5 px-[clamp(20px,4vw,56px)] py-[clamp(52px,5.5vw,96px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2.5">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-[.28em] text-taupe">
              <span aria-hidden className="text-champagne">
                ✦
              </span>
              {t('eyebrow')}
            </p>
            <h2 className="font-display text-[clamp(28px,3.6vw,44px)] font-light leading-[1.08] text-charcoal">
              {t('title')}
            </h2>
          </div>

          {isTodo(BUSINESS.instagram) ? (
            <p className="max-w-[34ch] text-[13px] text-taupe-2">{t('empty')}</p>
          ) : null}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TILES.map((id) => (
            <BrandedImage
              key={id}
              id={id}
              alt={t('imageAlt')}
              width={400}
              height={400}
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 180px"
              frameClassName="rounded-[16px] w-full"
            />
          ))}
        </div>
      </div>
    </Reveal>
  );
}
