import { useTranslations } from 'next-intl';

import type { DayKpis } from '@/lib/console/kpis';
import { usePrice } from '@/lib/use-price';
import { cn } from '@/lib/utils';

/**
 * The four cards above the day-line (§13): booked revenue, appointment count, gowns out, and
 * unanswered messages "styled as an alert — unanswered client messages are a known failure".
 *
 * The alert styling only appears when there is something to be alarmed about. A permanently red
 * card is a card people stop seeing, which would defeat the entire reason §13 singles this one
 * out.
 */
export function KpiCards({ kpis }: { kpis: DayKpis }) {
  const t = useTranslations('console.kpis');
  const price = usePrice();

  const alert = kpis.unansweredMessages > 0;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label={t('revenue')}
        value={
          /*
           * Null means no appointment today has a settled price — different from zero, which
           * means no appointments. Most of the published tariff is ranges and floors, so a sum
           * that treated those as free would report the cheapest possible day as a forecast.
           */
          kpis.bookedRevenue === null
            ? t('revenueUnknown')
            : price({ kind: 'fixed', amount: kpis.bookedRevenue })
        }
        hint={kpis.unpricedCount > 0 ? t('revenueHint', { count: kpis.unpricedCount }) : undefined}
      />

      <Card
        label={t('appointments')}
        value={String(kpis.appointmentCount)}
        hint={kpis.requestCount > 0 ? t('appointmentsHint', { count: kpis.requestCount }) : undefined}
      />

      <Card label={t('gownsOut')} value={String(kpis.gownsOut)} />

      <Card
        label={t('unanswered')}
        value={String(kpis.unansweredMessages)}
        hint={alert ? t('unansweredHint') : undefined}
        alert={alert}
      />
    </ul>
  );
}

function Card({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <li
      // The alert is announced, not merely coloured — colour alone is not a signal (§12.8).
      role={alert ? 'status' : undefined}
      className={cn(
        'flex flex-col gap-1 rounded-[18px] border px-5 py-4',
        alert ? 'border-rose-dark/45 bg-blush-6' : 'border-line bg-white',
      )}
    >
      <span className="text-[11px] uppercase tracking-[.16em] text-taupe">{label}</span>
      <span
        className={cn(
          'font-display text-[26px] font-light leading-tight',
          alert ? 'text-rose-dark' : 'text-charcoal',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-[12px] leading-[1.6] text-taupe">{hint}</span> : null}
    </li>
  );
}
