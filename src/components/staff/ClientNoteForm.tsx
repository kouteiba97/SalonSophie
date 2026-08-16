'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { addClientNote, type ConsoleState } from '@/app/actions/console';

/**
 * The colour formula, the allergy, the wedding date (§13).
 *
 * These are the details that currently live in somebody's memory, which is the problem the whole
 * console exists to solve: a colour formula nobody wrote down is a colour nobody can repeat.
 * Free text on purpose — the interesting ones are unpredictable, and a form with fields for
 * "colour" and "allergy" would quietly refuse everything else.
 */
export function ClientNoteForm({ clientId }: { clientId: string }) {
  const t = useTranslations('console.client');
  const errors = useTranslations('console.errors');
  const [state, formAction] = useActionState<ConsoleState, FormData>(addClientNote, {
    status: 'idle',
  });

  const bodyId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        // Clearing after a successful write keeps the box ready for the next thought rather
        // than leaving the last note sitting there to be accidentally saved twice.
        formRef.current?.reset();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className="text-[12px] text-ink-2">
          {t('addNote')}
        </label>
        <textarea
          id={bodyId}
          name="body"
          rows={3}
          required
          maxLength={2000}
          placeholder={t('notePlaceholder')}
          className="resize-none rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
      </div>

      <div aria-live="polite" className="min-h-[1.1rem]">
        {state.status === 'error' ? (
          <p role="alert" className="text-[12px] text-rose-dark">
            {errors(state.error)}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p className="text-[12px] text-rose-deep">{t('noteSaved')}</p>
        ) : null}
      </div>

      <SaveButton label={t('saveNote')} />
    </form>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full bg-rose-deep px-6 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
