'use client';

import { useTranslations } from 'next-intl';
import { useBooking } from '../BookingProvider';
import { gownSizeLabel } from '@/data/bridal';
import { usePrice } from '@/lib/use-price';
import { cn } from '@/lib/utils';

/**
 * Step 1 — the service.
 *
 * The design flattened gowns into the service list, so "Location robe de mariée · 38 000 DA"
 * sat between a brushing and a facial and a click created an appointment for it (§5.3 item 10).
 * A rental is an interval over physical stock, not a point in time. Here gowns live in their own
 * group, and picking one books a *fitting* — the note under the group says so plainly.
 */
export function ServiceStep() {
  const t = useTranslations('booking');
  const tb = useTranslations('bridal');
  const { state, dispatch, catalogue } = useBooking();
  const price = usePrice();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] uppercase tracking-[.22em] text-taupe">{t('fitting')}</h3>
        <p className="text-[12px] leading-[1.65] text-taupe-2">{t('fittingNote')}</p>

        <div className="mt-1 flex flex-col gap-2">
          {catalogue.gowns.map((gown) => (
            <Row
              key={gown.slug}
              selected={state.gownSlug === gown.slug}
              onSelect={() => dispatch({ type: 'selectGown', slug: gown.slug })}
              name={gown.name}
              meta={`${tb('sizes', { range: gownSizeLabel(gown) })} · ${gown.tier}`}
              price={price(gown.rentalPrice)}
            />
          ))}
        </div>
      </section>

      {catalogue.categories.map((category) => {
        const services = catalogue.services.filter((s) => s.categorySlug === category.slug);
        if (services.length === 0) return null;
        return (
          <section key={category.slug} className="flex flex-col gap-2">
            <h3 className="text-[11px] uppercase tracking-[.22em] text-taupe">{category.name}</h3>
            <div className="flex flex-col gap-2">
              {services.map((service) => (
                <Row
                  key={service.slug}
                  selected={state.serviceSlug === service.slug}
                  onSelect={() => dispatch({ type: 'selectService', slug: service.slug })}
                  name={service.name}
                  meta={category.name}
                  price={price(service.price)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  selected,
  onSelect,
  name,
  meta,
  price,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  meta: string;
  price: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-4 rounded-[18px] border px-5 py-[15px] text-start transition-colors duration-200',
        selected ? 'border-rose-deep bg-tint' : 'border-rose-soft/40 bg-white hover:border-rose-deep/60',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] text-charcoal">{name}</span>
        <span className="truncate text-[12px] text-taupe-2">{meta}</span>
      </span>
      <span className="shrink-0 text-[14px] text-rose-deep">{price}</span>
    </button>
  );
}
