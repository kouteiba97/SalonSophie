import type { BookingNotification, DeliveryResult, NotificationPort } from './port';

const GRAPH_VERSION = 'v21.0';

/**
 * WhatsApp Business Cloud API adapter — the real communication channel in Algeria (§10).
 *
 * Business-initiated messages must use an approved template, so the copy is not free text: this
 * maps our notification kinds onto template names and positional parameters. Template names and
 * their approved languages are configured per environment because they are registered in Meta's
 * console, not here.
 *
 * Credentials come from the server environment only. `WHATSAPP_ACCESS_TOKEN` must never be a
 * NEXT_PUBLIC_ variable (non-negotiable #7).
 */
export class WhatsAppCloudNotifier implements NotificationPort {
  constructor(
    private readonly config: {
      token: string;
      phoneNumberId: string;
      templates?: Partial<Record<BookingNotification['kind'], string>>;
    },
  ) {}

  private templateFor(kind: BookingNotification['kind']): string {
    return (
      this.config.templates?.[kind] ??
      { booking_confirmation: 'ns_booking_confirmation', reminder_24h: 'ns_reminder_24h', reminder_2h: 'ns_reminder_2h' }[kind]
    );
  }

  /** Meta expects ar / fr / en_GB style codes. */
  private languageFor(locale: BookingNotification['locale']): string {
    return { fr: 'fr', ar: 'ar', en: 'en_GB' }[locale];
  }

  async send(notification: BookingNotification): Promise<DeliveryResult> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${this.config.phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to: notification.toPhone,
      type: 'template',
      template: {
        name: this.templateFor(notification.kind),
        language: { code: this.languageFor(notification.locale) },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: notification.clientName },
              { type: 'text', text: notification.summary },
              { type: 'text', text: notification.reference },
            ],
          },
        ],
      },
    };

    try {
      // Bounded: a hanging provider must not hold a booking response open.
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          delivered: false,
          via: 'whatsapp_cloud',
          error: `${response.status} ${text.slice(0, 200)}`,
        };
      }

      const json = (await response.json()) as { messages?: { id: string }[] };
      return {
        delivered: true,
        via: 'whatsapp_cloud',
        externalId: json.messages?.[0]?.id,
      };
    } catch (error) {
      return {
        delivered: false,
        via: 'whatsapp_cloud',
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  /**
   * Reminders at 24h and 2h (§10). The Cloud API has no scheduling of its own, so this records
   * the intent; Phase 5 adds the worker that fires them. Deliberately not a setTimeout — a
   * serverless function does not survive long enough to honour one.
   */
  async scheduleReminders(notification: BookingNotification): Promise<void> {
    if (notification.isRequest || !notification.startsAt) return;

    const due = [
      { kind: 'reminder_24h' as const, at: new Date(notification.startsAt.getTime() - 24 * 3600_000) },
      { kind: 'reminder_2h' as const, at: new Date(notification.startsAt.getTime() - 2 * 3600_000) },
    ].filter((r) => r.at.getTime() > Date.now());

    for (const reminder of due) {
      console.info(
        `[N&S] reminder queued: ${reminder.kind} for ref ${notification.reference} at ${reminder.at.toISOString()}`,
      );
    }
  }
}
