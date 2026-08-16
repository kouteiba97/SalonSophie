'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { saveAccessoryStock, type ManagementState } from '@/app/actions/management';

/**
 * How many of an accessory the salon owns.
 *
 * One field, because that is genuinely the whole gap: the three accessories are seeded and real
 * (§6), and only their counts were never supplied. Leaving it blank writes 0, which means
 * *uncounted* rather than "none" — `check_accessory_stock` skips its limit on zero precisely so
 * an uncounted rail does not block every loan the salon actually makes.
 *
 * That is why counting is worth doing rather than merely tidy: until a number exists, nothing
 * stops the desk promising the same veil to two brides on the same Saturday.
 */
export function AccessoryStockForm({ slug, stockTotal }: { slug: string; stockTotal: number }) {
  const t = useTranslations('console.stock');
  const errors = useTranslations('console.manage.errors');
  const manage = useTranslations('console.manage');
  const [result, formAction] = useActionState<ManagementState, FormData>(saveAccessoryStock, {
    status: 'idle',
  });
  const countId = useId();

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="slug" value={slug} />

      <label htmlFor={countId} className="flex flex-col gap-1 text-[12px] text-ink-2">
        {t('owned')}
        <input
          id={countId}
          name="stockTotal"
          inputMode="numeric"
          // 0 is stored but never shown back as a count — it is the absence of one.
          defaultValue={stockTotal > 0 ? String(stockTotal) : ''}
          placeholder={t('uncountedPlaceholder')}
          dir="ltr"
          className="w-24 rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
        />
      </label>

      <SaveButton label={manage('save')} pendingLabel={manage('saving')} />

      {result.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}
      {result.status === 'success' ? (
        <p role="status" className="text-[12px] text-rose-deep">
          {manage('saved')}
        </p>
      ) : null}
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
      className="cursor-pointer rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:cursor-default disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
