import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { GownStateForm } from '@/components/staff/GownStateForm';
import { UtilisationBar } from '@/components/staff/UtilisationBar';
import { GownStateBadge } from '@/components/staff/badges';
import { getCatalogue } from '@/data/catalogue';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';
import { getReservations, getUtilisation } from '@/lib/atelier/repository';
import { shiftDate, type DateRange } from '@/lib/atelier/ranges';
import { nextReservation, reservationOn } from '@/lib/atelier/utilisation';
import { fromIsoDate } from '@/lib/datetime';
import { gownSizeLabel } from '@/data/bridal';
import { isAuthConfigured } from '@/lib/supabase/session';

/**
 * The atelier at a glance — §13's bridal surface.
 *
 * Every dress the salon owns, its physical state, how hard it has worked, and who has it. The
 * gowns themselves come from the catalogue, which reads the database when there is one and the
 * committed seed otherwise — so this page lists the three real dresses even before a Supabase
 * project exists, and simply has nothing to say about their bookings.
 */

/** Ninety days: long enough that a June wedding shows up in March, short enough to read. */
const WINDOW_DAYS = 90;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'atelier.dashboard' });
  return { title: t('title') };
}

export default async function AtelierPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'atelier.dashboard' });
  const session = await getStaffSession();
  const canWrite = isOwner(session);

  // "Today" in Africa/Algiers, not in whatever region rendered this.
  const today = salonToday();
  const window: DateRange = { start: today, end: shiftDate(today, WINDOW_DAYS) };

  const { gowns } = await getCatalogue();
  const [utilisation, reservations] = await Promise.all([
    getUtilisation(window),
    getReservations(window),
  ]);

  const utilisationBySlug = new Map(utilisation.map((u) => [u.slug, u]));
  const formatDay = (iso: string) =>
    fromIsoDate(iso).toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">
          {t('subtitle', { days: WINDOW_DAYS })}
        </p>
        {!isAuthConfigured ? (
          <p
            role="status"
            className="mt-2 rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
          >
            {t('notConfigured')}
          </p>
        ) : null}
      </header>

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {gowns.map((gown) => {
          const stats = utilisationBySlug.get(gown.slug);
          const forGown = reservations.filter((r) => r.gownSlug === gown.slug);
          const current = reservationOn(forGown, today);
          const upcoming = current ? null : nextReservation(forGown, today);
          /*
           * No stats row means the state is unknown — no database, or a read that failed. The
           * badge is then omitted entirely rather than defaulted to `available`, which would be
           * this file inventing the one fact the four states exist to record. A missing badge
           * asks a question; a wrong one answers it.
           */
          const state = stats?.state ?? null;

          return (
            <li
              key={gown.slug}
              className="flex flex-col gap-4 rounded-[20px] border border-line bg-white px-5 py-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/atelier/robes/${gown.slug}`}
                    className="font-display text-[21px] font-light text-charcoal transition-colors hover:text-rose-deep"
                  >
                    {gown.name}
                  </Link>
                  <p className="text-[12px] uppercase tracking-[.16em] text-taupe">
                    {gown.tier} · {t('sizes', { range: gownSizeLabel(gown) })}
                  </p>
                </div>
                {state ? <GownStateBadge state={state} /> : null}
              </div>

              <UtilisationBar
                reservedDays={stats?.daysReserved ?? 0}
                windowDays={WINDOW_DAYS}
              />

              <div className="min-h-[2.5rem] text-[13px] leading-[1.7]">
                {current ? (
                  <p className="text-charcoal">
                    {t('outWith', {
                      name: current.client.fullName,
                      until: formatDay(current.range.end),
                    })}
                  </p>
                ) : upcoming ? (
                  <p className="text-ink-2">
                    {t('nextOut', {
                      name: upcoming.client.fullName,
                      from: formatDay(upcoming.range.start),
                    })}
                  </p>
                ) : (
                  <p className="text-taupe">{t('noReservations')}</p>
                )}
              </div>

              {canWrite && stats && state ? (
                <details className="border-t border-line pt-3">
                  <summary className="cursor-pointer list-none text-[12px] text-rose-deep">
                    {t('manageState')}
                  </summary>
                  <div className="pt-3">
                    <GownStateForm gownId={stats.gownId} state={state} />
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** `2026-08-15` in Africa/Algiers, wherever this rendered. */
function salonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
}
