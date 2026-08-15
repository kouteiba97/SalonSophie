'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBooking } from '@/components/booking/BookingProvider';
import { cn } from '@/lib/utils';
import { ArrowRight } from './icons';

/**
 * Persistent "Réserver" bar, revealed after the hero scrolls away (BUILD_BRIEF §5.7 item 27).
 *
 * The design mutated `el.style` directly from a scroll handler on every frame. Here the handler
 * only flips a boolean when the threshold is actually crossed, so React re-renders once per
 * transition instead of on every scroll event.
 */
export function StickyCta() {
  const t = useTranslations('sticky');
  const { open, state } = useBooking();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 620);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={cn(
        // inset-x-0 + mx-auto centres without a physical left/right offset, so RTL needs no
        // special case (§8: logical properties only).
        'fixed inset-x-0 bottom-5 z-50 mx-auto w-fit transition-all duration-300 lg:hidden',
        visible && !state.isOpen
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-[150%] opacity-0',
      )}
    >
      <button
        type="button"
        onClick={open}
        // Hidden from assistive tech while off-screen: it is a duplicate of controls already
        // reachable in the header, so announcing it twice would only add noise.
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white shadow-[0_10px_30px_-8px_rgba(46,42,40,.45)] transition-colors hover:bg-rose-dark"
      >
        {t('book')}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
      </button>
    </div>
  );
}
