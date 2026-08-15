import type { IsoDate } from '@/lib/datetime';

/**
 * The booking flow owns its own reducer (BUILD_BRIEF §5.2 item 4).
 *
 * The design kept everything in one mega-state object shared with the language, the category
 * filter, the search box and the tariff accordion:
 *   {lang, cat, open, step, svc, expert, date, time, nm, ph, nt, mOff, wOff, q, grp}
 * Locale is now a URL segment, filter and search are query params, and the free-text fields
 * belong to React Hook Form. What is left here is genuinely the booking flow's own state.
 */

export const STEPS = ['service', 'expert', 'date', 'details', 'done'] as const;
export type StepName = (typeof STEPS)[number];
export const STEP_COUNT = STEPS.length;

/**
 * A gown in the booking flow schedules a *fitting appointment*, never a rental (§5.3 item 10).
 * Rentals are date ranges over physical stock and live in their own table and flow; conflating
 * them is how a gown ends up promised to two brides.
 */
export type BookingKind = 'service' | 'fitting';

export interface BookingState {
  isOpen: boolean;
  step: number;
  kind: BookingKind;
  serviceSlug: string | null;
  gownSlug: string | null;
  expertSlug: string | null;
  date: IsoDate | null;
  time: string | null;
  /** Month offset for the desktop 42-cell grid. */
  monthOffset: number;
  /** Week offset for the mobile 7-day strip. */
  weekOffset: number;

  /** In flight between pressing confirm and the server answering. */
  submitting: boolean;
  /** What the server decided. The client never invents a reference. */
  result: {
    reference: string;
    isRequest: boolean;
    notified: boolean;
  } | null;
  /** Set when the server refused; keyed so the UI can translate it. */
  error: 'slot_taken' | 'rate_limited' | 'invalid' | 'unavailable' | null;
}

export const initialBookingState: BookingState = {
  isOpen: false,
  step: 0,
  kind: 'service',
  serviceSlug: null,
  gownSlug: null,
  expertSlug: null,
  date: null,
  time: null,
  monthOffset: 0,
  weekOffset: 0,
  submitting: false,
  result: null,
  error: null,
};

export type BookingAction =
  | { type: 'open' }
  | { type: 'openWithService'; slug: string }
  | { type: 'openWithGown'; slug: string }
  | { type: 'close' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'selectService'; slug: string }
  | { type: 'selectGown'; slug: string }
  | { type: 'selectExpert'; slug: string }
  | { type: 'selectDate'; date: IsoDate }
  | { type: 'selectTime'; time: string }
  | { type: 'shiftMonth'; by: number }
  | { type: 'shiftWeek'; by: number }
  | { type: 'submitStart' }
  | { type: 'submitSuccess'; reference: string; isRequest: boolean; notified: boolean }
  | { type: 'submitError'; error: NonNullable<BookingState['error']> }
  | { type: 'reset' };

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case 'open':
      return { ...state, isOpen: true, step: 0, error: null };

    case 'openWithService':
      return {
        ...state,
        isOpen: true,
        step: 1,
        kind: 'service',
        serviceSlug: action.slug,
        gownSlug: null,
      };

    case 'openWithGown':
      return {
        ...state,
        isOpen: true,
        step: 1,
        kind: 'fitting',
        gownSlug: action.slug,
        serviceSlug: null,
      };

    case 'close':
      return { ...state, isOpen: false };

    case 'next':
      return canAdvance(state) ? { ...state, step: Math.min(STEP_COUNT - 1, state.step + 1) } : state;

    case 'back':
      return { ...state, step: Math.max(0, state.step - 1) };

    case 'selectService':
      return { ...state, kind: 'service', serviceSlug: action.slug, gownSlug: null };

    case 'selectGown':
      return { ...state, kind: 'fitting', gownSlug: action.slug, serviceSlug: null };

    case 'selectExpert':
      return { ...state, expertSlug: action.slug };

    // Changing the day invalidates the slot that was picked under the old one.
    case 'selectDate':
      return { ...state, date: action.date, time: null };

    case 'selectTime':
      return { ...state, time: action.time };

    case 'shiftMonth':
      return { ...state, monthOffset: state.monthOffset + action.by };

    // The strip never pages into the past.
    case 'shiftWeek':
      return { ...state, weekOffset: Math.max(0, state.weekOffset + action.by) };

    case 'submitStart':
      return { ...state, submitting: true, error: null };

    case 'submitSuccess':
      return {
        ...state,
        submitting: false,
        error: null,
        result: {
          reference: action.reference,
          isRequest: action.isRequest,
          notified: action.notified,
        },
        step: STEP_COUNT - 1,
      };

    /*
     * A taken slot sends the client back to the date step, because that is the only place the
     * problem can be fixed. Every other error keeps them on the form with their details intact.
     */
    case 'submitError':
      return {
        ...state,
        submitting: false,
        error: action.error,
        step: action.error === 'slot_taken' ? 2 : state.step,
        time: action.error === 'slot_taken' ? null : state.time,
      };

    case 'reset':
      return initialBookingState;
  }
}

/** Whether the current step is satisfied. Step 3 is gated by the form's own Zod validation. */
export function canAdvance(state: BookingState): boolean {
  switch (state.step) {
    case 0:
      return state.serviceSlug !== null || state.gownSlug !== null;
    case 1:
      return state.expertSlug !== null;
    case 2:
      return state.date !== null && state.time !== null;
    default:
      return true;
  }
}
