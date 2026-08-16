'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';

import { createAppointment, findClients, type AppointmentState } from '@/app/actions/appointments';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Close } from '@/components/common/icons';
import type { Service } from '@/data/types';
import { isTodo } from '@/lib/todo';

/**
 * §13's "New appointment" — the console's most-used write.
 *
 * Four steps, in the order §13 lists them: business line → service → expert → slot and client.
 *
 * It deliberately does NOT reuse the public modal's month calendar. That calendar exists to
 * *sell* — it shows a bride what is open and hides what is not. Reception already knows the
 * date, usually because the client is standing at the desk saying it out loud, so a date field
 * they can type into is faster than three taps through a grid. Same rule as everywhere else:
 * optimise the public surface for persuasion and the console for speed.
 *
 * The slot guarantee does not live here either way — it lives in the exclusion constraint, and a
 * taken slot comes back as `slot_taken` no matter which surface asked for it.
 */

type Line = 'salon' | 'bridal' | 'makeup';
type ClientHit = Awaited<ReturnType<typeof findClients>>[number];

const LINES: Line[] = ['salon', 'bridal', 'makeup'];
const STAFF = ['nour', 'sophie'] as const;

const field =
  'w-full rounded-[16px] border border-rose-soft/45 bg-white px-4 py-2.5 text-[14px] text-charcoal outline-none transition-colors focus:border-rose-deep';

function Choice({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full flex-col items-start gap-0.5 rounded-[18px] border px-4 py-3 text-start transition-colors ${
        selected
          ? 'border-rose-deep bg-tint text-charcoal'
          : 'border-line bg-white text-ink-2 hover:border-rose-soft'
      }`}
    >
      <span className="text-[14px] text-charcoal">{title}</span>
      {hint ? <span className="text-[12px] text-taupe-2">{hint}</span> : null}
    </button>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-rose-deep px-6 py-2.5 text-[13px] tracking-wide text-white transition-colors hover:bg-rose-dark disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

export function NewAppointmentModal({ services, today }: { services: Service[]; today: string }) {
  const t = useTranslations('console.newAppointment');
  const errors = useTranslations('console.newAppointment.errors');
  const team = useTranslations('team');

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [line, setLine] = useState<Line>('salon');
  const [serviceSlug, setServiceSlug] = useState('');
  const [staffSlug, setStaffSlug] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [client, setClient] = useState<ClientHit | null>(null);
  const [, startSearch] = useTransition();

  const [result, formAction] = useActionState<AppointmentState, FormData>(createAppointment, {
    status: 'idle',
  });

  const searchId = useId();
  const nameId = useId();
  const phoneId = useId();
  const dateId = useId();
  const timeId = useId();
  const notesId = useId();
  const liveRef = useRef<HTMLParagraphElement>(null);

  const service = useMemo(
    () => services.find((s) => s.slug === serviceSlug),
    [services, serviceSlug],
  );

  /**
   * Today every duration is unknown (§6), so a per-row "no duration" hint would repeat itself
   * forty times and say nothing about any particular service. Said once, above the list, it is
   * the same honest fact without the noise. The moment real durations start landing the hint
   * becomes distinguishing again, and moves back onto the rows that still lack one.
   */
  const everyDurationUnknown = useMemo(
    () => services.every((s) => isTodo(s.duration)),
    [services],
  );

  /** Debounced at 250ms — the same rule the public search follows, for the same reason. */
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => setHits(await findClients(query)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const reset = () => {
    setStep(1);
    setServiceSlug('');
    setStaffSlug('');
    setQuery('');
    setHits([]);
    setClient(null);
  };

  const stepTitles = [t('steps.line'), t('steps.service'), t('steps.staff'), t('steps.details')];
  const canContinue = step === 1 || (step === 2 && serviceSlug) || step === 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-rose-deep px-5 py-2.5 text-[13px] tracking-wide text-white transition-colors hover:bg-rose-dark"
        >
          {t('open')}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-[560px] gap-4 overflow-y-auto p-6 sm:w-[min(560px,calc(100vw-32px))]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="font-display text-[24px] font-light text-charcoal">
              {t('title')}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-taupe-2">
              {t('step', { current: step })} · {stepTitles[step - 1]}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t('close')}
            className="rounded-full p-1.5 text-taupe-2 transition-colors hover:bg-tint hover:text-charcoal"
          >
            <Close className="h-4 w-4" />
          </DialogClose>
        </div>

        <p ref={liveRef} aria-live="polite" className="sr-only">
          {t('stepAnnounce', { current: step, title: stepTitles[step - 1] })}
        </p>

        {result.status === 'success' ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="font-display text-[20px] font-light text-charcoal">
              {result.isRequest ? t('requestTitle') : t('bookedTitle')}
            </p>
            <p className="text-[13px] text-ink-2">{t('reference', { ref: result.reference })}</p>
            {result.isRequest ? (
              <p className="rounded-[16px] bg-tint px-4 py-3 text-[12px] leading-relaxed text-ink-2">
                {t('requestNote')}
              </p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-rose-soft/60 px-5 py-2.5 text-[13px] text-charcoal transition-colors hover:bg-tint"
              >
                {t('another')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-rose-deep px-5 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark"
              >
                {t('close')}
              </button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="line" value={line} />
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input type="hidden" name="staffSlug" value={staffSlug} />
            <input type="hidden" name="clientId" value={client?.id ?? ''} />

            {step === 1 ? (
              <div className="flex flex-col gap-2">
                {LINES.map((option) => (
                  <Choice
                    key={option}
                    selected={line === option}
                    onSelect={() => setLine(option)}
                    title={t(`lines.${option}`)}
                  />
                ))}
              </div>
            ) : null}

            {step === 2 ? (
              <>
                {everyDurationUnknown ? (
                  <p className="rounded-[16px] bg-tint px-4 py-3 text-[12px] leading-relaxed text-ink-2">
                    {t('noDurationAll')}
                  </p>
                ) : null}
                <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pe-1">
                  {services.map((option) => (
                    <Choice
                      key={option.slug}
                      selected={serviceSlug === option.slug}
                      onSelect={() => setServiceSlug(option.slug)}
                      title={option.name}
                      hint={
                        !everyDurationUnknown && isTodo(option.duration)
                          ? t('noDuration')
                          : undefined
                      }
                    />
                  ))}
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <div className="flex flex-col gap-2">
                <Choice
                  selected={staffSlug === ''}
                  onSelect={() => setStaffSlug('')}
                  title={t('anyStaff')}
                />
                {STAFF.map((slug) => (
                  <Choice
                    key={slug}
                    selected={staffSlug === slug}
                    onSelect={() => setStaffSlug(slug)}
                    title={slug === 'nour' ? 'Nour' : 'Sophie'}
                    hint={team(`${slug}.role`)}
                  />
                ))}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={dateId} className="text-[12px] text-ink-2">
                      {t('date')}
                    </label>
                    <input
                      id={dateId}
                      name="date"
                      type="date"
                      defaultValue={today}
                      min={today}
                      required
                      className={field}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={timeId} className="text-[12px] text-ink-2">
                      {t('time')}
                    </label>
                    <input
                      id={timeId}
                      name="time"
                      type="time"
                      defaultValue="10:00"
                      required
                      className={field}
                    />
                  </div>
                </div>

                {client ? (
                  <div className="flex items-center justify-between gap-3 rounded-[18px] border border-rose-deep bg-tint px-4 py-3">
                    <div>
                      <p className="text-[12px] text-taupe-2">{t('chosen')}</p>
                      <p className="text-[14px] text-charcoal">{client.full_name}</p>
                      <p className="text-[12px] text-ink-2">{client.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClient(null)}
                      className="rounded-full border border-rose-soft/60 px-3 py-1.5 text-[12px] text-charcoal transition-colors hover:bg-white"
                    >
                      {t('change')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={searchId} className="text-[12px] text-ink-2">
                        {t('clientSearch')}
                      </label>
                      <input
                        id={searchId}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className={field}
                      />
                      <p className="text-[11px] text-taupe-2">{t('clientSearchHint')}</p>
                    </div>

                    {hits.length > 0 ? (
                      <ul className="flex flex-col gap-1.5">
                        {hits.map((hit) => (
                          <li key={hit.id}>
                            <Choice
                              selected={false}
                              onSelect={() => {
                                setClient(hit);
                                setQuery('');
                                setHits([]);
                              }}
                              title={hit.full_name}
                              hint={`${hit.phone} · ${t('visits', { count: hit.visits })}`}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <fieldset className="flex flex-col gap-3 rounded-[18px] border border-line p-4">
                      <legend className="px-1 text-[12px] text-taupe-2">{t('newClient')}</legend>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={nameId} className="text-[12px] text-ink-2">
                          {t('clientName')}
                        </label>
                        <input
                          id={nameId}
                          name="clientName"
                          type="text"
                          maxLength={80}
                          className={field}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={phoneId} className="text-[12px] text-ink-2">
                          {t('clientPhone')}
                        </label>
                        <input
                          id={phoneId}
                          name="clientPhone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="0553366712"
                          className={field}
                        />
                      </div>
                    </fieldset>
                  </>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={notesId} className="text-[12px] text-ink-2">
                    {t('notes')}
                  </label>
                  <textarea id={notesId} name="notes" rows={2} maxLength={500} className={field} />
                </div>

                {service && isTodo(service.duration) ? (
                  <p className="rounded-[16px] bg-tint px-4 py-3 text-[12px] leading-relaxed text-ink-2">
                    {t('noDuration')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {result.status === 'error' ? (
              <p
                role="alert"
                className="rounded-[16px] bg-blush/50 px-4 py-3 text-[12px] text-charcoal"
              >
                {errors(result.error)}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(1, current - 1))}
                disabled={step === 1}
                className="rounded-full border border-rose-soft/60 px-5 py-2.5 text-[13px] text-charcoal transition-colors hover:bg-tint disabled:opacity-40"
              >
                {t('back')}
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => current + 1)}
                  disabled={!canContinue}
                  className="rounded-full bg-rose-deep px-6 py-2.5 text-[13px] tracking-wide text-white transition-colors hover:bg-rose-dark disabled:opacity-40"
                >
                  {t('next')}
                </button>
              ) : (
                <Submit label={t('confirm')} busy={t('submitting')} />
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
