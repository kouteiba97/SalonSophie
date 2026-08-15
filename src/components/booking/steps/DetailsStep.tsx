'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { bookingDetailsSchema, type BookingDetails } from '../booking-schema';
import { useBookingSummary } from '../useBookingSummary';
import { cn } from '@/lib/utils';

export const DETAILS_FORM_ID = 'ns-booking-details';

/**
 * Step 4 — the client's details.
 *
 * React Hook Form + Zod (§5.2 item 4, §5.4 item 18). The design had two uncontrolled inputs and
 * a button that only checked they were non-empty, so "abc" passed as a phone number and the
 * booking was unreachable.
 *
 * Errors are tied to their input with `aria-describedby` and `aria-invalid`, so a screen reader
 * hears the problem on the field rather than seeing red text it never announces.
 */
export function DetailsStep({ onValid }: { onValid: (details: BookingDetails) => void }) {
  const t = useTranslations('booking.form');
  const summary = useBookingSummary();
  const nameId = useId();
  const phoneId = useId();
  const notesId = useId();

  const schema = bookingDetailsSchema({
    nameRequired: t('errors.nameRequired'),
    nameTooShort: t('errors.nameTooShort'),
    phoneRequired: t('errors.phoneRequired'),
    phoneInvalid: t('errors.phoneInvalid'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingDetails>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  return (
    <form id={DETAILS_FORM_ID} onSubmit={handleSubmit(onValid)} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={nameId}
          label={t('name')}
          placeholder={t('namePlaceholder')}
          error={errors.name?.message}
          autoComplete="name"
          {...register('name')}
        />
        <Field
          id={phoneId}
          label={t('phone')}
          placeholder={t('phonePlaceholder')}
          error={errors.phone?.message}
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          {...register('phone')}
        />
      </div>

      <label htmlFor={notesId} className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ink-2">{t('notes')}</span>
        <textarea
          id={notesId}
          rows={3}
          placeholder={t('notesPlaceholder')}
          {...register('notes')}
          className="resize-none rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
      </label>

      <div className="rounded-[16px] border border-rose-soft/30 bg-tint/60 px-4 py-3.5">
        <p className="text-[11px] uppercase tracking-[.2em] text-taupe">{t('summary')}</p>
        <p className="mt-1 text-[14px] leading-[1.6] text-charcoal">
          {summary || t('summaryEmpty')}
        </p>
      </div>
    </form>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

function Field({ id, label, error, className, ...props }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] text-ink-2">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'rounded-[16px] border bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted',
          error ? 'border-rose-dark' : 'border-rose-soft/45 focus:border-rose-deep',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-rose-dark">
          {error}
        </p>
      ) : null}
    </div>
  );
}
