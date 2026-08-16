import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ReservationStatus } from '@/lib/atelier/types';
import type { GownState } from '@/lib/supabase/types';

/**
 * The two four-state vocabularies, kept visually distinct.
 *
 * A gown's state describes the dress; a reservation's status describes an agreement about it.
 * They are different questions with the same arity, and conflating them is how "returned" ends
 * up meaning "available" on a dress that is still at the cleaner's.
 *
 * Colour is never the only signal — each badge carries its own word, so the distinction survives
 * a monochrome print-out and a colour-blind reader (§12.8).
 */

const GOWN_STATE_STYLES: Record<GownState, string> = {
  available: 'border-rose-soft/55 bg-tint text-rose-deep',
  rented: 'border-champagne/70 bg-champagne-3 text-taupe-2',
  cleaning: 'border-muted-2 bg-cream text-taupe-2',
  repair: 'border-rose-dark/40 bg-blush-6 text-rose-dark',
};

export function GownStateBadge({ state, className }: { state: GownState; className?: string }) {
  const t = useTranslations('atelier.states');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[.14em]',
        GOWN_STATE_STYLES[state],
        className,
      )}
    >
      {t(state)}
    </span>
  );
}

const RESERVATION_STATUS_STYLES: Record<ReservationStatus, string> = {
  held: 'border-champagne/70 bg-champagne-3 text-taupe-2',
  confirmed: 'border-rose-soft/55 bg-blush-6 text-rose-deep',
  returned: 'border-muted-2 bg-cream text-taupe-2',
  cancelled: 'border-line bg-white text-muted-3',
};

export function ReservationStatusBadge({
  status,
  className,
}: {
  status: ReservationStatus;
  className?: string;
}) {
  const t = useTranslations('atelier.reservationStatus');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[.14em]',
        RESERVATION_STATUS_STYLES[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
