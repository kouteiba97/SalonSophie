import { TODO_INSTAGRAM_HANDLES, TODO_OPENING_HOURS } from '@/lib/todo';

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

  /** Unknown (§6). The design invented "Samedi – Jeudi, 09 h 00 – 19 h 00 / Vendredi Fermé". */
  openingHours: TODO_OPENING_HOURS,

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
