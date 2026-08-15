'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { signIn, type SignInState } from '@/app/actions/auth';
import type { Locale } from '@/i18n/routing';

/**
 * Email and password, posted to a server action.
 *
 * A plain `<form action={...}>` rather than a fetch: it submits and works before the bundle
 * arrives, which on a mid-range Android on Algerian 4G is a state the salon will actually hit.
 * `useActionState` adds the error message once hydrated without taking that away.
 *
 * No password is ever held in component state, and the field is never mirrored anywhere.
 */
export function SignInForm({ locale }: { locale: Locale }) {
  const t = useTranslations('auth.signIn');
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, { status: 'idle' });
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-[12px] text-ink-2">
          {t('email')}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          dir="ltr"
          aria-invalid={state.status === 'error' ? true : undefined}
          aria-describedby={state.status === 'error' ? errorId : undefined}
          className="rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-[12px] text-ink-2">
          {t('password')}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          aria-invalid={state.status === 'error' ? true : undefined}
          aria-describedby={state.status === 'error' ? errorId : undefined}
          className="rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors focus:border-rose-deep"
        />
      </div>

      {/*
        role="alert" so the failure is announced rather than merely coloured. Always rendered as
        a live region host would be overkill for a form that reloads; the alert role suffices
        because the node appears on failure.
      */}
      {state.status === 'error' ? (
        <p id={errorId} role="alert" className="text-[13px] leading-[1.6] text-rose-dark">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <SubmitButton label={t('submit')} pendingLabel={t('submitPending')} />
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  // useFormStatus must be read from a child of the form, not the component that renders it.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
