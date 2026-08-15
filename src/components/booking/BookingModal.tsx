'use client';

import { useLocale, useTranslations } from 'next-intl';
import { bookAppointment } from '@/app/actions/book';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Close } from '@/components/common/icons';
import type { Locale } from '@/i18n/routing';
import { salonInstant } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useBooking } from './BookingProvider';
import { STEPS, STEP_COUNT } from './booking-reducer';
import type { BookingDetails } from './booking-schema';
import { DETAILS_FORM_ID, DetailsStep } from './steps/DetailsStep';
import { DateStep } from './steps/DateStep';
import { DoneStep } from './steps/DoneStep';
import { ExpertStep } from './steps/ExpertStep';
import { ServiceStep } from './steps/ServiceStep';

/**
 * The five-step booking flow — Le service → Votre experte → Date & heure → Vos coordonnées →
 * Confirmation (§9), in the design's order.
 *
 * Focus trap, Escape, `aria-modal`, scroll lock and focus restore all come from the Radix
 * Dialog primitive rather than being reimplemented (§5.4 item 12). Step changes are announced
 * through an `aria-live="polite"` region — "Étape 3 sur 5" — which the design did entirely
 * silently (§5.4 item 13).
 */
export function BookingModal() {
  const t = useTranslations('booking');
  const locale = useLocale() as Locale;
  const { state, dispatch, canAdvance, close, restoreFocus } = useBooking();

  /**
   * Confirm hands over to the server, which re-validates everything and is the only thing that
   * can actually take the slot. The client never invents a reference — it renders the one it is
   * given, or the error it is given.
   */
  const submit = async (details: BookingDetails) => {
    if (!state.date || !state.time) {
      dispatch({ type: 'submitError', error: 'invalid' });
      return;
    }

    dispatch({ type: 'submitStart' });

    try {
      const result = await bookAppointment({
        serviceSlug: state.serviceSlug,
        gownSlug: state.gownSlug,
        staffSlug: state.expertSlug,
        startsAt: salonInstant(state.date, state.time),
        name: details.name,
        phone: details.phone,
        notes: details.notes,
        locale,
      });

      if (result.ok) {
        dispatch({
          type: 'submitSuccess',
          reference: result.reference,
          isRequest: result.isRequest,
          notified: result.notified,
        });
      } else {
        dispatch({ type: 'submitError', error: result.error });
      }
    } catch {
      // A network failure is not a lost booking from the client's point of view — they can
      // still finish on WhatsApp, which the error copy tells them.
      dispatch({ type: 'submitError', error: 'unavailable' });
    }
  };

  const stepName = STEPS[state.step];
  const stepTitle = t(`steps.${stepName}`);
  const isLastInput = state.step === 3;
  const showNav = state.step < STEP_COUNT - 1;

  return (
    <Dialog
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        // Radix's default here focuses a trigger ref this modal never populates, so focus was
        // falling to <body>. Restore it to whichever control actually opened the flow.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            {/* Visual only — the live region below is what assistive tech announces, so this
                copy is hidden from it to avoid reading the step twice. */}
            <p aria-hidden className="text-[11px] uppercase tracking-[.2em] text-taupe">
              {t('step', { current: state.step + 1, total: STEP_COUNT })}
            </p>
            <DialogTitle className="mt-0.5 font-display text-[23px] font-light leading-tight text-charcoal">
              {stepTitle}
            </DialogTitle>
          </div>

          <DialogClose
            aria-label={t('close')}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-rose-soft/45 text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            <Close className="size-4" />
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">{t('title')}</DialogDescription>

        {/* Screen readers hear the step change; the progress bar only shows it. */}
        <p aria-live="polite" className="sr-only">
          {t('stepAnnounce', { current: state.step + 1, total: STEP_COUNT, title: stepTitle })}
        </p>

        <div className="flex gap-1.5 px-6" aria-hidden>
          {STEPS.map((name, i) => (
            <span
              key={name}
              className={cn(
                'h-[3px] flex-1 rounded-full transition-colors duration-300',
                i <= state.step ? 'bg-rose-deep' : 'bg-rose-soft/35',
              )}
            />
          ))}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* The server's refusal, said in the brand's voice and pointing at the fix. */}
          {state.error ? (
            <p
              role="alert"
              className="mb-4 rounded-[16px] border border-rose-dark/35 bg-blush/40 px-4 py-3 text-[13px] leading-[1.6] text-charcoal"
            >
              {t(`errors.${state.error}`)}
            </p>
          ) : null}

          {state.step === 0 ? <ServiceStep /> : null}
          {state.step === 1 ? <ExpertStep /> : null}
          {state.step === 2 ? <DateStep /> : null}
          {state.step === 3 ? <DetailsStep onValid={submit} /> : null}
          {state.step === 4 ? <DoneStep /> : null}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────────── */}
        {showNav ? (
          <div className="flex items-center gap-3 border-t border-line bg-cream-warm px-6 pb-6 pt-4">
            <button
              type="button"
              onClick={() => dispatch({ type: 'back' })}
              disabled={state.step === 0}
              className="cursor-pointer rounded-full border border-rose-soft/55 px-6 py-3 text-[14px] text-ink-2 transition-colors hover:border-rose-deep disabled:cursor-default disabled:opacity-40"
            >
              {t('back')}
            </button>

            <button
              // Step 4 submits the form so Zod runs; the others just advance.
              type={isLastInput ? 'submit' : 'button'}
              form={isLastInput ? DETAILS_FORM_ID : undefined}
              onClick={isLastInput ? undefined : () => dispatch({ type: 'next' })}
              disabled={state.submitting || (!isLastInput && !canAdvance)}
              aria-busy={state.submitting}
              className={cn(
                'group inline-flex flex-1 cursor-pointer items-center justify-center gap-3 rounded-full px-6 py-3 text-[14px] text-white transition-colors duration-200',
                state.submitting || (!isLastInput && !canAdvance)
                  ? 'cursor-not-allowed bg-rose-deep/30'
                  : 'bg-rose-deep hover:bg-rose-dark',
              )}
            >
              {state.submitting ? t('submitting') : isLastInput ? t('confirm') : t('next')}
              {state.submitting ? null : (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
              )}
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
