import { useTranslations } from 'next-intl';

/**
 * Days booked against days in the window — §13's "utilisation per gown".
 *
 * A `<meter>` rather than a coloured div: it is the element that means "a measurement within a
 * known range", so a screen reader announces the value and its bounds without an ARIA patch. The
 * number is also written out beside it, because a bar alone tells nobody whether 40% of ninety
 * days is good.
 */
export function UtilisationBar({
  reservedDays,
  windowDays,
}: {
  reservedDays: number;
  windowDays: number;
}) {
  const t = useTranslations('atelier.dashboard');
  const rate = windowDays > 0 ? reservedDays / windowDays : 0;
  const percent = Math.round(rate * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[.16em] text-taupe">
          {t('utilisation')}
        </span>
        <span className="text-[13px] text-charcoal">
          {t('daysReserved', { days: reservedDays, window: windowDays })}
        </span>
      </div>

      <meter
        className="ns-meter h-1.5 w-full"
        min={0}
        max={windowDays || 1}
        value={reservedDays}
        aria-label={t('utilisation')}
        aria-valuetext={t('percent', { percent })}
      >
        {t('percent', { percent })}
      </meter>
    </div>
  );
}
