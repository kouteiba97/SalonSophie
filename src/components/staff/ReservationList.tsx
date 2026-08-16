import { useLocale, useTranslations } from 'next-intl';

import { ReservationActions } from '@/components/staff/ReservationActions';
import { ReservationStatusBadge } from '@/components/staff/badges';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { lastWornDay } from '@/lib/atelier/ranges';
import type { Reservation } from '@/lib/atelier/types';
import { fromIsoDate } from '@/lib/datetime';
import { usePrice } from '@/lib/use-price';

/**
 * Every list has four states (§conventions): loading, empty, error and populated. Loading lives
 * in the route's `loading.tsx` and error in its `error.tsx`; this component owns the other two,
 * plus the fifth state this project actually has — no database configured at all.
 *
 * The empty state invites the next action rather than reporting an absence.
 */
export function ReservationList({
  reservations,
  configured,
  canWrite,
  emptyHint,
}: {
  reservations: Reservation[];
  configured: boolean;
  canWrite: boolean;
  emptyHint?: string;
}) {
  const t = useTranslations('atelier.reservations');

  if (!configured) {
    return (
      <p
        role="status"
        className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
      >
        {t('notConfigured')}
      </p>
    );
  }

  if (reservations.length === 0) {
    return (
      <div className="rounded-[18px] border border-line bg-white px-5 py-8 text-center">
        <p className="text-[14px] text-charcoal">{t('empty')}</p>
        <p className="mt-1 text-[13px] leading-[1.7] text-taupe">{emptyHint ?? t('emptyHint')}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {reservations.map((reservation) => (
        <li key={reservation.id}>
          <ReservationCard reservation={reservation} canWrite={canWrite} />
        </li>
      ))}
    </ul>
  );
}

function ReservationCard({
  reservation,
  canWrite,
}: {
  reservation: Reservation;
  canWrite: boolean;
}) {
  const t = useTranslations('atelier.reservations');
  const locale = useLocale() as Locale;
  const price = usePrice();

  const worn = lastWornDay(reservation.range, reservation.cleaningBufferDays);
  const day = (iso: string) =>
    fromIsoDate(iso).toLocaleDateString(INTL_TAG[locale], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <article className="flex flex-col gap-4 rounded-[18px] border border-line bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/atelier/robes/${reservation.gownSlug}`}
            className="font-display text-[19px] font-light text-charcoal transition-colors hover:text-rose-deep"
          >
            {reservation.gownName}
          </Link>
          <ReservationStatusBadge status={reservation.status} />
          <span className="font-mono text-[11px] tracking-[.1em] text-muted-3" dir="ltr">
            {reservation.reference}
          </span>
        </div>

        <p className="text-[14px] text-charcoal">
          {reservation.client.fullName}{' '}
          {/* The phone is the salon's actual channel; ltr so an RTL page does not reorder it. */}
          <a
            href={`tel:${reservation.client.phone}`}
            dir="ltr"
            className="text-ink-2 underline-offset-2 hover:underline"
          >
            {reservation.client.phone}
          </a>
        </p>

        <p className="text-[13px] text-ink-2">
          {t('dates', { from: day(reservation.range.start), to: day(worn) })}
          {reservation.cleaningBufferDays > 0 ? (
            <span className="text-taupe">
              {' · '}
              {t('bufferNote', {
                days: reservation.cleaningBufferDays,
                until: day(reservation.range.end),
              })}
            </span>
          ) : null}
        </p>

        <p className="text-[13px] text-ink-2">
          {t('deposit')}{' '}
          <span className="text-charcoal">
            {/*
              Null means nobody has set a deposit policy (§6, open question 9). It renders the
              same "Sur devis" the public site uses for an unknown price — never a zero, which
              would read as "no deposit taken".
            */}
            {reservation.depositAmount === null
              ? t('depositUnknown')
              : price({ kind: 'fixed', amount: reservation.depositAmount })}
          </span>
        </p>

        {reservation.notes ? (
          <p className="whitespace-pre-line text-[13px] leading-[1.7] text-taupe-2">
            {reservation.notes}
          </p>
        ) : null}
      </div>

      {canWrite ? (
        <ReservationActions reservationId={reservation.id} status={reservation.status} />
      ) : (
        <p className="text-[12px] text-muted-3">{t('readOnly')}</p>
      )}
    </article>
  );
}
