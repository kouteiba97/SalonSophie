'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { createDeal, type ConsoleState } from '@/app/actions/console';

/** A new deal always starts in `pitched` — the board's first column is where a pitch lives. */
export function NewDealForm() {
  const t = useTranslations('console.deals');
  const errors = useTranslations('console.errors');
  const [state, formAction] = useActionState<ConsoleState, FormData>(createDeal, {
    status: 'idle',
  });

  const formRef = useRef<HTMLFormElement>(null);
  const brandId = useId();
  const valueId = useId();
  const contactId = useId();
  const handleId = useId();
  const actionId = useId();
  const dueId = useId();

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={brandId} label={t('brandName')}>
          <input id={brandId} name="brandName" required maxLength={120} className={INPUT} />
        </Field>

        <Field id={valueId} label={t('value')} hint={t('valueHint')}>
          <input id={valueId} name="valueDinars" type="number" min={0} step={1} dir="ltr" placeholder="—" className={INPUT} />
        </Field>

        <Field id={contactId} label={t('contactName')}>
          <input id={contactId} name="contactName" maxLength={120} className={INPUT} />
        </Field>

        <Field id={handleId} label={t('contactHandle')}>
          <input id={handleId} name="contactHandle" maxLength={120} dir="ltr" className={INPUT} />
        </Field>

        <Field id={actionId} label={t('nextAction')}>
          <input id={actionId} name="nextAction" maxLength={500} className={INPUT} />
        </Field>

        <Field id={dueId} label={t('nextActionDue')}>
          <input id={dueId} name="nextActionDue" type="date" dir="ltr" className={INPUT} />
        </Field>
      </div>

      <div aria-live="polite" className="min-h-[1.1rem]">
        {state.status === 'error' ? (
          <p role="alert" className="text-[12px] text-rose-dark">
            {errors(state.error)}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p className="text-[12px] text-rose-deep">{t('dealSaved')}</p>
        ) : null}
      </div>

      <SaveButton label={t('saveDeal')} />
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

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full bg-rose-deep px-6 py-3 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
