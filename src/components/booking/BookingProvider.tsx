'use client';

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { Gown, Service, ServiceCategory } from '@/data/types';
import {
  bookingReducer,
  canAdvance,
  initialBookingState,
  type BookingAction,
  type BookingState,
} from './booking-reducer';

/**
 * The catalogue the booking flow offers, handed down from the server.
 *
 * The modal is a client component but the catalogue is a server read (database, or the committed
 * seed when none is configured), so it arrives as a prop rather than being imported. That keeps
 * one source of truth: the step 1 list cannot drift from the tariff on the page behind it.
 */
export interface BookingCatalogue {
  categories: ServiceCategory[];
  services: Service[];
  gowns: Gown[];
}

interface BookingContextValue {
  state: BookingState;
  dispatch: (action: BookingAction) => void;
  canAdvance: boolean;
  catalogue: BookingCatalogue;
  /** Opens at step 2 with a service preselected — used by every "Réserver" button on a card. */
  openWithService: (slug: string) => void;
  /** Opens at step 2 with a gown preselected. Books a fitting, never a rental. */
  openWithGown: (slug: string) => void;
  open: () => void;
  close: () => void;
  /** Returns focus to whatever opened the modal. See the note below. */
  restoreFocus: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

const OPENING_ACTIONS = new Set(['open', 'openWithService', 'openWithGown']);

export function BookingProvider({
  children,
  catalogue,
}: {
  children: ReactNode;
  catalogue: BookingCatalogue;
}) {
  const [state, rawDispatch] = useReducer(bookingReducer, initialBookingState);

  /**
   * Whatever had focus when the modal opened.
   *
   * Radix restores focus by calling `context.triggerRef.current?.focus()` and preventing the
   * FocusScope default. That ref is only populated by `<Dialog.Trigger>`, and this modal is
   * opened programmatically from a dozen different buttons — a card's "Réserver", the hero, the
   * sticky bar — so the ref is always null and focus was landing on <body>. Verified in the
   * browser, then covered by the Playwright focus-restore test.
   */
  const openerRef = useRef<HTMLElement | null>(null);

  // Wrapping dispatch (rather than only the helpers) means every call site is covered,
  // including the ones that dispatch `open` directly.
  const dispatch = useCallback((action: BookingAction) => {
    if (OPENING_ACTIONS.has(action.type) && typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        openerRef.current = active;
      }
    }
    rawDispatch(action);
  }, []);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    if (opener && document.contains(opener)) opener.focus();
  }, []);

  const value = useMemo<BookingContextValue>(
    () => ({
      state,
      dispatch,
      canAdvance: canAdvance(state),
      catalogue,
      openWithService: (slug) => dispatch({ type: 'openWithService', slug }),
      openWithGown: (slug) => dispatch({ type: 'openWithGown', slug }),
      open: () => dispatch({ type: 'open' }),
      close: () => dispatch({ type: 'close' }),
      restoreFocus,
    }),
    [state, dispatch, restoreFocus, catalogue],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used inside <BookingProvider>');
  return context;
}
