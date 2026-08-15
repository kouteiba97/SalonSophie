'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { setReservationStatus, type AtelierState } from '@/app/actions/atelier';
import type { ReservationStatus } from '@/lib/atelier/types';

/**
 * The transitions a reservation can legally make, offered as buttons rather than a dropdown.
 *
 * The lifecycle is enforced in Postgres (`set_reservation_status`), and this list is the same
 * rule expressed as affordances: `returned` and `cancelled` are terminal, so a finished
 * reservation shows no buttons at all instead of showing some that will be refused.
 *
 * Cancelling is destructive in the way that matters here — it releases the dates immediately,
 * and someone else can take them within the minute — so it asks first.
 */
const NEXT_STATUSES: Record<ReservationStatus, ReservationStatus[]> = {
  held: ['confirmed', 'cancelled'],
  confirmed: ['returned', 'cancelled'],
  returned: [],
  cancelled: [],
};

export function ReservationActions({
  reservationId,
  status,
}: {
  reservationId: string;
  status: ReservationStatus;
}) {
  const t = useTranslations('atelier.actions');
  const errors = useTranslations('atelier.errors');
  const [state, formAction] = useActionState<AtelierState, FormData>(setReservationStatus, {
    status: 'idle',
  });

  const available = NEXT_STATUSES[status];
  if (available.length === 0) {
    return <p className="text-[12px] text-muted-3">{t('none')}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {available.map((next) => (
          <form key={next} action={formAction}>
            <input type="hidden" name="reservationId" value={reservationId} />
            <input type="hidden" name="status" value={next} />
            <TransitionButton
              label={t(next)}
              destructive={next === 'cancelled'}
              confirmMessage={next === 'cancelled' ? t('confirmCancel') : null}
            />
          </form>
        ))}
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(state.error)}
        </p>
      ) : null}
    </div>
  );
}

function TransitionButton({
  label,
  destructive,
  confirmMessage,
}: {
  label: string;
  destructive: boolean;
  confirmMessage: string | null;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        // Native confirm rather than a dialog: it is the one interaction that must still work
        // when the console is open on a phone at the desk with a flaky connection.
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className={
        destructive
          ? 'cursor-pointer rounded-full border border-rose-dark/40 px-4 py-2 text-[12px] text-rose-dark transition-colors hover:bg-blush-6 disabled:cursor-not-allowed disabled:opacity-60'
          : 'cursor-pointer rounded-full bg-rose-deep px-4 py-2 text-[12px] text-white transition-colors hover:bg-rose-dark disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {pending ? '…' : label}
    </button>
  );
}
