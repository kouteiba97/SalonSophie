'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { recordPayment, setAppointmentStatus, type DayState } from '@/app/actions/day';
import type { ConsoleAppointment } from '@/lib/console/day-line';

/**
 * One appointment, as a worker meets it: a card with the two or three things they might do next.
 *
 * Built for a phone held in one hand between clients. Every control is at least 44px tall, the
 * actions are laid out in a row that wraps rather than a menu that has to be opened, and the
 * destructive one (absent) is visually quieter than the ordinary one (done) — they sit next to
 * each other and are pressed in a hurry.
 */
export function AppointmentCard({
  appointment,
  timeLabel,
  canTakePayment,
}: {
  appointment: ConsoleAppointment;
  timeLabel: string;
  canTakePayment: boolean;
}) {
  const t = useTranslations('console.myDay');
  const errors = useTranslations('console.myDay.errors');

  const [statusResult, statusAction] = useActionState<DayState, FormData>(setAppointmentStatus, {
    status: 'idle',
  });
  const [paymentResult, paymentAction] = useActionState<DayState, FormData>(recordPayment, {
    status: 'idle',
  });

  const [paying, setPaying] = useState(false);

  const done = appointment.status === 'completed';
  const missed = appointment.status === 'no_show';
  const settled = done || missed || appointment.status === 'cancelled';

  return (
    <li
      className={`flex flex-col gap-3 rounded-[20px] border bg-white px-4 py-4 sm:px-5 ${
        settled ? 'border-line/60 opacity-70' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[22px] leading-none text-rose-deep">
              {timeLabel}
            </span>
            <span className="text-[15px] text-charcoal">{appointment.clientName}</span>
          </span>

          <span className="text-[13px] text-ink-2">
            {appointment.serviceName ?? appointment.gownName ?? t('noService')}
            {appointment.staffName ? ` · ${appointment.staffName}` : ''}
          </span>

          {appointment.notes ? (
            <span className="text-[12px] leading-[1.6] text-taupe">{appointment.notes}</span>
          ) : null}
        </div>

        {settled ? (
          <span className="shrink-0 rounded-full bg-tint px-3 py-1 text-[12px] text-rose-deep">
            {done ? t('done') : missed ? t('missed') : t('cancelled')}
          </span>
        ) : null}
      </div>

      {/*
        The client's number, one tap away.

        Running late, a cancellation, "are you coming?" — every one of those is a phone call the
        worker makes from this screen or does not make at all.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`tel:${appointment.clientPhone}`}
          className="inline-flex min-h-[44px] items-center rounded-full border border-rose-soft/45 px-4 text-[13px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
        >
          {t('call')}
        </a>
        <a
          href={`https://wa.me/213${appointment.clientPhone.replace(/^0/, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center rounded-full border border-rose-soft/45 px-4 text-[13px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
        >
          WhatsApp
        </a>
      </div>

      {!settled ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <form action={statusAction}>
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <input type="hidden" name="status" value="completed" />
            <PrimaryButton label={t('markDone')} pendingLabel={t('saving')} />
          </form>

          {canTakePayment ? (
            <button
              type="button"
              onClick={() => setPaying((value) => !value)}
              className="min-h-[44px] cursor-pointer rounded-full border border-rose-soft/55 px-4 text-[13px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
            >
              {t('takePayment')}
            </button>
          ) : null}

          <form action={statusAction}>
            <input type="hidden" name="appointmentId" value={appointment.id} />
            <input type="hidden" name="status" value="no_show" />
            <QuietButton label={t('markMissed')} />
          </form>
        </div>
      ) : null}

      {paying ? (
        <form action={paymentAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('amount')}
            <input
              name="amount"
              inputMode="decimal"
              required
              dir="ltr"
              autoFocus
              className="w-[140px] rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[15px] text-charcoal outline-none focus:border-rose-deep"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('method')}
            <select
              name="method"
              defaultValue="cash"
              className="min-h-[44px] rounded-[12px] border border-rose-soft/45 bg-white px-3 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            >
              {(['cash', 'transfer', 'cib', 'edahabia', 'other'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`methods.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <PrimaryButton label={t('confirmPayment')} pendingLabel={t('saving')} />
        </form>
      ) : null}

      {paymentResult.status === 'success' ? (
        <p role="status" className="text-[12px] text-rose-deep">
          {t('paymentRecorded')}
        </p>
      ) : null}

      {statusResult.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(statusResult.error)}
        </p>
      ) : null}
      {paymentResult.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(paymentResult.error)}
        </p>
      ) : null}
    </li>
  );
}

function PrimaryButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-[44px] cursor-pointer rounded-full bg-rose-deep px-5 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Quieter than the primary on purpose: it sits beside it and is pressed in a hurry. */
function QuietButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-[44px] cursor-pointer rounded-full px-4 text-[13px] text-taupe-2 underline-offset-2 transition-colors hover:text-rose-dark hover:underline disabled:cursor-default disabled:opacity-50"
    >
      {label}
    </button>
  );
}
