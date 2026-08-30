'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { raiseAlert, type DayState } from '@/app/actions/day';

/**
 * "We are nearly out of the 7.3."
 *
 * The one piece of stock information that never comes from a counter: whoever opened the last box
 * knows before any number does. Kept to a dropdown and a sentence — a worker between two clients
 * will not fill in a quantity, and asking for one is how the feature goes unused.
 *
 * Available to every role, including a stylist, because they are the people who notice. Nothing in
 * a flag is client data.
 */
export function FlagStockForm({
  products,
}: {
  products: { slug: string; name: string }[];
}) {
  const t = useTranslations('console.myDay');
  const errors = useTranslations('console.myDay.errors');
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState<DayState, FormData>(raiseAlert, { status: 'idle' });

  if (result.status === 'success') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-rose-soft/55 bg-tint/60 px-5 py-4">
        <p role="status" className="text-[13px] text-ink-2">
          {t('flagged')}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] cursor-pointer rounded-full border border-rose-soft/55 px-4 text-[12px] text-ink-2 transition-colors hover:border-rose-deep"
        >
          {t('close')}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-fit cursor-pointer rounded-full border border-rose-soft/55 px-5 text-[13px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
      >
        {t('flagStock')}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-[18px] border border-rose-soft/40 bg-cream-warm p-4 sm:p-5"
    >
      <input type="hidden" name="kind" value="stock_low" />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('product')}
          <select
            name="productSlug"
            defaultValue=""
            className="min-h-[46px] rounded-[12px] border border-rose-soft/45 bg-white px-3 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {/* Something not on the list is still worth flagging — that is what the note is for. */}
            <option value="">{t('productOther')}</option>
            {products.map((product) => (
              <option key={product.slug} value={product.slug}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('note')}
          <input
            name="note"
            maxLength={300}
            placeholder={t('notePlaceholder')}
            className="min-h-[46px] rounded-[12px] border border-rose-soft/45 bg-white px-3 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>
      </div>

      {result.status === 'error' ? (
        <p role="alert" className="text-[13px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label={t('sendFlag')} pendingLabel={t('saving')} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] cursor-pointer rounded-full border border-rose-soft/45 px-4 text-[13px] text-ink-2 transition-colors hover:border-rose-deep"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="min-h-[44px] cursor-pointer rounded-full bg-rose-deep px-5 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
