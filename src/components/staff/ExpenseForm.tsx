'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { recordExpense, type ManagementState } from '@/app/actions/management';
import { BUSINESS_LINES, EXPENSE_CATEGORIES } from '@/lib/management/schema';

/**
 * Money going out.
 *
 * Without this the "which business earns most" comparison is half a sentence — three lines of
 * revenue and no idea what any of them costs to run.
 *
 * The business line is optional on purpose, and its empty option is the meaningful one: rent and
 * electricity belong to the address, not to hair, and attributing the rent to the salon would make
 * the bridal line look better than it is. `expenses.line` is nullable for exactly that reason.
 *
 * A stock delivery recorded on /stock already writes its own expense inside the same transaction,
 * linked by a unique `stock_movement_id`. Entering it again here would double count it — which is
 * why the category list keeps `stock` for the deliveries nobody put through the stock screen, and
 * why the hint says so.
 */
export function ExpenseForm({ today }: { today: string }) {
  const t = useTranslations('console.finances');
  const manage = useTranslations('console.manage');
  const errors = useTranslations('console.manage.errors');
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState<ManagementState, FormData>(recordExpense, {
    status: 'idle',
  });

  const labelId = useId();
  const amountId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit cursor-pointer rounded-full border border-rose-soft/45 px-4 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
      >
        {t('addExpense')}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-[16px] border border-rose-soft/40 bg-cream-warm p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={labelId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseLabel')}
          <input
            id={labelId}
            name="label"
            required
            maxLength={120}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label htmlFor={amountId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseAmount')}
          <input
            id={amountId}
            name="amount"
            inputMode="decimal"
            required
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseCategory')}
          <select
            name="category"
            defaultValue="other"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-taupe">{t('expenseStockHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseLine')}
          <select
            name="line"
            defaultValue=""
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {/* The default, and the right answer for rent: shared, not charged to one line. */}
            <option value="">{t('lineShared')}</option>
            {BUSINESS_LINES.map((line) => (
              <option key={line} value={line}>
                {t(`lines.${line}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseDate')}
          <input
            type="date"
            name="incurredOn"
            required
            defaultValue={today}
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('expenseNote')}
          <input
            name="note"
            maxLength={300}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>
      </div>

      {result.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}
      {result.status === 'success' ? (
        <p role="status" className="text-[12px] text-rose-deep">
          {t('expenseSaved')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SaveButton label={manage('save')} pendingLabel={manage('saving')} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-full border border-rose-soft/45 px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-rose-deep"
        >
          {manage('cancel')}
        </button>
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
