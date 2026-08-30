'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { createStaffAccount, type AccountState } from '@/app/actions/accounts';
import { STAFF_ROLES, suggestPassword } from '@/lib/accounts/schema';

/**
 * Adding someone to the team.
 *
 * The password is shown **once**, after the account is created, because that is the only moment it
 * exists in readable form — the database keeps a bcrypt hash and nothing else. There is no SMTP
 * and most of the team has no working email, so the delivery mechanism is an owner reading it out.
 * Saying so plainly on the screen is what stops someone closing the panel and losing it.
 */
export function NewStaffForm({
  people,
}: {
  people: { slug: string; displayName: string; hasAccount: boolean }[];
}) {
  const t = useTranslations('console.team');
  const errors = useTranslations('console.team.errors');
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState<AccountState, FormData>(createStaffAccount, {
    status: 'idle',
  });

  // Filled with a suggestion the owner can overwrite; never derived from the person's name.
  const [password, setPassword] = useState(suggestPassword);
  const [role, setRole] = useState<string>('reception');
  /*
   * Defaults on for a stylist and off for the desk, because that is right nearly every time — but
   * it stays a checkbox: reception who also does nails is a real person, and so is a second owner
   * who never takes a chair.
   */
  const [bookable, setBookable] = useState(false);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  const unlinked = people.filter((person) => !person.hasAccount);

  if (result.status === 'created') {
    return (
      <div className="flex flex-col gap-3 rounded-[18px] border border-rose-soft/55 bg-tint/60 p-5">
        <h3 className="font-display text-[19px] font-light text-charcoal">{t('createdTitle')}</h3>
        <p className="text-[13px] leading-[1.7] text-ink-2">{t('createdLead')}</p>

        <dl className="flex flex-col gap-2 rounded-[14px] border border-line bg-white px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-[11px] uppercase tracking-[.14em] text-taupe">{t('email')}</dt>
            <dd dir="ltr" className="text-[14px] text-charcoal">
              {result.email}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2">
            <dt className="text-[11px] uppercase tracking-[.14em] text-taupe">{t('password')}</dt>
            <dd dir="ltr" className="font-display text-[20px] text-rose-deep">
              {result.password}
            </dd>
          </div>
        </dl>

        <p className="text-[12px] leading-[1.6] text-taupe">{t('createdWarning')}</p>

        <button
          type="button"
          onClick={() => {
            setPassword(suggestPassword());
            setBookable(false);
            setOpen(false);
          }}
          className="w-fit cursor-pointer rounded-full bg-rose-deep px-5 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark"
        >
          {t('done')}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit cursor-pointer rounded-full bg-rose-deep px-5 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark"
      >
        {t('add')}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-[18px] border border-rose-soft/40 bg-cream-warm p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={nameId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('fullName')}
          <input
            id={nameId}
            name="fullName"
            required
            autoComplete="off"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
        </label>

        <label htmlFor={emailId} className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('email')}
          <input
            id={emailId}
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="off"
            placeholder="prenom@thesisters-ns.dz"
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          />
          <span className="text-[11px] text-taupe">{t('emailHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('role')}
          <select
            name="role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setBookable(event.target.value === 'stylist');
            }}
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            {STAFF_ROLES.map((value) => (
              <option key={value} value={value}>
                {t(`roles.${value}`)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-taupe">{t(`roleHints.${role}`)}</span>
        </label>

        {/*
          Two ways to become bookable: attach to a person who already exists in the book, or be
          created as a new one. Offering both matters — the first is for Nour and Sophie, who
          predate their own logins; the second is for everybody hired afterwards.
        */}
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          {t('linkStaff')}
          <select
            name="staffSlug"
            defaultValue=""
            className="rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[14px] text-charcoal outline-none focus:border-rose-deep"
          >
            <option value="">{t('linkNone')}</option>
            {unlinked.map((person) => (
              <option key={person.slug} value={person.slug}>
                {person.displayName}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-taupe">{t('linkHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-ink-2 sm:col-span-2">
          <span className="flex items-center gap-2">
            <input type="hidden" name="bookable" value={bookable ? 'true' : 'false'} />
            <input
              type="checkbox"
              checked={bookable}
              onChange={(event) => setBookable(event.target.checked)}
              className="size-4 accent-[var(--color-rose-deep)]"
            />
            {t('bookable')}
          </span>
          <span className="text-[11px] text-taupe">{t('bookableHint')}</span>
        </label>

        <label htmlFor={passwordId} className="flex flex-col gap-1 text-[12px] text-ink-2 sm:col-span-2">
          {t('tempPassword')}
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={passwordId}
              name="password"
              required
              minLength={10}
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-w-[220px] flex-1 rounded-[12px] border border-rose-soft/45 bg-white px-3 py-2.5 text-[14px] text-charcoal outline-none focus:border-rose-deep"
            />
            <button
              type="button"
              onClick={() => setPassword(suggestPassword())}
              className="cursor-pointer rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
            >
              {t('regenerate')}
            </button>
          </div>
          <span className="text-[11px] text-taupe">{t('tempPasswordHint')}</span>
        </label>
      </div>

      {result.status === 'error' ? (
        <p role="alert" className="text-[13px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton label={t('create')} pendingLabel={t('creating')} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-full border border-rose-soft/45 px-4 py-2.5 text-[13px] text-ink-2 transition-colors hover:border-rose-deep"
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
