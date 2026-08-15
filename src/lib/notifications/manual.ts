import type { BookingNotification, DeliveryResult, NotificationPort } from './port';

/**
 * The fallback that keeps the business running without Meta.
 *
 * It does not pretend to have sent anything — `delivered: false`, `via: 'manual'` — because a
 * confirmation screen that claims a message was sent when none was is worse than one that hands
 * the client a WhatsApp link. The record exists so reception can work the list by hand, which is
 * exactly how the salon operates today.
 *
 * Phase 6 writes these into `conversations`/`messages` so the unanswered-message KPI counts them.
 */
export class ManualNotifier implements NotificationPort {
  async send(notification: BookingNotification): Promise<DeliveryResult> {
    console.info(
      `[N&S] notification pending manual send — ${notification.kind} to ${notification.toPhone}` +
        ` (ref ${notification.reference}${notification.isRequest ? ', request' : ''})`,
    );
    return { delivered: false, via: 'manual' };
  }

  async scheduleReminders(notification: BookingNotification): Promise<void> {
    // A request has no confirmed time, so there is nothing to remind against yet.
    if (notification.isRequest || !notification.startsAt) return;
    console.info(
      `[N&S] reminders due for ref ${notification.reference}:` +
        ` 24h and 2h before ${notification.startsAt.toISOString()}`,
    );
  }
}
