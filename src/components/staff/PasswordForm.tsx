'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { changePassword, type PasswordState } from '@/app/actions/auth';
import type { Locale } from '@/i18n/routing';

/**
 * Setting a new password.
 *
 * A plain `<form action={...}>`, like the sign-in form, so it submits before the bundle arrives.
 * Nothing is mirrored into component state: the fields hold the password and the request takes
 * it, and neither leaves a copy anywhere a later render could read.
 *
 * `autoComplete="new-password"` on both fields is what stops a phone's password manager from
 * helpfully filling in the temporary one it just saved.
 */
export function PasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations('auth.password');
  const [state, formAction] = useActionState<PasswordState, FormData>(changePassword, {
    status: 'idle',
  });

  const passwordId = useId();
  const confirmId = useId();
  const errorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-[12px] text-ink-2">
          {t('newPassword')}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          dir="ltr"
          aria-describedby={state.status === 'error' ? errorId : undefined}
          className="rounded-[14px] border border-rose-soft/45 bg-white px-4 py-3 text-[15px] text-charcoal outline-none focus:border-rose-deep"
        />
        <span className="text-[11px] text-taupe">{t('hint')}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={confirmId} className="text-[12px] text-ink-2">
          {t('confirm')}
        </label>
        <input
          id={confirmId}
          name="confirm"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          dir="ltr"
          className="rounded-[14px] border border-rose-soft/45 bg-white px-4 py-3 text-[15px] text-charcoal outline-none focus:border-rose-deep"
        />
      </div>

      {state.status === 'error' ? (
        <p id={errorId} role="alert" className="text-[13px] text-rose-dark">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <SaveButton label={t('submit')} pendingLabel={t('saving')} />
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
      className="mt-1 min-h-[52px] cursor-pointer rounded-full bg-rose-deep px-6 text-[15px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
