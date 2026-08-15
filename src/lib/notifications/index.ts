import 'server-only';
import { ManualNotifier } from './manual';
import { WhatsAppCloudNotifier } from './whatsapp';
import type { NotificationPort } from './port';

export type { BookingNotification, DeliveryResult, NotificationPort } from './port';

/**
 * Picks the adapter from the environment.
 *
 * With no Meta credentials the manual adapter runs, and the booking flow behaves identically —
 * the client still gets a WhatsApp hand-off link on the confirmation screen, and reception has a
 * record of what should be sent. That is the §10 requirement: the core works with zero social
 * integration.
 */
let cached: NotificationPort | null = null;

export function getNotifier(): NotificationPort {
  if (cached) return cached;

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  cached = token && phoneNumberId
    ? new WhatsAppCloudNotifier({ token, phoneNumberId })
    : new ManualNotifier();

  return cached;
}

/** Test hook. */
export function __setNotifier(port: NotificationPort | null) {
  cached = port;
}
