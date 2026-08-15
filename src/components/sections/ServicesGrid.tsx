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

        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-8 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,286px),1fr))]">
            {visible.map((service) => {
              const categoryName = categories.find((c) => c.slug === service.categorySlug)?.name;
              return (
                <article
                  key={service.slug}
                  className="flex flex-col gap-3 rounded-[22px] border border-rose-soft/30 bg-white p-5 transition-colors duration-200 hover:border-rose-deep/45"
                >
                  <p className="text-[10px] uppercase tracking-[.22em] text-taupe">{categoryName}</p>

                  <h3 className="font-display text-[21px] font-light leading-tight text-charcoal">
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

                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3.5">
                    <div className="flex flex-col">
                      <span className="text-[17px] text-rose-deep">{price(service.price)}</span>
                      {/* Durations are unknown for every service (§6) — an em dash, never a guess. */}
                      <span className="text-[12px] text-muted">{duration(service.duration)}</span>
                    </div>
                    <BookButton
                      label={t('book')}
                      serviceSlug={service.slug}
                      variant="quiet"
                      className="pb-0.5"
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
