import type { Locale } from '@/i18n/routing';

/**
 * The notification port — BUILD_BRIEF §10.
 *
 * "API approval may take weeks. The entire core — bookings, gowns, clients — must work with zero
 * social integration. Build these behind an adapter interface with a manual fallback so nothing
 * blocks on Meta approval."
 *
 * So nothing in the booking flow imports WhatsApp. It depends on this interface, and which
 * implementation is wired in is an environment decision. A failure to notify must never fail a
 * booking: the appointment is already committed by the time we get here, and a client who is in
 * the book but did not get a message is recoverable — the reverse is not.
 */

export type NotificationKind = 'booking_confirmation' | 'reminder_24h' | 'reminder_2h';

export interface BookingNotification {
  kind: NotificationKind;
  /** International format, e.g. 213553366712. */
  toPhone: string;
  clientName: string;
  reference: string;
  locale: Locale;
  /** Human-readable summary of what was booked. */
  summary: string;
  /** Absent for a request, which has no confirmed time yet. */
  startsAt: Date | null;
  /** True when the appointment is a request awaiting manual confirmation. */
  isRequest: boolean;
}

export interface DeliveryResult {
  delivered: boolean;
  /** Which implementation handled it, for the audit trail and for debugging. */
  via: 'whatsapp_cloud' | 'manual';
  /** Provider message id, when there is one. */
  externalId?: string;
  error?: string;
}

export interface NotificationPort {
  send(notification: BookingNotification): Promise<DeliveryResult>;
  /**
   * Queues the 24h and 2h reminders. Phase 5 gives this a real scheduler; until then the manual
   * adapter records the intent so reception can see what should go out.
   */
  scheduleReminders(notification: BookingNotification): Promise<void>;
}
