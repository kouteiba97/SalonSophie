import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ExpenseForm } from '@/components/staff/ExpenseForm';
import { PeriodPicker } from '@/components/staff/PeriodPicker';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { hasConsoleData } from '@/lib/console/demo';
import {
  getCashFlow,
  getDataGaps,
  getExpenseSummary,
  getRevenueByLine,
  getServicePerformance,
  type CashFlowDay,
  type DataGap,
  type ExpenseGroup,
  type ServiceRevenue,
} from '@/lib/console/finances';
import {
  cashFlowTotals,
  peakDayMovement,
  revenueRanking,
  type LineShare,
} from '@/lib/console/money-flow';
import { resolvePeriod, type Period } from '@/lib/console/period';
import { fromIsoDate } from '@/lib/datetime';
import { usePrice } from '@/lib/use-price';

/**
 * Finances — "which of the three businesses is bringing more money", answered for a period.
 *
 * Deliberately not a third dashboard. `/aujourdhui` answers *what is happening today*; this
 * answers *what did a period earn*. They do not overlap, and a screen that tried to do both would
 * be worse at each.
 *
 * The one number this screen refuses to show is a **margin**. Most products have no unit cost
 * (§6), rent may not have been entered, and nobody is paid through this app — so the balance below
 * is labelled as a balance of *recorded* movements, and a profit percentage computed against
 * partial costs would not be an estimate but a flattering fiction with a decimal point on it.
 * What is missing is shown instead, as a count that goes down.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.finances' });
  return { title: t('title') };
}

/** `2026-08-16` in Africa/Algiers, wherever this rendered. */
function salonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
}

export default async function FinancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const today = salonToday();
  const period = resolvePeriod(
    { from: first(query.from), to: first(query.to), period: first(query.period) },
    today,
  );

  const t = await getTranslations({ locale, namespace: 'console.finances' });

  const [lines, flow, services, expenses, gaps] = await Promise.all([
    getRevenueByLine(period),
    getCashFlow(period),
    getServicePerformance(period),
    getExpenseSummary(period),
    getDataGaps(),
  ]);

  const ranking = revenueRanking(lines);
  const totals = cashFlowTotals(flow);
  const connected = hasConsoleData();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>

        {!connected ? (
          <p
            role="status"
            className="mt-2 rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('notConfigured')}
          </p>
        ) : null}
      </header>

      <PeriodPicker period={period} />

      <Totals period={period} totals={totals} locale={locale} />

      <RevenueByLine ranking={ranking} />

      <CashFlowChart days={flow} locale={locale} />

      <div className="grid gap-8 lg:grid-cols-2">
        <ServiceTable services={services} />
        <Spending expenses={expenses} today={today} />
      </div>

      {gaps.length > 0 ? <Gaps gaps={gaps} /> : null}
    </div>
  );
}

/* ── the three headline numbers ──────────────────────────────────────────────────────────── */

function Totals({
  period,
  totals,
  locale,
}: {
  period: Period;
  totals: ReturnType<typeof cashFlowTotals>;
  locale: Locale;
}) {
  const t = useTranslations('console.finances');
  const price = usePrice();

  const day = (value: string) =>
    fromIsoDate(value).toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'long' });

  return (
    <section aria-labelledby="finances-totals" className="flex flex-col gap-3">
      <h2 id="finances-totals" className="text-[11px] uppercase tracking-[.16em] text-taupe">
        {t('totalsTitle', { from: day(period.from), to: day(period.to) })}
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label={t('moneyIn')} value={price({ kind: 'fixed', amount: totals.revenue })} />
        <Figure
          label={t('moneyOut')}
          value={price({ kind: 'fixed', amount: totals.spend })}
          hint={t('moneyOutHint')}
        />
        {/*
          A negative balance is a real answer and reads as one: the minus sign comes from the
          formatter, and the colour changes rather than the number being clamped at zero.
        */}
        <Figure
          label={t('balance')}
          value={price({ kind: 'fixed', amount: totals.net })}
          hint={t('balanceHint')}
          tone={totals.net < 0 ? 'negative' : 'neutral'}
        />
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'negative';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-white px-5 py-4">
      <span className="text-[11px] uppercase tracking-[.14em] text-taupe">{label}</span>
      <span
        className={`font-display text-[26px] font-light leading-tight ${
          tone === 'negative' ? 'text-rose-dark' : 'text-charcoal'
        }`}
      >
        {value}
      </span>
      {hint ? <span className="text-[11px] leading-[1.6] text-taupe">{hint}</span> : null}
    </div>
  );
}

/* ── which business earns ────────────────────────────────────────────────────────────────── */

function RevenueByLine({ ranking }: { ranking: LineShare[] }) {
  const t = useTranslations('console.finances');
  const price = usePrice();
  const percent = (share: number) => Math.round(share * 100);

  return (
    <section aria-labelledby="finances-lines" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="finances-lines" className="font-display text-[21px] font-light text-charcoal">
          {t('linesTitle')}
        </h2>
        <p className="max-w-[70ch] text-[13px] leading-[1.7] text-ink-2">{t('linesLead')}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {ranking.map((line) => (
          <li key={line.line} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[14px] text-charcoal">{t(`lines.${line.line}`)}</span>
              <span className="text-[13px] text-ink-2">
                {price({ kind: 'fixed', amount: line.revenue })}
                <span className="text-taupe">
                  {' · '}
                  {t('transactions', { count: line.transactions })}
                </span>
              </span>
            </div>

            {/*
              A meter, not a decorative div: the share is the comparison this screen exists to
              make, so it carries its own value for anyone not looking at the bar.
            */}
            <div
              role="meter"
              aria-valuenow={percent(line.share)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('shareOf', { line: t(`lines.${line.line}`) })}
              className="h-2 w-full overflow-hidden rounded-full bg-tint"
            >
              <div
                className="h-full rounded-full bg-rose-deep"
                style={{ inlineSize: `${percent(line.share)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── money in and out, day by day ────────────────────────────────────────────────────────── */

function CashFlowChart({ days, locale }: { days: CashFlowDay[]; locale: Locale }) {
  const t = useTranslations('console.finances');
  const price = usePrice();
  const peak = peakDayMovement(days);

  if (days.length === 0 || peak === null) {
    return (
      <section aria-labelledby="finances-flow" className="flex flex-col gap-3">
        <h2 id="finances-flow" className="font-display text-[21px] font-light text-charcoal">
          {t('flowTitle')}
        </h2>
        <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
          {t('flowEmpty')}
        </p>
      </section>
    );
  }

  const label = (value: string) =>
    fromIsoDate(value).toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'short' });

  return (
    <section aria-labelledby="finances-flow" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="finances-flow" className="font-display text-[21px] font-light text-charcoal">
          {t('flowTitle')}
        </h2>
        <p className="flex items-center gap-4 text-[12px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-rose-deep" />
            {t('moneyIn')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-champagne" />
            {t('moneyOut')}
          </span>
        </p>
      </div>

      {/*
        A table, read as a chart. The bars are presentational and the numbers are really there,
        which is what makes this readable with a screen reader and printable — and it costs
        nothing, because the data is a dozen rows, not a canvas.
      */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[13px]">
          <caption className="sr-only">{t('flowCaption')}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('day')}
              </th>
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('moneyIn')}
              </th>
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('moneyOut')}
              </th>
              <th scope="col" className="w-[45%] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {days.map((entry) => (
              <tr key={entry.onDate} className="border-b border-line/70">
                <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-start font-normal text-ink-2">
                  {label(entry.onDate)}
                </th>
                <td className="whitespace-nowrap px-2 py-1.5 text-charcoal">
                  {entry.revenue > 0 ? price({ kind: 'fixed', amount: entry.revenue }) : '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">
                  {entry.spend > 0 ? price({ kind: 'fixed', amount: entry.spend }) : '—'}
                </td>
                <td aria-hidden className="px-2 py-1.5">
                  <span className="flex flex-col gap-0.5">
                    <span
                      className="h-1.5 rounded-full bg-rose-deep"
                      style={{ inlineSize: `${(entry.revenue / peak) * 100}%` }}
                    />
                    <span
                      className="h-1.5 rounded-full bg-champagne"
                      style={{ inlineSize: `${(entry.spend / peak) * 100}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── which services earn ─────────────────────────────────────────────────────────────────── */

function ServiceTable({ services }: { services: ServiceRevenue[] }) {
  const t = useTranslations('console.finances');
  const price = usePrice();

  return (
    <section aria-labelledby="finances-services" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="finances-services" className="font-display text-[21px] font-light text-charcoal">
          {t('servicesTitle')}
        </h2>
        {/* Booked most and earning most are different questions, so both columns are here. */}
        <p className="text-[13px] leading-[1.7] text-ink-2">{t('servicesLead')}</p>
      </div>

      {services.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
          {t('servicesEmpty')}
        </p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('service')}
              </th>
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('bookings')}
              </th>
              <th scope="col" className="px-2 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                {t('revenue')}
              </th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.serviceSlug} className="border-b border-line/70">
                <td className="px-2 py-2 text-charcoal">
                  {service.serviceName}
                  <span className="block text-[11px] text-taupe">{service.categoryName}</span>
                </td>
                <td className="px-2 py-2 text-ink-2">{service.bookings}</td>
                <td className="px-2 py-2 text-ink-2">
                  {price({ kind: 'fixed', amount: service.revenue })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ── where the money goes ────────────────────────────────────────────────────────────────── */

function Spending({ expenses, today }: { expenses: ExpenseGroup[]; today: string }) {
  const t = useTranslations('console.finances');
  const price = usePrice();

  return (
    <section aria-labelledby="finances-spending" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="finances-spending" className="font-display text-[21px] font-light text-charcoal">
          {t('spendingTitle')}
        </h2>
        <p className="text-[13px] leading-[1.7] text-ink-2">{t('spendingLead')}</p>
      </div>

      {expenses.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[13px] leading-[1.7] text-ink-2">
          {t('spendingEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <li
              key={`${expense.category}-${expense.line}`}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-2 text-[13px]"
            >
              <span className="text-charcoal">
                {t(`categories.${expense.category}`)}
                <span className="text-taupe">
                  {' · '}
                  {expense.line === 'shared' ? t('lineShared') : t(`lines.${expense.line}`)}
                </span>
              </span>
              <span className="text-ink-2">{price({ kind: 'fixed', amount: expense.total })}</span>
            </li>
          ))}
        </ul>
      )}

      <ExpenseForm today={today} />
    </section>
  );
}

/* ── what nobody has told us yet ─────────────────────────────────────────────────────────── */

function Gaps({ gaps }: { gaps: DataGap[] }) {
  const t = useTranslations('console.finances');
  const manage = useTranslations('console.manage');

  /** The `data_gaps()` keys, mapped to the copy that already existed for them. */
  const COPY: Record<string, { key: string; counted: boolean }> = {
    service_duration: { key: 'gapDuration', counted: true },
    service_price: { key: 'gapPrice', counted: true },
    opening_hours: { key: 'gapHours', counted: false },
    gown_rental_price: { key: 'gapGownPrice', counted: true },
    product_cost: { key: 'gapProductCost', counted: true },
  };

  return (
    <section
      aria-labelledby="finances-gaps"
      className="flex flex-col gap-2 rounded-[20px] border border-champagne/60 bg-champagne-3/60 px-5 py-4"
    >
      <h2 id="finances-gaps" className="text-[11px] uppercase tracking-[.16em] text-rose-deep">
        {manage('gapsTitle')}
      </h2>
      <p className="max-w-[70ch] text-[13px] leading-[1.7] text-ink-2">{t('gapsLead')}</p>

      <ul className="flex flex-col gap-1 text-[13px] leading-[1.7] text-ink-2">
        {gaps.map((gap) => {
          const copy = COPY[gap.gap];
          if (!copy) return null;
          return (
            <li key={gap.gap}>
              {copy.counted ? manage(copy.key, { count: gap.missing }) : manage(copy.key)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
