'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { reserveGown, type AtelierState } from '@/app/actions/atelier';
import type { Accessory } from '@/data/types';
import { cn } from '@/lib/utils';

/**
 * Taking a gown out of the atelier.
 *
 * The form asks for the first and last day the bride *has* the dress, because that is the
 * question the front desk asks her — not for a half-open range, which is an implementation
 * detail of the constraint protecting her. The conversion happens in one place, in the database
 * function.
 *
 * Everything the form can get wrong, it can get wrong twice: once here for a fast, specific
 * message, and once inside the transaction where it actually matters. The second check is the
 * real one. `double_booked` in particular can only be discovered there — between drawing this
 * form and submitting it, someone else may have taken the week.
 */
export function ReserveGownForm({
  gownSlug,
  gownName,
  accessories,
  today,
}: {
  gownSlug: string;
  gownName: string;
  accessories: Accessory[];
  /** Today in the salon's timezone, resolved on the server so the input floor is not the
   *  browser's idea of today. */
  today: string;
}) {
  const t = useTranslations('atelier.reserve');
  const errors = useTranslations('atelier.errors');
  const [state, formAction] = useActionState<AtelierState, FormData>(reserveGown, {
    status: 'idle',
  });

  const [firstDay, setFirstDay] = useState('');

  const firstDayId = useId();
  const lastDayId = useId();
  const nameId = useId();
  const phoneId = useId();
  const bufferId = useId();
  const depositId = useId();
  const notesId = useId();
  const statusId = useId();
  const feedbackId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="gownSlug" value={gownSlug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={nameId} label={t('clientName')}>
          <input
            id={nameId}
            name="clientName"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            className={INPUT}
          />
        </Field>

        <Field id={phoneId} label={t('clientPhone')} hint={t('phoneHint')}>
          <input
            id={phoneId}
            name="clientPhone"
            required
            inputMode="tel"
            dir="ltr"
            placeholder="0553366712"
            className={INPUT}
          />
        </Field>

        <Field id={firstDayId} label={t('firstDay')}>
          <input
            id={firstDayId}
            name="firstDay"
            type="date"
            required
            min={today}
            value={firstDay}
            onChange={(event) => setFirstDay(event.target.value)}
            dir="ltr"
            className={INPUT}
          />
        </Field>

        <Field id={lastDayId} label={t('lastDay')}>
          {/* Floors the last day at the first, so the impossible range cannot be typed at all. */}
          <input
            id={lastDayId}
            name="lastDay"
            type="date"
            required
            min={firstDay || today}
            dir="ltr"
            className={INPUT}
          />
        </Field>

        <Field id={bufferId} label={t('buffer')} hint={t('bufferHint')}>
          <input
            id={bufferId}
            name="cleaningBufferDays"
            type="number"
            min={0}
            max={60}
            defaultValue={0}
            dir="ltr"
            className={INPUT}
          />
        </Field>

        <Field id={depositId} label={t('deposit')} hint={t('depositHint')}>
          <input
            id={depositId}
            name="depositDinars"
            type="number"
            min={0}
            step={1}
            dir="ltr"
            placeholder="—"
            className={INPUT}
          />
        </Field>
      </div>

      <Field id={statusId} label={t('status')} hint={t('statusHint')}>
        <select id={statusId} name="status" defaultValue="held" className={INPUT}>
          <option value="held">{t('statusHeld')}</option>
          <option value="confirmed">{t('statusConfirmed')}</option>
        </select>
      </Field>

      {accessories.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12px] text-ink-2">{t('accessories')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {accessories.map((accessory) => (
              <label key={accessory.slug} className="flex items-center gap-2 text-[14px] text-charcoal">
                <input
                  type="checkbox"
                  name="accessorySlugs"
                  value={accessory.slug}
                  className="size-4 accent-[var(--color-rose-deep)]"
                />
                {accessory.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Field id={notesId} label={t('notes')}>
        <textarea id={notesId} name="notes" rows={3} maxLength={1000} className={cn(INPUT, 'resize-none')} />
      </Field>

      {/*
        Both outcomes announce. A reservation that silently succeeded looks identical to one that
        silently failed, and the difference is a dress.
      */}
      <div id={feedbackId} aria-live="polite" className="min-h-[1.25rem]">
        {state.status === 'error' ? (
          <p role="alert" className="text-[13px] leading-[1.6] text-rose-dark">
            {errors(state.error)}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p className="text-[13px] leading-[1.6] text-rose-deep">
            {t('success', { gown: gownName, reference: state.reference ?? '—' })}
          </p>
        ) : null}
      </div>

      <SubmitButton label={t('submit')} pendingLabel={t('submitPending')} />
    </form>
  );
}

const INPUT =
  'w-full rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep';

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-[1.6] text-taupe">{hint}</p> : null}
    </div>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
