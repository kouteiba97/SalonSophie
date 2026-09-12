'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useBooking } from '../BookingProvider';
import { ChevronLeft, ChevronRight } from '@/components/common/icons';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { PROVISIONAL_SLOTS, monthGrid, monthOf, weekStrip } from '@/lib/availability/calendar';
import { fetchAvailability } from '@/app/actions/availability';
import type { DayAvailability } from '@/lib/availability/engine';
import { NO_PREFERENCE } from '@/data/team';
import { formatLongDate, formatMonthYear, fromIsoDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

/**
 * Step 3 — date and time. Both calendar views from the design are kept: the 42-cell month grid
 * on desktop, the paged 7-day strip on mobile (§9).
 *
 * Every cell is a real `<button>` carrying `aria-pressed`, and a disabled day states *why* in
 * text rather than relying on grey and a strikethrough (§5.4 items 15, 16).
 *
 * The design's `hash(iso)%11===0` marked one day in eleven as full and `hash(iso+t)%4===0`
 * struck out a quarter of the slots, deterministically and with no basis — a client could be
 * turned away from an empty Tuesday. All of it is gone; see lib/availability/calendar.ts.
 *
 * What replaced it is the real engine, asked once a date is picked. Until durations and opening
 * hours existed it had nothing to work with and every day came back in request mode, so this step
 * showed seven fixed times and said so. Both are still here and still correct when the answer is
 * genuinely unknown — a service with no duration, or a database that cannot be reached. The
 * difference is that the request path is now the fallback rather than the only path.
 */
export function DateStep() {
  const t = useTranslations('booking.calendar');
  const locale = useLocale() as Locale;
  const { state, dispatch } = useBooking();

  /*
   * Slots for the chosen day. `null` means "not asked yet or could not answer", which renders
   * the provisional list — the same thing a client saw before any of this existed.
   */
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [loading, startLoading] = useTransition();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cells = useMemo(() => (mounted ? monthGrid(state.monthOffset) : []), [mounted, state.monthOffset]);
  const strip = useMemo(() => (mounted ? weekStrip(state.weekOffset) : []), [mounted, state.weekOffset]);
  const monthLabel = useMemo(
    () => (mounted ? formatMonthYear(monthOf(state.monthOffset), locale) : ''),
    [mounted, state.monthOffset, locale],
  );

  /*
   * Asked per selected day rather than per month: one day is one round trip on a phone on
   * Algerian 4G, where a month of slots is a payload nobody looks at. The expert matters as much
   * as the date — Nour's Tuesday is not Sophie's — so changing either re-asks.
   */
  useEffect(() => {
    if (!state.date || !state.serviceSlug) {
      setDay(null);
      return;
    }
    let current = true;
    const date = state.date;
    const serviceSlug = state.serviceSlug;
    const staffSlug =
      !state.expertSlug || state.expertSlug === NO_PREFERENCE ? null : state.expertSlug;

    startLoading(async () => {
      const result = await fetchAvailability({ serviceSlug, staffSlug, fromIso: date, days: 1 });
      if (!current) return;
      setDay(result.status === 'ok' ? (result.days[0] ?? null) : null);
    });

    return () => {
      current = false;
    };
  }, [state.date, state.serviceSlug, state.expertSlug]);

  const computed = day?.mode === 'computed' ? day : null;
  /*
   * A day the engine ruled out entirely — closed, past, beyond the booking horizon, or the
   * chosen expert is away. This is a real answer and must not fall through to the provisional
   * list: offering seven bookable-looking times on a Friday the salon is shut is worse than the
   * placeholder it replaced, because it looks like availability rather than a placeholder.
   */
  const unavailable = day?.mode === 'unavailable' ? day : null;
  const slotTimes = computed ? computed.slots.map((slot) => slot.time) : PROVISIONAL_SLOTS;
  /** Only claim real availability when the engine actually answered — either way. */
  const isReal = computed !== null || unavailable !== null;
  const emptyReason = unavailable?.reason ?? (computed && computed.slots.length === 0 ? (computed.reason ?? 'full') : null);

  const weekdays = t.raw('weekdays') as string[];
  const weekdaysFull = t.raw('weekdaysFull') as string[];

  const dateLabel = state.date ? formatLongDate(fromIsoDate(state.date), locale) : t('chooseDateFirst');

  return (
    <div className="flex flex-col gap-5">
      {/* ── Desktop: 42-cell month grid ─────────────────────────────────────────────── */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftMonth', by: -1 })}
            aria-label={t('previousMonth')}
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" />
          </button>
          <span className="text-[14px] capitalize text-charcoal">{monthLabel || ' '}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftMonth', by: 1 })}
            aria-label={t('nextMonth')}
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1" role="grid" aria-label={t('label')}>
          {weekdays.map((day, i) => (
            <span
              key={`${day}-${i}`}
              aria-hidden
              className="grid place-items-center py-1 text-[11px] text-taupe"
            >
              {day}
            </span>
          ))}

          {!mounted
            ? Array.from({ length: 42 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-full bg-rose-soft/12" />
              ))
            : cells.map((cell, i) => {
                const selected = state.date === cell.iso && !cell.disabled;
                const reason = cell.reason ? t(cell.reason) : null;
                return (
                  <button
                    key={`${cell.iso}-${i}`}
                    type="button"
                    disabled={cell.disabled}
                    aria-disabled={cell.disabled}
                    aria-pressed={selected}
                    aria-label={
                      `${cell.date.getDate()} ${weekdaysFull[cell.date.getDay()]}` +
                      (reason ? ` — ${reason}` : '')
                    }
                    onClick={() => dispatch({ type: 'selectDate', date: cell.iso })}
                    className={cn(
                      'grid aspect-square cursor-pointer place-items-center rounded-full text-[13px] transition-colors duration-200',
                      cell.outsideMonth && 'text-muted-2',
                      !cell.outsideMonth && cell.disabled && 'cursor-default text-muted',
                      !cell.disabled && 'text-charcoal hover:bg-tint',
                      selected && 'bg-rose-deep text-white hover:bg-rose-deep',
                    )}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
        </div>
      </div>

      {/* ── Mobile: paged 7-day strip ───────────────────────────────────────────────── */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftWeek', by: -1 })}
            disabled={state.weekOffset === 0}
            aria-label={t('previousWeek')}
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 disabled:opacity-35"
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" />
          </button>
          <span className="text-[13px] capitalize text-charcoal">
            {mounted && strip.length > 0
              ? strip[0].date.toLocaleDateString(INTL_TAG[locale], { month: 'long', year: 'numeric' })
              : ' '}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'shiftWeek', by: 1 })}
            aria-label={t('nextWeek')}
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {strip.map((day) => {
            const selected = state.date === day.iso && !day.disabled;
            const reason = day.reason ? t(day.reason) : null;
            return (
              <button
                key={day.iso}
                type="button"
                disabled={day.disabled}
                aria-disabled={day.disabled}
                aria-pressed={selected}
                aria-label={
                  `${day.date.getDate()} ${weekdaysFull[day.date.getDay()]}` +
                  (reason ? ` — ${reason}` : '')
                }
                onClick={() => dispatch({ type: 'selectDate', date: day.iso })}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-0.5 rounded-[14px] border py-2 transition-colors duration-200',
                  selected
                    ? 'border-rose-deep bg-rose-deep text-white'
                    : day.disabled
                      ? 'cursor-default border-transparent text-muted'
                      : 'border-rose-soft/40 bg-white text-charcoal',
                )}
              >
                <span className="text-[10px] opacity-70">
                  {day.date.toLocaleDateString(INTL_TAG[locale], { weekday: 'narrow' })}
                </span>
                <span className="text-[14px]">{day.date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Times ───────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <p className="text-[12px] text-taupe">{t('slotsFor', { date: dateLabel })}</p>

        {!state.date ? (
          <p className="text-[13px] text-muted">{t('chooseDateFirst')}</p>
        ) : loading ? (
          <p className="text-[13px] text-muted" role="status">
            {t('loadingSlots')}
          </p>
        ) : emptyReason ? (
          /*
           * Nothing free, and the engine said why. Saying which of "closed", "fully booked" or
           * "she is away" applies is the difference between a client trying the next day and a
           * client assuming the salon is broken — the same rule the disabled day cells follow
           * (§5.4 item 16: never colour and a strikethrough alone).
           */
          <p className="text-[13px] text-charcoal" role="status">
            {t(`empty.${emptyReason}` as 'empty.full')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slotTimes.map((slot) => {
              const selected = state.time === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => dispatch({ type: 'selectTime', time: slot })}
                  aria-pressed={selected}
                  className={cn(
                    'cursor-pointer rounded-[12px] border px-4 py-2.5 text-[14px] transition-colors duration-200',
                    selected
                      ? 'border-rose-deep bg-rose-deep text-white'
                      : 'border-rose-soft/50 bg-white text-charcoal hover:border-rose-deep',
                  )}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        )}

        {/*
          * Shown only when the times above are not real. Leaving it up once they are would tell a
          * client her confirmed slot is a wish — and the reverse, dropping it while the engine
          * cannot answer, would promise a booking nobody is holding.
          */}
        {!isReal ? (
          <p className="text-[11px] leading-[1.65] text-taupe-2">{t('availabilityPending')}</p>
        ) : null}
      </div>
    </div>
  );
}
