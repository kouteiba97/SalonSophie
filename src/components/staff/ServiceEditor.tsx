'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { archiveService, saveService, type ManagementState } from '@/app/actions/management';
import { PRICE_KINDS, type PriceKindInput } from '@/lib/management/schema';

export interface EditableService {
  slug: string;
  categorySlug: string;
  name: string;
  kind: PriceKindInput;
  /** Dinars, as a person types them. Empty when unknown. */
  priceMin: string;
  priceMax: string;
  durationMinutes: string;
  bufferMinutes: string;
  isActive: boolean;
}

/**
 * Editing one line of the tariff.
 *
 * The duration field is the reason this screen exists. Every service without one keeps its
 * bookings as requests the salon has to chase, because the availability engine cannot size a
 * slot it has no length for — so filling this in is the single highest-leverage thing anyone
 * can do in the console, and it is why the field sits beside the price rather than behind a
 * second click.
 *
 * Amounts are typed and shown in dinars; centimes are the database's business, converted at the
 * schema boundary. Blank stays blank — it never becomes a zero, which would read as "free".
 */
export function ServiceEditor({
  service,
  categories,
}: {
  service: EditableService;
  categories: { slug: string; name: string }[];
}) {
  const t = useTranslations('console.manage');
  const errors = useTranslations('console.manage.errors');
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState<ManagementState, FormData>(saveService, {
    status: 'idle',
  });
  const [archiveResult, archiveAction] = useActionState<ManagementState, FormData>(archiveService, {
    status: 'idle',
  });

  const [kind, setKind] = useState<PriceKindInput>(service.kind);
  const nameId = useId();

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-full border border-rose-soft/45 px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
        >
          {t('edit')}
        </button>
        {archiveResult.status === 'error' ? (
          <span role="alert" className="text-[12px] text-rose-dark">
            {errors(archiveResult.error)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-rose-soft/40 bg-cream-warm p-4">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="slug" value={service.slug} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={nameId} className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('name')}
            <input
              id={nameId}
              name="name"
              defaultValue={service.name}
              required
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            />
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('category')}
            <select
              name="categorySlug"
              defaultValue={service.categorySlug}
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('priceKind')}
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PriceKindInput)}
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            >
              {PRICE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>

          {/* A free service carries no price at all — the database refuses one. */}
          {kind !== 'free' ? (
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              {t('priceMin')}
              <input
                name="priceMin"
                inputMode="decimal"
                defaultValue={service.priceMin}
                dir="ltr"
                className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
              />
            </label>
          ) : (
            <input type="hidden" name="priceMin" value="" />
          )}

          {kind === 'range' ? (
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              {t('priceMax')}
              <input
                name="priceMax"
                inputMode="decimal"
                defaultValue={service.priceMax}
                dir="ltr"
                className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
              />
            </label>
          ) : (
            <input type="hidden" name="priceMax" value="" />
          )}

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('duration')}
            <input
              name="durationMinutes"
              inputMode="numeric"
              placeholder={t('durationUnknown')}
              defaultValue={service.durationMinutes}
              dir="ltr"
              className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            />
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {t('buffer')}
            <input
              name="bufferMinutes"
              inputMode="numeric"
              defaultValue={service.bufferMinutes}
              dir="ltr"
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
            {t('saved')}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SaveButton label={t('save')} pendingLabel={t('saving')} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-full border border-rose-soft/45 px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-rose-deep"
          >
            {t('cancel')}
          </button>
        </div>
      </form>

      {/*
        Archive, never delete: a booked service is referenced by what a client was charged, so
        removing it would either fail on the foreign key or rewrite history.
      */}
      <form action={archiveAction} className="border-t border-line pt-3">
        <input type="hidden" name="slug" value={service.slug} />
        <input type="hidden" name="archived" value={service.isActive ? 'true' : 'false'} />
        <button
          type="submit"
          className="cursor-pointer text-[12px] text-taupe-2 underline-offset-2 transition-colors hover:text-rose-dark hover:underline"
        >
          {service.isActive ? t('archive') : t('restore')}
        </button>
      </form>
    </div>
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
