'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { resetStaffPassword, setStaffActive, type AccountState } from '@/app/actions/accounts';
import { suggestPassword } from '@/lib/accounts/schema';

/**
 * Turning an account off, and resetting a forgotten password.
 *
 * Deactivation is not deletion: a worker's name is on past appointments, and those rows are the
 * record of who served whom. `set_staff_active` refuses to disable the caller's own account, so an
 * owner cannot lock themselves out of the console — a support call nobody here could answer.
 */
export function StaffActions({
  userId,
  isActive,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations('console.team');
  const errors = useTranslations('console.team.errors');

  const [activeResult, activeAction] = useActionState<AccountState, FormData>(setStaffActive, {
    status: 'idle',
  });
  const [resetResult, resetAction] = useActionState<AccountState, FormData>(resetStaffPassword, {
    status: 'idle',
  });

  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState(suggestPassword);

  return (
    <div className="flex flex-col items-start gap-2">
      {resetResult.status === 'created' ? (
        <p className="rounded-[12px] border border-rose-soft/55 bg-tint/60 px-3 py-2 text-[12px] text-ink-2">
          {t('resetDone')}{' '}
          <span dir="ltr" className="font-display text-[16px] text-rose-deep">
            {resetResult.password}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!resetting ? (
          <button
            type="button"
            onClick={() => setResetting(true)}
            className="cursor-pointer rounded-full border border-rose-soft/45 px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            {t('resetPassword')}
          </button>
        ) : (
          <form action={resetAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <input
              name="password"
              dir="ltr"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-[190px] rounded-[12px] border border-rose-soft/45 bg-white px-3 py-1.5 text-[13px] text-charcoal outline-none focus:border-rose-deep"
            />
            <PendingButton label={t('confirmReset')} pendingLabel={t('saving')} />
            <button
              type="button"
              onClick={() => setResetting(false)}
              className="cursor-pointer text-[12px] text-taupe-2 underline-offset-2 hover:underline"
            >
              {t('cancel')}
            </button>
          </form>
        )}

        {/*
          An owner disabling themselves is refused by the database, so the control is simply not
          offered — showing a button whose only outcome is an error teaches people to ignore errors.
        */}
        {!isSelf ? (
          <form action={activeAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="active" value={isActive ? 'false' : 'true'} />
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-rose-soft/45 px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-rose-dark hover:text-rose-dark"
            >
              {isActive ? t('deactivate') : t('reactivate')}
            </button>
          </form>
        ) : null}
      </div>

      {activeResult.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(activeResult.error)}
        </p>
      ) : null}
      {resetResult.status === 'error' ? (
        <p role="alert" className="text-[12px] text-rose-dark">
          {errors(resetResult.error)}
        </p>
      ) : null}
    </div>
  );
}

function PendingButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="cursor-pointer rounded-full bg-rose-deep px-4 py-1.5 text-[12px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
