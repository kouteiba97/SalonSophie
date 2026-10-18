import { useTranslations } from 'next-intl';
import { BookButton } from '@/components/common/BookButton';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import type { Service, ServiceCategory } from '@/data/types';
import { Link } from '@/i18n/navigation';
import { usePrice, useDuration } from '@/lib/use-price';
import { cn } from '@/lib/utils';

interface ServicesGridProps {
  category?: string;
  categories: ServiceCategory[];
  services: Service[];
}

/**
 * The category filter lives in the URL as `?categorie=` (BUILD_BRIEF §5.2 item 4), so a filtered
 * view is shareable and the back button works. That makes the chips links rather than buttons —
 * they navigate, and `aria-current` exposes which one is active. The design's chips were
 * `<button>`s driving `this.state.cat`, which no one could link to.
 */
export function ServicesGrid({ category, categories, services }: ServicesGridProps) {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const price = usePrice();
  const duration = useDuration();

  const active = categories.some((c) => c.slug === category) ? category : undefined;

  /**
   * Unfiltered, the grid previews the first few of each category rather than all 55 lines.
   *
   * The design's grid held 22 cards, two to four per category. The real tariff has 55, and
   * rendering every one turned a browsable gallery into a wall roughly two and a half times
   * the approved height, pushing the bridal section far below the fold. Nothing is hidden:
   * a category chip opens that category in full, and the complete tariff is the next section.
   *
   * This is a presentation choice, not a data one — no price or service is edited or omitted
   * from the catalogue itself.
   */
  const PREVIEW_PER_CATEGORY = 3;

  const visible = active
    ? services.filter((s) => s.categorySlug === active)
    : categories.flatMap((c) =>
        services.filter((s) => s.categorySlug === c.slug).slice(0, PREVIEW_PER_CATEGORY),
      );

  const hiddenCount = services.length - visible.length;

  return (
    <Reveal
      as="section"
      id="services"
      className="bg-cream px-[clamp(20px,4vw,56px)] py-[clamp(64px,7vw,120px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow={t('eyebrow')}
            title={t('title')}
            accent={t('titleAccent')}
            lead={t('lead')}
          />
          <p className="text-[12px] text-taupe">{t('count', { count: visible.length })}</p>
        </div>

        <div className="mt-9 flex flex-wrap gap-2.5">
          <Chip href="/#services" label={t('all')} active={!active} />
          {categories.map((c) => (
            <Chip
              key={c.slug}
              href={`/?categorie=${c.slug}#services`}
              label={c.name}
              active={active === c.slug}
            />
          ))}
        </div>

          {/*
            A price list on a phone, a card grid from `sm` up.

            The card is right on a wide screen and wrong on a narrow one. At 375px the track
            `minmax(min(100%,286px),1fr)` can only ever resolve to a single column, so twenty-four
            services became twenty-four stacked blocks roughly 340px tall — about eight thousand
            pixels of scrolling to read a tariff. The client arriving from an Instagram reel wants
            to know what a brushing costs, and was being asked to scroll past twenty-three other
            answers to find it.

            Below `sm` each one is now a row: name on the left, price and duration on the right,
            around 76px tall. The same information, roughly a quarter of the travel, and it reads
            the way a salon's printed tariff reads. From `sm` the original card returns untouched.
          */}
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-8 grid gap-2 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,286px),1fr))]">
            {visible.map((service) => {
              const categoryName = categories.find((c) => c.slug === service.categorySlug)?.name;
              return (
                <article
                  key={service.slug}
                  className="flex items-center gap-4 rounded-[16px] border border-rose-soft/30 bg-white p-4 transition-colors duration-200 hover:border-rose-deep/45 sm:flex-col sm:items-stretch sm:gap-3 sm:rounded-[22px] sm:p-5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none sm:gap-3">
                    {/*
                      The category is redundant on mobile — the filter pills above already say
                      which one is showing — and it is the line that made each row three tall.
                    */}
                    <p className="hidden text-[10px] uppercase tracking-[.22em] text-taupe sm:block">
                      {categoryName}
                    </p>

                    <h3 className="font-display text-[17px] font-light leading-tight text-charcoal sm:text-[21px]">
                      <Link
                        href={`/services/${service.slug}`}
                        className="text-charcoal transition-colors hover:text-rose-deep"
                      >
                        {service.name}
                      </Link>
                    </h3>

                    {service.note ? (
                      <p className="text-[12px] text-taupe-2">
                        {tc(service.note as 'supplement' | 'withAnyMassage')}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 sm:mt-auto sm:items-end sm:justify-between sm:border-t sm:border-line sm:pt-3.5">
                    <div className="flex flex-col items-end sm:items-start">
                      <span className="text-[16px] text-rose-deep sm:text-[17px]">{price(service.price)}</span>
                      {/*
                        `taupe-2`, not `muted`, and that is an accessibility fix rather than a
                        restyle. `--muted` (#C7BAB3) on white is 1.89:1 — far under the 4.5:1 AA
                        floor (non-negotiable #8) and unreadable at 12px on a phone in daylight,
                        which is the exact condition this site is built for.

                        It went unnoticed because every duration was an em dash while §6 had them
                        all unknown, and axe does not flag a slot with nothing in it. The first
                        real durations turned the same token into failing body text on four pages.

                        `--taupe-2` (#7A6E68) is 4.93:1 and the nearest token in the same warm
                        grey family, so the hierarchy the design intended survives.
                      */}
                      <span className="whitespace-nowrap text-[11px] text-taupe-2 sm:text-[12px]">{duration(service.duration)}</span>
                    </div>
                    <BookButton
                      label={t('book')}
                      serviceSlug={service.slug}
                      variant="quiet"
                      className="shrink-0 pb-0.5"
                      labelClassName="hidden sm:inline"
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {hiddenCount > 0 ? (
          <p className="mt-7 text-center text-[13px] text-ink-2">
            <Link
              href="/#tarifs"
              className="border-b border-rose-soft/60 pb-0.5 text-rose-deep transition-colors hover:border-rose-deep"
            >
              {t('seeFullTariff', { count: services.length })}
            </Link>
          </p>
        ) : null}
      </div>
    </Reveal>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      scroll={false}
      className={cn(
        'whitespace-nowrap rounded-full border px-[18px] py-[9px] text-[13px] tracking-[.03em] transition-all duration-200',
        active
          ? 'border-rose-deep bg-rose-deep text-white'
          : 'border-rose-soft/55 text-ink-2 hover:border-rose-deep hover:text-rose-deep',
      )}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  const t = useTranslations('services.empty');
  return (
    <div className="mt-8 rounded-[22px] border border-dashed border-rose-soft/50 bg-white/60 px-6 py-14 text-center">
      <p className="font-display text-[22px] font-light text-charcoal">{t('title')}</p>
      <p className="mx-auto mt-2 max-w-[42ch] text-[14px] text-ink-2">{t('body')}</p>
      <Link
        href="/#services"
        className="mt-5 inline-flex rounded-full border border-rose-soft/55 px-6 py-2.5 text-[13px] text-rose-deep transition-colors hover:border-rose-deep"
      >
        {t('action')}
      </Link>
    </div>
  );
}
