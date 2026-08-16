'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { saveProduct, type ManagementState } from '@/app/actions/management';
import { BUSINESS_LINES, PRODUCT_UNITS } from '@/lib/management/schema';

export interface EditableProduct {
  slug: string;
  name: string;
  brand: string;
  /** Empty means shared across the three businesses rather than belonging to one. */
  line: string;
  unit: string;
  /** Dinars, as a person types them. Empty when unknown. */
  unitCost: string;
  reorderLevel: string;
  isActive: boolean;
}

const BLANK: EditableProduct = {
  slug: '',
  name: '',
  brand: '',
  line: '',
  unit: 'piece',
  unitCost: '',
  reorderLevel: '',
  isActive: true,
};

/**
 * Adding a product, or correcting one.
 *
 * Two fields carry the §6 discipline and are deliberately not required. **Unit cost** blank means
 * nobody has said what it costs, and a zero there would quietly report a 100% margin to the
 * finances screen. **Reorder level** blank means no threshold has been set, which the shelf
 * renders as "seuil non défini" — not as "stock is fine", which is what a defaulted zero would
 * silently claim about every product in the salon.
 *
 * The slug is only editable while creating: it is the key `record_stock_movement` looks a product
 * up by, so changing it later would orphan the movements that explain the current count.
 */
export function ProductEditor({
  product,
  trigger,
}: {
  product?: EditableProduct;
  /** Label for the collapsed button — "Add a product" when creating. */
  trigger: string;
}) {
  const t = useTranslations('console.stock');
  const manage = useTranslations('console.manage');
  const errors = useTranslations('console.manage.errors');
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState<ManagementState, FormData>(saveProduct, {
    status: 'idle',
  });

  const nameId = useId();
  const slugId = useId();
  const value = product ?? BLANK;
  const isNew = product === undefined;
  const [active, setActive] = useState(value.isActive);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit cursor-pointer rounded-full border border-rose-soft/45 px-4 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
      >
        {trigger}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-[16px] border border-rose-soft/40 bg-cream-warm p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={nameId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {manage('name')}
          <input
            id={nameId}
            name="name"
            defaultValue={value.name}
            required
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        {isNew ? (
          <label htmlFor={slugId} className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('slug')}
            <input
              id={slugId}
              name="slug"
              required
              pattern="[a-z0-9-]+"
              dir="ltr"
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            />
            <span className="text-[11px] text-taupe">{t('slugHint')}</span>
          </label>
        ) : (
          /* Fixed after creation: the movements that explain the count are found by it. */
          <input type="hidden" name="slug" value={value.slug} />
        )}

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('brand')}
          <input
            name="brand"
            defaultValue={value.brand}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('line')}
          <select
            name="line"
            defaultValue={value.line}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {/* Empty is a real answer: shampoo belongs to the salon, bin bags to nobody. */}
            <option value="">{t('lineShared')}</option>
            {BUSINESS_LINES.map((line) => (
              <option key={line} value={line}>
                {t(`lines.${line}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('unit')}
          <select
            name="unit"
            defaultValue={value.unit}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`units.${unit}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('unitCost')}
          <input
            name="unitCost"
            inputMode="decimal"
            defaultValue={value.unitCost}
            placeholder={t('unknownPlaceholder')}
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('reorderLevel')}
          <input
            name="reorderLevel"
            inputMode="decimal"
            defaultValue={value.reorderLevel}
            placeholder={t('unknownPlaceholder')}
            dir="ltr"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
          <span className="text-[11px] text-taupe">{t('reorderHint')}</span>
        </label>
      </div>

      {/*
        The state carries the value and a hidden field submits it. An unchecked checkbox sends
        nothing at all, and the action reads `!== 'false'` — so a bare checkbox here could tick on
        but never off, which looks like the save silently failing.
      */}
      <label className="flex items-center gap-2 text-[12px] text-ink-2">
        <input type="hidden" name="isActive" value={active ? 'true' : 'false'} />
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="size-4 accent-[var(--color-rose-deep)]"
        />
        {manage('active')}
      </label>

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
