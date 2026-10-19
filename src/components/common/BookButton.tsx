'use client';

import { useBooking } from '@/components/booking/BookingProvider';
import { cn } from '@/lib/utils';
import { ArrowRight } from './icons';

interface BookButtonProps {
  label: string;
  serviceSlug?: string;
  gownSlug?: string;
  variant?: 'solid' | 'ghost' | 'quiet';
  className?: string;
  /** Applied to the label span, so a caller can hide the word and keep the arrow. */
  labelClassName?: string;
}

/**
 * The one control that opens the booking flow. Kept tiny and client-side so every section around
 * it can stay a Server Component (§ conventions: 'use client' only where interaction requires it).
 */
export function BookButton({
  label,
  serviceSlug,
  gownSlug,
  variant = 'solid',
  className,
  labelClassName,
}: BookButtonProps) {
  const { open, openWithService, openWithGown } = useBooking();

  const handleClick = () => {
    if (serviceSlug) return openWithService(serviceSlug);
    if (gownSlug) return openWithGown(gownSlug);
    open();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={cn(
        'group inline-flex cursor-pointer items-center justify-center gap-2 rounded-full transition-colors duration-200',
        /*
          `min-h-11` on the two filled variants, because padding alone kept missing the floor.
          
          `py-3` at 14px renders 43px — one pixel short — and the header overrides the padding to
          `px-5 py-2`, which renders 37px. That is the most-tapped control on the site sitting
          seven pixels under the minimum on the device nearly every client uses. A height floor
          holds regardless of what padding a caller passes; `quiet` is left alone, since it is an
          inline text control inside rows that already give it room.
        */
        variant === 'solid' &&
          'min-h-11 bg-rose-deep px-6 py-3 text-[14px] text-white hover:bg-rose-dark',
        variant === 'ghost' &&
          'min-h-11 border border-rose-soft/55 px-6 py-3 text-[14px] text-ink-2 hover:border-rose-deep hover:text-rose-deep',
        variant === 'quiet' && 'text-[13px] text-rose-deep hover:text-rose-dark',
        className,
      )}
    >
      {/*
        `labelClassName` exists for the tariff rows, where the word "Réserver" repeats twenty-four
        times down a 375px screen and pushes service names onto a second line. There it is hidden
        below `sm` and the arrow carries the affordance; `aria-label` keeps the button named for
        anyone not reading the glyph.
      */}
      <span className={labelClassName}>{label}</span>
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100" />
    </button>
  );
}
