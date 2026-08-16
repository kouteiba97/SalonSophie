'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { recordStockMovement, type ManagementState } from '@/app/actions/management';
import { STOCK_REASONS } from '@/lib/management/schema';

/**
 * What came in, what went out.
 *
 * The one write on this screen reception may make — they are the ones who notice a bottle running
 * out, and `stock_movements_front_desk_insert` says so. Everything else here is owner-only.
 *
 * The quantity is always typed as a positive number and the sign is derived from the reason, in
 * `stockMovementInput`. That is not a convenience: the table's check constraint refuses a sign
 * that contradicts its reason, so a form that let someone type "-3 delivered" would be building a
 * request the database is guaranteed to reject.
 *
 * Cost appears only for a delivery, because that is the only reason for which it means anything —
 * and `record_stock_movement` turns it into the matching expense in the same transaction, so
 * restocking cannot show up in the stock history without showing up in the money going out.
 */
export function StockMovementForm({
  productSlug,
  productName,
  unit,
  onDone,
}: {
  productSlug: string;
  productName: string;
  unit: string;
  onDone?: () => void;
}) {
  const t = useTranslations('console.stock');
  const errors = useTranslations('console.manage.errors');
  const [result, formAction] = useActionState<ManagementState, FormData>(recordStockMovement, {
    status: 'idle',
  });
  const [reason, setReason] = useState<(typeof STOCK_REASONS)[number]>('delivery');
  const quantityId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productSlug" value={productSlug} />

      <p className="text-[12px] text-taupe">{t('movementFor', { name: productName })}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('reason')}
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as (typeof STOCK_REASONS)[number])}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {STOCK_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(`reasons.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={quantityId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('quantity', { unit: t(`units.${unit}`) })}
          <input
            id={quantityId}
            name="quantity"
            inputMode="decimal"
            required
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        {/* Only a delivery has a cost; anything else would post an expense that never happened. */}
        {reason === 'delivery' ? (
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('totalCost')}
            <input
              name="totalCost"
              inputMode="decimal"
              dir="ltr"
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            />
            <span className="text-[11px] text-taupe">{t('totalCostHint')}</span>
          </label>
        ) : (
          <input type="hidden" name="totalCost" value="" />
        )}

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('occurredOn')}
          <input
            type="date"
            name="occurredOn"
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        {t('note')}
        <input
          name="note"
          maxLength={300}
          className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
        />
      </label>

      {result.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}
      {result.status === 'success' ? (
        <p role="status" className="text-[12px] text-rose-deep">
          {t('movementSaved')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SaveButton label={t('record')} pendingLabel={t('recording')} />
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="cursor-pointer rounded-full border border-rose-soft/45 px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-rose-deep"
          >
            {t('close')}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function SaveButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="cursor-pointer rounded-full bg-rose-deep px-5 py-2 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
