import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { DealCard } from '@/components/staff/DealCard';
import { NewDealForm } from '@/components/staff/NewDealForm';
import type { Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';
import { byStage, DEAL_STAGES, pipelineValue, type Deal } from '@/lib/console/deal-types';
import { getDeals } from '@/lib/console/deals';
import { isAuthConfigured } from '@/lib/supabase/session';
import { usePrice } from '@/lib/use-price';

/**
 * Sophie's creator business — §13's four-column kanban.
 *
 * Owner only. This is the line non-negotiable #5 names in so many words: "reception can't see
 * brand deals". The check below produces a clear message; `brand_deals_owner_all` is what
 * actually keeps a receptionist from reading a fee, and it holds whatever this page does.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.deals' });
  return { title: t('title') };
}

export default async function CollaborationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.deals' });
  const session = await getStaffSession();

  if (!isOwner(session)) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-[clamp(48px,9vw,112px)] text-center">
        <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
          {t('forbiddenTitle')}
        </h1>
        <p className="text-[14px] leading-[1.8] text-ink-2">{t('forbiddenBody')}</p>
      </div>
    );
  }

  const deals = await getDeals();
  const columns = byStage(deals);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>
      </header>

      <PipelineTotal deals={deals} />

      {!isAuthConfigured ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('notConfigured')}
        </p>
      ) : null}

      <details className="rounded-[20px] border border-line bg-white px-5 py-4">
        <summary className="cursor-pointer list-none text-[13px] text-rose-deep">
          {t('newDeal')}
        </summary>
        <div className="pt-4">
          <NewDealForm />
        </div>
      </details>

      {/* Four columns that scroll sideways on a phone rather than collapsing into one list —
          the shape is the information. */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[860px] grid-cols-4 gap-4">
          {DEAL_STAGES.map((stage) => (
            <section key={stage} aria-labelledby={`stage-${stage}`} className="flex flex-col gap-3">
              <h2
                id={`stage-${stage}`}
                className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-[.16em] text-taupe"
              >
                {t(`stages.${stage}`)}
                <span className="tabular-nums text-muted-3">{columns[stage].length}</span>
              </h2>

              {columns[stage].length === 0 ? (
                <p className="rounded-[16px] border border-dashed border-line px-4 py-6 text-center text-[12px] text-muted-3">
                  {t('columnEmpty')}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {columns[stage].map((deal) => (
                    <li key={deal.id}>
                      <DealCardWithPrice deal={deal} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Formats the fee here so DealCard stays a client component with no locale plumbing. */
function DealCardWithPrice({ deal }: { deal: Deal }) {
  const t = useTranslations('console.deals');
  const price = usePrice();

  const valueLabel =
    deal.valueAmount === null
      ? // Not agreed yet — never 0 DA, which would read as "agreed, and worth nothing".
        t('valueUnknown')
      : price({ kind: 'fixed', amount: deal.valueAmount });

  return <DealCard deal={deal} valueLabel={valueLabel} />;
}

function PipelineTotal({ deals }: { deals: Deal[] }) {
  const t = useTranslations('console.deals');
  const price = usePrice();
  const { total, unpriced } = pipelineValue(deals);

  return (
    <div className="flex flex-wrap items-baseline gap-3 rounded-[18px] border border-line bg-white px-5 py-4">
      <span className="text-[11px] uppercase tracking-[.16em] text-taupe">{t('pipeline')}</span>
      <span className="font-display text-[26px] font-light leading-tight text-charcoal">
        {total === null ? '—' : price({ kind: 'fixed', amount: total })}
      </span>
      {unpriced > 0 ? (
        <span className="text-[12px] text-taupe">{t('pipelineHint', { count: unpriced })}</span>
      ) : null}
    </div>
  );
}
