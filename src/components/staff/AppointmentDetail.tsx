'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { WhatsApp } from '@/components/common/icons';
import { formatMinute, isRequest, type ConsoleAppointment } from '@/lib/console/day-line';
import { usePrice } from '@/lib/use-price';

/**
 * "Click for detail with a WhatsApp button" (§13).
 *
 * The WhatsApp link is the point. The salon runs on one phone line, and the thing reception
 * actually needs from a block on a timeline is to message the person in it — so the detail is
 * one tap from the day rather than three screens away.
 *
 * The trigger is a real `<button>` wrapping the block, and the dialog is the shadcn primitive,
 * which brings the focus trap, Escape, `aria-modal`, scroll lock and focus restore with it.
 * Rebuilding any of that by hand is how a modal ends up keyboard-inaccessible.
 */
export function AppointmentDetail({
  appointment,
  children,
}: {
  appointment: ConsoleAppointment;
  children: ReactNode;
}) {
  const t = useTranslations('console.appointment');
  const statuses = useTranslations('console.statuses');
  const price = usePrice();

  const international = `213${appointment.clientPhone.slice(1)}`;
  const time = isRequest(appointment)
    ? t('requestedAt', { time: formatMinute(appointment.startMinute) })
    : `${formatMinute(appointment.startMinute)} – ${formatMinute(appointment.endMinute!)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="block h-full w-full cursor-pointer text-start">
          {children}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-[480px]">
        <div className="flex flex-col gap-1">
          <DialogTitle className="font-display text-[24px] font-light text-charcoal">
            {appointment.clientName}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-2">
            {appointment.serviceName ?? appointment.gownName ?? t('noService')}
          </DialogDescription>
        </div>

        <dl className="flex flex-col gap-2.5 text-[14px]">
          <Row label={t('time')}>
            <span className="tabular-nums" dir="ltr">
              {time}
            </span>
          </Row>

          <Row label={t('status')}>{statuses(appointment.status)}</Row>

          {appointment.staffName ? <Row label={t('staff')}>{appointment.staffName}</Row> : null}

          <Row label={t('phone')}>
            <a href={`tel:${appointment.clientPhone}`} dir="ltr" className="hover:underline">
              {appointment.clientPhone}
            </a>
          </Row>

          <Row label={t('price')}>
            {/*
              Null is not zero. Most of the tariff is ranges and floors, so the price is settled
              at the chair — showing "Sur devis" is the same honesty the public site uses.
            */}
            {appointment.priceCharged === null
              ? t('priceUnsettled')
              : price({ kind: 'fixed', amount: appointment.priceCharged })}
          </Row>

          <Row label={t('reference')}>
            <span className="font-mono text-[12px]" dir="ltr">
              {appointment.reference}
            </span>
          </Row>
        </dl>

        {appointment.notes ? (
          <p className="whitespace-pre-line rounded-[14px] bg-tint/60 px-4 py-3 text-[13px] leading-[1.7] text-ink-2">
            {appointment.notes}
          </p>
        ) : null}

        {isRequest(appointment) ? (
          <p className="rounded-[14px] border border-champagne/60 bg-champagne-3/60 px-4 py-3 text-[12px] leading-[1.7] text-ink-2">
            {t('requestNote')}
          </p>
        ) : null}

        <a
          href={`https://wa.me/${international}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-deep px-6 py-3 text-[14px] text-white transition-colors hover:bg-rose-dark"
        >
          <WhatsApp className="size-4" />
          {t('whatsapp')}
        </a>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] uppercase tracking-[.12em] text-taupe">{label}</dt>
      <dd className="text-end text-charcoal">{children}</dd>
    </div>
  );
}
