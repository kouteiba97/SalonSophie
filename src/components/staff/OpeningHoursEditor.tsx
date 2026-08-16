'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { saveOpeningHours, type ManagementState } from '@/app/actions/management';

export interface OpeningDayValue {
  weekday: number;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
}

/**
 * The week, set in one go.
 *
 * `set_business_hours` replaces every row in a single transaction rather than patching a day at
 * a time — a partial update is how a salon ends up marked open on a day it is shut, and the
 * availability engine reads this table as the truth.
 *
 * Ships empty by design: §6 lists opening hours among the things nobody has told us, and an
 * empty table says "we don't know yet" where a seeded guess would say something false to a
 * client planning her week. This form is how that stops being true.
 */
export function OpeningHoursEditor({ days }: { days: OpeningDayValue[] }) {
  const t = useTranslations('console.manage');
  const errors = useTranslations('console.manage.errors');
  const [result, formAction] = useActionState<ManagementState, FormData>(saveOpeningHours, {
    status: 'idle',
  });

  const [closed, setClosed] = useState<boolean[]>(() =>
    Array.from({ length: 7 }, (_, i) => days.find((d) => d.weekday === i)?.isClosed ?? true),
  );

  const weekdays = t.raw('weekdays') as string[];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }, (_, weekday) => {
          const day = days.find((d) => d.weekday === weekday);
          const isClosed = closed[weekday];

          return (
            <div
              key={weekday}
              className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-2.5"
            >
              <span className="min-w-[7rem] text-[13px] text-charcoal">{weekdays[weekday]}</span>

              <label className="flex items-center gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  name={`closed-${weekday}`}
                  checked={isClosed}
                  onChange={(e) =>
                    setClosed((prev) => prev.map((v, i) => (i === weekday ? e.target.checked : v)))
                  }
                  className="size-4 accent-[var(--color-rose-deep)]"
                />
                {t('closed')}
              </label>

              {/*
                Hidden rather than removed when closed: the action reads all seven days, and a
                missing field would be indistinguishable from an empty one.
              */}
              <div className={isClosed ? 'hidden' : 'flex flex-wrap items-center gap-2'}>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  {t('opens')}
                  <input
                    type="time"
                    name={`opens-${weekday}`}
                    defaultValue={day?.opensAt ?? '09:00'}
                    dir="ltr"
                    className="rounded-[10px] border border-rose-soft/45 px-2 py-1 text-[13px] text-charcoal outline-none focus:border-rose-deep"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  {t('closes')}
                  <input
                    type="time"
                    name={`closes-${weekday}`}
                    defaultValue={day?.closesAt ?? '19:00'}
                    dir="ltr"
                    className="rounded-[10px] border border-rose-soft/45 px-2 py-1 text-[13px] text-charcoal outline-none focus:border-rose-deep"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {result.status === 'error' ? (
        <p role="alert" className="text-[13px] text-rose-dark">
          {errors(result.error)}
        </p>
      ) : null}
      {result.status === 'success' ? (
        <p role="status" className="text-[13px] text-rose-deep">
          {t('saved')}
        </p>
      ) : null}

      <SaveButton label={t('save')} pendingLabel={t('saving')} />
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
      className="w-fit cursor-pointer rounded-full bg-rose-deep px-6 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark disabled:cursor-default disabled:bg-rose-deep/40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
