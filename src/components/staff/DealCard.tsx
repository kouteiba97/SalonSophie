'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { setDealStage, type ConsoleState } from '@/app/actions/console';
import { adjacentStages, type Deal, type DealStage } from '@/lib/console/deal-types';

/**
 * A card on §13's four-column board, with the two moves available from where it sits.
 *
 * Buttons rather than drag-and-drop, deliberately. A kanban that only responds to dragging is
 * unusable by keyboard and awkward on the phone Sophie actually carries — and the whole
 * interaction is "this moved forward" or "this moved back", which two buttons say precisely.
 */
export function DealCard({ deal, valueLabel }: { deal: Deal; valueLabel: string }) {
  const t = useTranslations('console.deals');
  const errors = useTranslations('console.errors');
  const [state, formAction] = useActionState<ConsoleState, FormData>(setDealStage, {
    status: 'idle',
  });

  const { previous, next } = adjacentStages(deal.stage);

  return (
    <article className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-white px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] text-charcoal">{deal.brandName}</h3>
        <p className="text-[14px] text-rose-deep">{valueLabel}</p>
      </div>

      {deal.contactName || deal.contactHandle ? (
        <p className="text-[12px] text-taupe">
          {deal.contactName}
          {deal.contactHandle ? (
            <span dir="ltr"> {deal.contactName ? '· ' : ''}{deal.contactHandle}</span>
          ) : null}
        </p>
      ) : null}

      {/* §13 asks for the next deliverable on the card — the thing that is actually owed. */}
      {deal.nextDeliverable ? (
        <p className="rounded-[12px] bg-tint/70 px-3 py-2 text-[12px] leading-[1.6] text-ink-2">
          {t('nextDeliverable')}: {deal.nextDeliverable.description}
          {deal.nextDeliverable.dueOn ? (
            <span className="text-taupe" dir="ltr">
              {' '}
              · {deal.nextDeliverable.dueOn}
            </span>
          ) : null}
        </p>
      ) : deal.nextAction ? (
        <p className="rounded-[12px] bg-tint/70 px-3 py-2 text-[12px] leading-[1.6] text-ink-2">
          {deal.nextAction}
          {deal.nextActionDue ? (
            <span className="text-taupe" dir="ltr">
              {' '}
              · {deal.nextActionDue}
            </span>
          ) : null}
        </p>
      ) : null}

      {deal.deliverableCount > 0 ? (
        <p className="text-[11px] text-taupe">
          {t('deliverableProgress', {
            delivered: deal.deliveredCount,
            total: deal.deliverableCount,
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-2.5">
        {previous ? <MoveButton action={formAction} dealId={deal.id} stage={previous} label={`← ${t(`stages.${previous}`)}`} /> : null}
        {next ? <MoveButton action={formAction} dealId={deal.id} stage={next} label={`${t(`stages.${next}`)} →`} /> : null}
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(state.error)}
        </p>
      ) : null}
    </article>
  );
}

function MoveButton({
  action,
  dealId,
  stage,
  label,
}: {
  action: (formData: FormData) => void;
  dealId: string;
  stage: DealStage;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="stage" value={stage} />
      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-full border border-rose-soft/55 px-3 py-1.5 text-[11px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
