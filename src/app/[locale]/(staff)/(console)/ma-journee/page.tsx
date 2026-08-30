import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AppointmentCard } from '@/components/staff/AppointmentCard';
import { FlagStockForm } from '@/components/staff/FlagStockForm';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getStaffSession, isFrontDesk } from '@/lib/auth';
import { awaitsAction, type ConsoleAppointment } from '@/lib/console/day-line';
import { hasConsoleData } from '@/lib/console/demo';
import { getDayAppointments } from '@/lib/console/repository';
import { getProductStock } from '@/lib/console/stock';
import { fromIsoDate, type IsoDate } from '@/lib/datetime';

/**
 * The worker's screen — "my day".
 *
 * Deliberately not the day-line. That timeline is a desk instrument: it answers "how does the
 * whole salon look at 14:00", which is a question an owner asks sitting down. A stylist between
 * two clients is holding a phone in one hand and asking a different question — *who is next, and
 * what do I press when they leave*. So this is a list, in time order, with the actions on the card.
 *
 * It shows the same data through the same policies. A stylist sees their own appointments because
 * `appointments_read` says so; reception sees the whole floor for the same reason. Nothing here
 * decides that — it just stops presenting a wall chart to somebody standing up.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.myDay' });
  return { title: t('title') };
}

/** `2026-08-30` in Africa/Algiers, wherever this rendered. */
function salonToday(): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Minutes since midnight in the salon's timezone, for "what is next". */
function nowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Algiers',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export default async function MyDayPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.myDay' });
  const today = salonToday();

  const session = await getStaffSession();
  const [appointments, products] = await Promise.all([
    getDayAppointments(today),
    // A stylist gets nothing from `products_front_desk_read`; the flag form then offers "other".
    getProductStock(),
  ]);

  const live = appointments.filter(awaitsAction);
  const settled = appointments.filter((a) => !awaitsAction(a));
  const minutes = nowMinutes();

  /*
   * "Next" is the first appointment that has not started yet, or the one running now. Falling back
   * to the first of the day means the card is never empty at 08:50, before anything has begun.
   */
  const next =
    live.find((a) => (a.endMinute ?? a.startMinute + 60) >= minutes) ?? live[0] ?? null;

  const dayLabel = fromIsoDate(today).toLocaleDateString(INTL_TAG[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-[12px] uppercase tracking-[.16em] text-taupe">{dayLabel}</p>
        <h1 className="font-display text-[clamp(26px,5vw,36px)] font-light leading-tight text-charcoal">
          {t('greeting', { name: session?.fullName ?? '' })}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">
          {live.length > 0 ? t('summary', { count: live.length }) : t('summaryEmpty')}
        </p>

        {!hasConsoleData() ? (
          <p
            role="status"
            className="mt-2 rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('notConfigured')}
          </p>
        ) : null}
      </header>

      {/*
        The next client, called out.

        On a phone this is the whole reason the screen gets opened, so it is not made to compete
        with a list of twelve identical cards below it.
      */}
      {next ? (
        <section
          aria-labelledby="next-client"
          className="flex flex-col gap-1 rounded-[22px] border border-rose-soft/55 bg-tint/50 px-5 py-5"
        >
          <h2 id="next-client" className="text-[11px] uppercase tracking-[.16em] text-rose-deep">
            {t('nextUp')}
          </h2>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[clamp(30px,7vw,40px)] leading-none text-rose-deep">
              {next.endMinute === null ? '—' : clock(next.startMinute)}
            </span>
            <span className="text-[17px] text-charcoal">{next.clientName}</span>
          </p>
          <p className="text-[13px] text-ink-2">
            {next.serviceName ?? next.gownName ?? t('noService')}
          </p>
        </section>
      ) : null}

      <FlagStockForm products={products.map((p) => ({ slug: p.slug, name: p.name }))} />

      <section aria-labelledby="my-day-list" className="flex flex-col gap-3">
        <h2 id="my-day-list" className="font-display text-[21px] font-light text-charcoal">
          {t('listTitle')}
        </h2>

        {live.length === 0 ? (
          <p className="rounded-[18px] border border-line bg-white px-5 py-6 text-[14px] leading-[1.7] text-ink-2">
            {t('empty')}
          </p>
        ) : (
          /*
            One column on a phone, two from tablet up.
            
            The breakpoint is `md` (768px) rather than `lg`, because at `lg` a tablet held in either
            orientation still got a single column of very wide cards with a lot of empty space to
            the side. Two ~350px cards is close to the phone card's proportions, which is the shape
            these were designed at.
          */
          <ul className="grid gap-3 md:grid-cols-2">
            {live.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                timeLabel={timeOf(appointment, t('requested'))}
                canTakePayment={isFrontDesk(session)}
              />
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 ? (
        <section aria-labelledby="my-day-done" className="flex flex-col gap-3">
          <h2 id="my-day-done" className="font-display text-[19px] font-light text-taupe-2">
            {t('doneTitle', { count: settled.length })}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {settled.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                timeLabel={timeOf(appointment, t('requested'))}
                canTakePayment={false}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A request has no end time because nobody supplied a duration, so it shows the asked-for hour. */
function timeOf(appointment: ConsoleAppointment, requestedLabel: string): string {
  const start = `${String(Math.floor(appointment.startMinute / 60)).padStart(2, '0')}:${String(
    appointment.startMinute % 60,
  ).padStart(2, '0')}`;
  return appointment.endMinute === null ? `${start} ${requestedLabel}` : start;
}
