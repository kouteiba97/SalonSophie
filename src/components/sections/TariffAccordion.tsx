'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Search } from '@/components/common/icons';
import { BRIDAL_PACKAGES, gownSizeLabel } from '@/data/bridal';
import type { Gown, Service, ServiceCategory } from '@/data/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { usePrice, useDuration } from '@/lib/use-price';

interface TariffAccordionProps {
  categories: ServiceCategory[];
  services: Service[];
  gowns: Gown[];
}

interface Row {
  key: string;
  name: string;
  meta: string;
  price: string;
}

/**
 * The full published tariff — BUILD_BRIEF §6.
 *
 * Search is debounced 250 ms (§5.2 item 5; the design ran a full re-filter on every keystroke)
 * and mirrored into `?q=` so a result set can be linked. The input stays controlled locally so
 * typing never waits on a navigation.
 */
export function TariffAccordion({ categories, services, gowns }: TariffAccordionProps) {
  const t = useTranslations('tarifs');
  const tb = useTranslations('bridal');
  const price = usePrice();
  const duration = useDuration();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchId = useId();

  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [openGroup, setOpenGroup] = useState<string | null>('coiffure');

  // Debounce the URL write, not the filtering — results feel instant, history stays clean.
  useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (query.trim()) params.set('q', query.trim());
      else params.delete('q');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}#tarifs`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, urlQuery, pathname, router, searchParams]);

  const needle = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const serviceGroups = categories.map((category) => ({
      key: category.slug,
      label: category.name,
      rows: services.filter((s) => s.categorySlug === category.slug).map<Row>((s) => ({
        key: s.slug,
        name: s.name,
        meta: duration(s.duration),
        price: price(s.price),
      })),
    }));

    const bridalRows: Row[] = [
      ...gowns.map<Row>((g) => ({
        key: `gown-${g.slug}`,
        name: `${tb('detail.rental')} · ${g.name}`,
        meta: `${tb('sizes', { range: gownSizeLabel(g) })} · ${g.tier}`,
        price: price(g.rentalPrice),
      })),
      ...BRIDAL_PACKAGES.map<Row>((p) => ({
        key: `pack-${p.slug}`,
        name: p.name,
        meta: tb('packages.detailsOnRequest'),
        price: price(p.price),
      })),
    ];

    return [...serviceGroups, { key: 'mariee', label: tb('eyebrow'), rows: bridalRows }]
      .map((group) => ({
        ...group,
        rows: needle
          ? group.rows.filter((r) => `${r.name} ${r.meta}`.toLowerCase().includes(needle))
          : group.rows,
      }))
      .filter((group) => group.rows.length > 0);
  }, [needle, price, duration, tb, categories, services, gowns]);

  return (
    <section
      id="tarifs"
      className="border-y border-rose-soft/20 bg-cream-warm px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,104px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[52ch] flex-col gap-3">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-[.28em] text-taupe">
              <span aria-hidden className="text-champagne">
                ✦
              </span>
              {t('eyebrow')}
            </p>
            <h2 className="font-display text-[clamp(30px,4.4vw,52px)] font-light leading-[1.06] tracking-[-.015em] text-charcoal">
              {t('title')}{' '}
              <span className="font-script text-[1.16em] font-normal leading-none text-rose-deep">
                {t('titleAccent')}
              </span>
            </h2>
          </div>

          <label
            htmlFor={searchId}
            className="flex w-full max-w-[320px] items-center gap-2.5 rounded-full border border-rose-soft/45 bg-white px-4 py-2.5 focus-within:border-rose-deep"
          >
            <Search className="size-4 shrink-0 text-taupe" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-transparent text-[14px] text-charcoal outline-none placeholder:text-muted"
            />
          </label>
        </div>

        {groups.length === 0 ? (
          <div className="mt-9 rounded-[22px] border border-dashed border-rose-soft/50 bg-white/60 px-6 py-14 text-center">
            <p className="font-display text-[22px] font-light text-charcoal">{t('empty.title')}</p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[14px] text-ink-2">{t('empty.body')}</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-5 cursor-pointer rounded-full border border-rose-soft/55 px-6 py-2.5 text-[13px] text-rose-deep transition-colors hover:border-rose-deep"
            >
              {t('empty.action')}
            </button>
          </div>
        ) : (
          <div className="mt-9 flex flex-col gap-2.5">
            {groups.map((group) => {
              // While searching, every matching group is open — hunting through collapsed
              // panels for your own search results is the classic accordion mistake.
              const expanded = needle ? true : openGroup === group.key;
              const panelId = `tarif-panel-${group.key}`;
              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-[18px] border border-rose-soft/30 bg-white"
                >
                  <h3>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setOpenGroup(expanded && !needle ? null : group.key)}
                      className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-start transition-colors hover:bg-tint/45"
                    >
                      <span className="flex-1 text-[15px] text-charcoal">{group.label}</span>
                      <span className="text-[12px] text-taupe">
                        {t('count', { count: group.rows.length })}
                      </span>
                      {expanded ? (
                        <ChevronUp className="size-4 text-taupe" />
                      ) : (
                        <ChevronDown className="size-4 text-taupe" />
                      )}
                    </button>
                  </h3>

                  {expanded ? (
                    <div id={panelId} className="border-t border-line px-5 pb-4 pt-1">
                      {group.rows.map((row) => (
                        <div
                          key={row.key}
                          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/70 py-3 last:border-0"
                        >
                          <span className="text-[14px] text-charcoal">{row.name}</span>
                          <span aria-hidden className="hidden flex-1 border-b border-dotted border-muted-2 sm:block" />
                          <span className="text-[12px] text-muted">{row.meta}</span>
                          <span className="text-[14px] text-rose-deep">{row.price}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-[12px] leading-[1.7] text-taupe-2">{t('note')}</p>
      </div>
    </section>
  );
}
