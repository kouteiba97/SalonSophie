import { TODO_INSTAGRAM_HANDLES } from '@/lib/todo';

/**
 * One day of the trading week.
 *
 * Deliberately the same shape as the `business_hours` row and as `openingDay` in the management
 * schema: weekday 0 = Sunday .. 6 = Saturday, matching JS `getDay()`. One shape across the seed,
 * the database and the console editor means hours cannot mean one thing in the fallback and
 * another in Postgres.
 */
export interface OpeningDay {
  weekday: number;
  isClosed: boolean;
  /** "HH:MM" wall clock, Africa/Algiers. Null only when closed. */
  opensAt: string | null;
  closesAt: string | null;
}

/**
 * The business itself — BUILD_BRIEF §1.
 *
 * Three businesses share one address and one phone line. That single number is the real
 * communication channel in Algeria, so it is also the WhatsApp destination.
 */
export const BUSINESS = {
  name: 'The Sisters N&S',
  shortName: 'N&S',

  /**
   * The real line (§1). The design hardcoded +213 661 23 45 67 — sequential digits, a
   * placeholder. Never ship that number.
   */
  phone: '0553366712',
  phoneInternational: '+213553366712',
  whatsappNumber: '213553366712',

  address: {
    street: 'UV5, Nouvelle Ville Ali Mendjeli',
    landmark: 'À côté de l’école Cirta',
    city: 'Constantine',
    country: 'DZ',
    /**
     * Latitude/longitude are not known and are not guessed — a wrong pin sends a bride to the
     * wrong side of Ali Mendjeli. JSON-LD omits `geo` until surveyed.
     */
  },

  /**
   * The real trading week, given by the salon: open every day 09:30–17:00, closed Sunday.
   *
   * This was the single highest-leverage unknown in §6. Without it the availability engine could
   * not size or place a slot, so every booking fell back to `mode: 'request'` — a message the
   * salon had to chase. With it the same engine returns real slots for any service whose duration
   * is also known.
   *
   * Note the design was wrong in both directions, not just vague: it invented 09 h – 19 h and
   * hardcoded `d.getDay() === 5` to close Friday. The salon is open on Friday and closed on
   * Sunday, and closes two hours earlier than the mockup claimed. Anyone who had trusted the
   * prototype would have sent clients to a shut door on Sunday and turned them away on Friday.
   */
  openingHours: [
    { weekday: 0, isClosed: true, opensAt: null, closesAt: null }, // dimanche
    { weekday: 1, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
    { weekday: 2, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
    { weekday: 3, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
    { weekday: 4, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
    { weekday: 5, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
    { weekday: 6, isClosed: false, opensAt: '09:30', closesAt: '17:00' },
  ] satisfies OpeningDay[] as OpeningDay[],

  /** Unverified (§6). Rendered only once confirmed. */
  instagram: TODO_INSTAGRAM_HANDLES,
} as const;

export const whatsappLink = (message: string): string =>
  `https://wa.me/${BUSINESS.whatsappNumber}?text=${encodeURIComponent(message)}`;

/**
 * Booking horizon — §5.3 item 8. The design had none: every future date was bookable forever.
 * These are UI guards only; Phase 3 re-validates server-side inside a transaction, and the real
 * values are a business decision still to be confirmed.
 */
export const BOOKING_HORIZON = {
  /** Nothing bookable sooner than this. */
  minLeadTimeHours: 24,
  /** Nothing bookable further out than this. */
  maxAdvanceDays: 90,
} as const;
