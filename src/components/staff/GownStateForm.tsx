'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { setGownState, type AtelierState } from '@/app/actions/atelier';
import type { GownState } from '@/lib/supabase/types';

const STATES: GownState[] = ['available', 'rented', 'cleaning', 'repair'];

/**
 * Moves a dress between its four physical states.
 *
 * Deliberately separate from the reservation lifecycle. A gown can be booked for June and
 * hanging on the rail today, or in repair with nothing booked against it at all — occupancy is
 * derived from reservations, while this is what the sisters see when they look at the rail.
 *
 * The reason is optional and free text because the interesting ones are unpredictable
 * ("fermeture cassée", "tache sur la traîne"), and it is what makes the status log worth reading
 * six months later.
 */
export function GownStateForm({ gownId, state }: { gownId: string; state: GownState }) {
  const t = useTranslations('atelier.gown');
  const stateLabels = useTranslations('atelier.states');
  const errors = useTranslations('atelier.errors');
  const [result, formAction] = useActionState<AtelierState, FormData>(setGownState, {
    status: 'idle',
  });

  const stateId = useId();
  const reasonId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="gownId" value={gownId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={stateId} className="text-[12px] text-ink-2">
          {t('changeState')}
        </label>
        <select
          id={stateId}
          name="state"
          defaultValue={state}
          className="rounded-[16px] border border-rose-soft/45 bg-white px-4 py-2.5 text-[14px] text-charcoal outline-none transition-colors focus:border-rose-deep"
        >
          {STATES.map((option) => (
            <option key={option} value={option}>
              {stateLabels(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-[12px] text-ink-2">
          {t('reason')}
        </label>
        <input
          id={reasonId}
          name="reason"
          maxLength={500}
          placeholder={t('reasonPlaceholder')}
          className="rounded-[16px] border border-rose-soft/45 bg-white px-4 py-2.5 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
      </div>

      <div aria-live="polite" className="min-h-[1.1rem]">
        {result.status === 'error' ? (
          <p role="alert" className="text-[12px] text-rose-dark">
            {errors(result.error)}
          </p>
        ) : null}
        {result.status === 'success' ? (
          <p className="text-[12px] text-rose-deep">{t('stateSaved')}</p>
        ) : null}
      </div>

      <SaveButton label={t('save')} />
    </form>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full border border-rose-soft/55 px-5 py-2.5 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
