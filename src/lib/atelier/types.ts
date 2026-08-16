import type { Centimes } from '@/lib/money';
import type { GownState, GownTier } from '@/lib/supabase/types';
import type { DateRange } from './ranges';

/** The four states from §7. A gown in cleaning or repair neither earns nor books. */
export type { GownState, GownTier };

/** Four states again, and a different four: what a reservation is, not what a dress is. */
export type ReservationStatus = 'held' | 'confirmed' | 'returned' | 'cancelled';

/** The two that occupy the dress. Matches the exclusion constraint's WHERE clause exactly. */
export const OCCUPYING_STATUSES: readonly ReservationStatus[] = ['held', 'confirmed'];

export const occupies = (status: ReservationStatus): boolean =>
  OCCUPYING_STATUSES.includes(status);

export interface Reservation {
  id: string;
  reference: string;
  gownSlug: string;
  gownName: string;
  /** Half-open, and already including any cleaning days. */
  range: DateRange;
  cleaningBufferDays: number;
  status: ReservationStatus;
  /** Unknown until the salon sets a deposit policy (§6, open question 9). */
  depositAmount: Centimes | null;
  notes: string | null;
  client: {
    id: string;
    fullName: string;
    phone: string;
  };
  createdAt: string;
}

export interface GownStateChange {
  fromState: GownState | null;
  toState: GownState;
  reason: string | null;
  createdAt: string;
}
