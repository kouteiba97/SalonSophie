import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { DayLine } from '@/components/staff/DayLine';
import { KpiCards } from '@/components/staff/KpiCards';
import { NewAppointmentModal } from '@/components/staff/NewAppointmentModal';
import { getCatalogue } from '@/data/catalogue';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getStaffSession, isFrontDesk } from '@/lib/auth';
import { dayWindow } from '@/lib/console/day-line';
import { dayKpis } from '@/lib/console/kpis';
import {
  getDayAppointments,
  getGownsOut,
  getOpeningWindows,
  getUnansweredMessages,
} from '@/lib/console/repository';
import { fromIsoDate, SALON_TIME_ZONE, toIsoDate } from '@/lib/datetime';
import { hasConsoleData } from '@/lib/console/demo';

/**
 * "Today" — the console's home, and §13's most important screen.
 *
 * The date is a URL query param rather than component state, so a link to a particular day is
 * shareable and the back button works. Same rule as the public catalogue's filters.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.today' });
  return { title: t('title') };
}

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ jour?: string }>;
}) {
  const { locale } = await params;
  const { jour } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.today' });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: SALON_TIME_ZONE }).format(new Date());
  const day = jour && ISO_DATE.test(jour) ? jour : today;

  const [appointments, openings, gownsOut, unansweredMessages, catalogue, session] =
    await Promise.all([
      getDayAppointments(day),
      getOpeningWindows(day),
      getGownsOut(day),
      getUnansweredMessages(),
      getCatalogue(),
      getStaffSession(),
    ]);

  const window = dayWindow(openings, appointments);
  const kpis = dayKpis({ appointments, gownsOut, unansweredMessages });

  const shift = (days: number) => {
    const date = fromIsoDate(day);
    date.setDate(date.getDate() + days);
    return toIsoDate(date);
  };

  const heading = fromIsoDate(day).toLocaleDateString(INTL_TAG[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
            {t('title')}
          </h1>
          <p className="text-[14px] text-ink-2 first-letter:uppercase">{heading}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Real links, so a particular day can be sent to somebody. */}
          <nav aria-label={t('dateNav')} className="flex items-center gap-2">
            <DayLink href={`/aujourdhui?jour=${shift(-1)}`} label={t('previous')} />
            {day !== today ? <DayLink href="/aujourdhui" label={t('backToToday')} /> : null}
            <DayLink href={`/aujourdhui?jour=${shift(1)}`} label={t('next')} />
          </nav>

          {/*
           * Hidden from a stylist because §7 gives them their own day, not the front desk's.
           * That is a courtesy, not the boundary: `book_appointment_as_staff` is SECURITY
           * INVOKER, so `appointments_front_desk_write` refuses them even if they reach it.
           */}
          {isFrontDesk(session) ? (
            <NewAppointmentModal services={catalogue.services} today={day} />
          ) : null}
        </div>
      </header>

      <KpiCards kpis={kpis} />

      {!hasConsoleData() ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('notConfigured')}
        </p>
      ) : window === null ? (
        /*
         * No opening hours and nothing in the book. The axis is derived rather than assumed
         * (§6 — the design's 09:00–19:00 was invented), so with neither input there is honestly
         * nothing to draw, and an empty grid would read as a closed day.
         */
        <div className="rounded-[18px] border border-line bg-white px-5 py-10 text-center">
          <p className="text-[14px] text-charcoal">{t('emptyDay')}</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[13px] leading-[1.7] text-taupe">
            {t('emptyDayHint')}
          </p>
        </div>
      ) : (
        <>
          {openings.length === 0 ? (
            <p className="text-[12px] leading-[1.6] text-taupe">{t('derivedAxis')}</p>
          ) : null}
          <DayLine appointments={appointments} window={window} />
        </>
      )}
    </div>
  );
}

function DayLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
    >
      {label}
    </Link>
  );
}
