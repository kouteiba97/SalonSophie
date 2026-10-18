'use client';

import { useTranslations } from 'next-intl';
import { Check, WhatsApp } from '@/components/common/icons';
import { whatsappLink } from '@/data/business';
import { useBooking } from '../BookingProvider';
import { useBookingSummary } from '../useBookingSummary';

/**
 * Step 5 — confirmation.
 *
 * §9 ends the flow with a reference number, and this now shows a real one: the value the
 * database generated, rendered only when the server actually returned it. With no database
 * configured the booking is a request and no reference is printed — an identifier that matches
 * no row is worse than none.
 *
 * Two outcomes are distinguished on purpose. A *booking* holds a slot. A *request* asks for a
 * time the salon has yet to confirm, which happens whenever the service duration or the opening
 * hours are still unknown (§6). Telling a client "c'est réservé" for a request would be the
 * booking-flow equivalent of inventing a price.
 */
export function DoneStep() {
  const t = useTranslations('booking.done');
  const tw = useTranslations('booking.whatsapp');
  const summary = useBookingSummary();
  const { state } = useBooking();
  const result = state.result;
  const isRequest = result?.isRequest ?? true;

  /*
   * The WhatsApp hand-off, written so the salon can act on it without asking anything back.
   *
   * It used to send "Bonjour N&S, je souhaite confirmer : {summary}" — one run-on line naming
   * the service, the stylist and the time, and nothing else. Three things were missing, and each
   * one cost a round trip:
   *
   *   - the reference, so whoever reads the message can find the row instead of searching by
   *     name and date;
   *   - the client's name, because the sender's WhatsApp display name is whatever they set it
   *     to, and often is not the name they booked under;
   *   - whether this is a held slot or a request. That is the one thing the salon must know and
   *     the one thing the old message never said: a confirmed booking needs no reply, a request
   *     is not a booking until someone answers it. Same words for both is how a bride ends up
   *     believing a time is hers.
   *
   * The phone number is deliberately left out — it arrives with the message by definition.
   *
   * Built as labelled lines rather than prose: it is read on a phone, mid-service, and scanning
   * for "Réf." beats parsing a sentence.
   *
   * Each label carries its own colon rather than the code appending one. French puts a space
   * before a colon and Arabic and English do not, so a hardcoded " : " was correct in exactly
   * one of the three locales and quietly wrong in the other two.
   */
  const lines = [
    isRequest ? tw('request') : tw('confirmed'),
    '',
    ...(result?.reference ? [`${tw('reference')} ${result.reference}`] : []),
    ...(summary ? [`${tw('details')} ${summary}`] : []),
    ...(result?.clientName ? [`${tw('client')} ${result.clientName}`] : []),
    '',
    isRequest ? tw('closingRequest') : tw('closingConfirmed'),
  ];
  const message = lines.join('\n');

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-rose-deep/10 text-rose-deep">
        <Check className="size-7" />
      </span>

      <p className="font-display text-[28px] font-light leading-tight text-charcoal">
        {isRequest ? t('requestTitle') : t('title')}
        <br />
        <span className="font-script text-[1.15em] text-rose-deep">
          {isRequest ? t('requestTitleAccent') : t('titleAccent')}
        </span>
      </p>

      {summary ? (
        <p className="max-w-[44ch] text-[14px] leading-[1.7] text-ink-2">{summary}</p>
      ) : null}

      {/* Only ever the reference the database generated. */}
      {result?.reference ? (
        <p className="rounded-full bg-tint px-4 py-1.5 font-mono text-[13px] tracking-[.12em] text-rose-deep">
          {t('reference', { ref: result.reference })}
        </p>
      ) : null}

      <p className="max-w-[44ch] text-[12px] leading-[1.7] text-taupe-2">
        {isRequest ? t('requestNote') : t('reminder')}
      </p>

      <a
        href={whatsappLink(message)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-2.5 rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
      >
        <WhatsApp className="size-4" />
        {t('confirmOnWhatsapp')}
      </a>
    </div>
  );
}
