import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { PERIOD_PRESETS, type Period } from '@/lib/console/period';
import { cn } from '@/lib/utils';

/**
 * Which period the screen is answering about.
 *
 * The period lives in the **URL**, not in component state, following the same rule as the
 * category filter and search on the public site: a report someone can send to their sister, or
 * come back to next month, has to survive a link. It also means the back button does what it
 * looks like it does.
 *
 * The presets are links and the custom range is a plain GET form, so both work with no JavaScript
 * and both produce a URL you can read. A form without an `action` submits to the current path,
 * replacing the query string entirely — which is exactly right here, since `from`/`to` and
 * `period` are alternative ways of saying the same thing and should never both apply.
 */
export function PeriodPicker({ period }: { period: Period }) {
  const t = useTranslations('console.finances');

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-white px-5 py-4">
      <nav aria-label={t('periodLabel')}>
        <ul className="flex flex-wrap gap-1">
          {PERIOD_PRESETS.map((preset) => {
            const active = period.preset === preset;
            return (
              <li key={preset}>
                <Link
                  href={`/finances?period=${preset}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-full px-4 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-tint text-rose-deep'
                      : 'text-ink-2 hover:bg-cream hover:text-rose-deep',
                  )}
                >
                  {t(`periods.${preset}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('from')}
          <input
            type="date"
            name="from"
            defaultValue={period.from}
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[13px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('to')}
          <input
            type="date"
            name="to"
            defaultValue={period.to}
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[13px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
        >
          {t('apply')}
        </button>
      </form>
    </div>
  );
}
