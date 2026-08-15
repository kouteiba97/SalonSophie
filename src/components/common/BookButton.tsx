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
      className={cn(
        'group inline-flex cursor-pointer items-center justify-center gap-2 rounded-full transition-colors duration-200',
        variant === 'solid' &&
          'bg-rose-deep px-6 py-3 text-[14px] text-white hover:bg-rose-dark',
        variant === 'ghost' &&
          'border border-rose-soft/55 px-6 py-3 text-[14px] text-ink-2 hover:border-rose-deep hover:text-rose-deep',
        variant === 'quiet' && 'text-[13px] text-rose-deep hover:text-rose-dark',
        className,
      )}
    >
      {label}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100" />
    </button>
  );
}
