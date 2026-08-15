'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useBooking } from '@/components/booking/BookingProvider';
import { ArrowRight, CalendarIcon, ChevronLeft, ChevronRight } from '@/components/common/icons';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { weekStrip } from '@/lib/availability/calendar';
import { cn } from '@/lib/utils';

/**
 * The floating card over the hero photograph: a 7-day strip that drops the client straight into
 * step 3 of the booking flow with the day already chosen.
 *
 * Dates are computed after mount rather than during render. The server runs in UTC and the
 * client in Africa/Algiers; deriving "today" on both sides would produce a hydration mismatch
 * for roughly an hour every night, and the wrong day highlighted is worse than a brief skeleton.
 */
export function HeroBookingCard() {
  const t = useTranslations('hero');
  const tb = useTranslations('booking');
  const locale = useLocale() as Locale;
  const { dispatch, state } = useBooking();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const days = useMemo(
    () => (mounted ? weekStrip(state.weekOffset) : []),
    [mounted, state.weekOffset],
  );

  const stripLabel = useMemo(() => {
    if (!mounted || days.length === 0) return '';
    return days[0].date.toLocaleDateString(INTL_TAG[locale], { month: 'long', year: 'numeric' });
  }, [mounted, days, locale]);

  const pickDay = (iso: string) => {
    dispatch({ type: 'selectDate', date: iso });
    dispatch({ type: 'open' });
    // Land on the date step so the choice made here is not thrown away.
    dispatch({ type: 'next' });
    dispatch({ type: 'next' });
  };

  return (
    <div className="absolute bottom-[clamp(34px,5vw,62px)] end-[clamp(14px,2vw,34px)] z-10 w-[min(340px,calc(100%-28px))] rounded-[26px] border border-white/25 bg-cream-warm/90 p-5 shadow-[0_24px_60px_-24px_rgba(46,42,40,.55)] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-deep/10 text-rose-deep">
          <CalendarIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-charcoal">{t('bookCard.title')}</p>
          <p className="truncate text-[12px] text-taupe-2">{t('bookCard.subtitle')}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[12px] capitalize text-ink-2">{stripLabel || ' '}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftWeek', by: -1 })}
            disabled={!mounted || state.weekOffset === 0}
            aria-label={tb('calendar.previousWeek')}
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:cursor-default disabled:opacity-35"
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftWeek', by: 1 })}
            disabled={!mounted}
            aria-label={tb('calendar.nextWeek')}
            className="grid size-7 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:opacity-35"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {!mounted
          ? Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-rose-soft/15" />
            ))
          : days.map((day) => {
              const selected = state.date === day.iso;
              const weekday = day.date.toLocaleDateString(INTL_TAG[locale], { weekday: 'narrow' });
              return (
                <button
                  key={day.iso}
                  type="button"
                  disabled={day.disabled}
                  aria-disabled={day.disabled}
                  aria-pressed={selected}
                  onClick={() => pickDay(day.iso)}
                  title={day.reason ? tb(`calendar.${day.reason}`) : undefined}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-0.5 rounded-[14px] border py-2 transition-all duration-200',
                    selected
                      ? 'border-rose-deep bg-rose-deep text-white'
                      : day.disabled
                        ? 'cursor-default border-transparent text-muted'
                        : 'border-rose-soft/40 bg-white text-charcoal hover:border-rose-deep',
                  )}
                >
                  <span className="text-[10px] opacity-70">{weekday}</span>
                  <span className="text-[14px]">{day.date.getDate()}</span>
                  {/* State is never colour-only: disabled days carry a readable reason (§5.4 item 16). */}
                  {day.disabled ? (
                    <span className="sr-only">{tb(`calendar.${day.reason ?? 'full'}`)}</span>
                  ) : null}
                </button>
              );
            })}
      </div>

      <p className="mt-3 text-[11px] leading-[1.6] text-taupe-2">
        {tb('calendar.availabilityPending')}
      </p>

      <button
        type="button"
        onClick={() => dispatch({ type: 'open' })}
        className="group mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-rose-deep px-5 py-3 text-[14px] text-white transition-colors hover:bg-rose-dark"
      >
        {t('chooseDateTime')}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
      </button>
    </div>
  );
}
