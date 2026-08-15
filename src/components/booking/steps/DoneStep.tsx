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
  const tb = useTranslations('booking');
  const summary = useBookingSummary();
  const { state } = useBooking();
  const result = state.result;
  const isRequest = result?.isRequest ?? true;

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
        href={whatsappLink(tb('whatsappMessage', { summary }))}
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
