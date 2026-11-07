'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBooking } from '../BookingProvider';
import { gownSizeLabel } from '@/data/bridal';
import { usePrice } from '@/lib/use-price';
import { cn } from '@/lib/utils';

const GOWNS = 'gowns';

/**
 * Step 1 — the service.
 *
 * The design flattened gowns into the service list, so "Location robe de mariée · 38 000 DA"
 * sat between a brushing and a facial and a click created an appointment for it (§5.3 item 10).
 * A rental is an interval over physical stock, not a point in time. Here gowns live in their own
 * group, and picking one books a *fitting* — the note under the group says so plainly.
 *
 * The full tariff is close to sixty rows — about six thousand pixels on a phone, which is where
 * nearly every client opens this. The pinned chips jump to a group rather than filter it out, so
 * the whole list stays one scroll away and nothing a client was comparing disappears.
 */
export function ServiceStep() {
  const t = useTranslations('booking');
  const tb = useTranslations('bridal');
  const { state, dispatch, catalogue } = useBooking();
  const price = usePrice();

  const groups = [
    { slug: GOWNS, name: t('fitting') },
    ...catalogue.categories.filter((c) => catalogue.services.some((s) => s.categorySlug === c.slug)),
  ];
  const selectedGroup = state.gownSlug
    ? GOWNS
    : catalogue.services.find((s) => s.slug === state.serviceSlug)?.categorySlug;

  const { barRef, sectionRef, active, jumpTo } = useGroupJump(groups[0].slug, selectedGroup);

  return (
    <div className="flex flex-col gap-5">
      <nav
        ref={barRef}
        aria-label={t('categoryNav')}
        // Pinned to the top of the modal's scroll area, so it is under the thumb at every depth.
        // `-top-5` cancels the body's `py-5`: sticky offsets are measured inside the scroller's
        // padding, so `top-0` would pin it 20px low and let the rows show through above it.
        className="sticky -top-5 z-10 -mx-6 -mt-5 border-b border-line bg-cream-warm px-6 py-3"
      >
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
          {groups.map((group) => (
            <button
              key={group.slug}
              type="button"
              data-group={group.slug}
              onClick={() => jumpTo(group.slug)}
              aria-current={active === group.slug ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border px-[18px] text-[13px] tracking-[.03em] transition-all duration-200',
                active === group.slug
                  ? 'border-rose-deep bg-rose-deep text-white'
                  : 'border-rose-soft/55 bg-white text-ink-2 hover:border-rose-deep hover:text-rose-deep',
              )}
            >
              {group.name}
            </button>
          ))}
        </div>
      </nav>

      <section ref={sectionRef(GOWNS)} className="flex flex-col gap-2">
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
          <section key={category.slug} ref={sectionRef(category.slug)} className="flex flex-col gap-2">
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

/**
 * Keeps the chips and the list in step: a tap scrolls the modal body to the group, and scrolling
 * by hand moves the highlight. The scroll container is the modal body, not the window — the
 * page underneath is scroll-locked while the dialog is open.
 */
function useGroupJump(first: string, selected: string | undefined) {
  const barRef = useRef<HTMLElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState(selected ?? first);
  // A tap sets the highlight at once; the smooth scroll that follows passes over other groups
  // and must not drag the highlight through each of them on the way.
  const lockedUntil = useRef(0);

  const scroller = () => barRef.current?.closest<HTMLElement>('[data-booking-scroll]') ?? null;

  const sectionRef = useCallback(
    (slug: string) => (node: HTMLElement | null) => {
      if (node) sections.current.set(slug, node);
      else sections.current.delete(slug);
    },
    [],
  );

  const scrollTopFor = (container: HTMLElement, slug: string) => {
    const section = sections.current.get(slug);
    if (!section) return null;
    const offset = section.getBoundingClientRect().top - container.getBoundingClientRect().top;
    return container.scrollTop + offset - (barRef.current?.offsetHeight ?? 0) - 12;
  };

  const jumpTo = (slug: string) => {
    const container = scroller();
    if (!container) return;
    const top = scrollTopFor(container, slug);
    if (top === null) return;
    setActive(slug);
    lockedUntil.current = Date.now() + 800;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  };

  // Reopened on a chosen service — from a service page's "Réserver", or coming back from step
  // 2 — the list starts at that service's group instead of making her find it again.
  useEffect(() => {
    if (!selected || selected === first) return;
    const container = scroller();
    const top = container ? scrollTopFor(container, selected) : null;
    if (container && top !== null) container.scrollTop = Math.max(0, top);
    // Mount only: later selections happen where the client already is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = scroller();
    if (!container) return;
    const onScroll = () => {
      if (Date.now() < lockedUntil.current) return;
      const line = container.getBoundingClientRect().top + (barRef.current?.offsetHeight ?? 0) + 24;
      // The lowest group whose heading has passed the line — by position, not map order.
      let current = first;
      let best = -Infinity;
      for (const [slug, section] of sections.current) {
        const top = section.getBoundingClientRect().top;
        if (top <= line && top > best) {
          best = top;
          current = slug;
        }
      }
      setActive(current);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [first]);

  // Keep the highlighted chip visible in its own row as the list scrolls past it.
  useEffect(() => {
    const chip = barRef.current?.querySelector<HTMLElement>(`[data-group="${active}"]`);
    const row = chip?.parentElement;
    if (!chip || !row) return;
    const chipBox = chip.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (chipBox.left < rowBox.left || chipBox.right > rowBox.right) {
      row.scrollBy({ left: chipBox.left - rowBox.left - (rowBox.width - chipBox.width) / 2 });
    }
  }, [active]);

  return { barRef, sectionRef, active, jumpTo };
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
