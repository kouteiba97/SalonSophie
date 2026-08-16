import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ReservationList } from '@/components/staff/ReservationList';
import { ReserveGownForm } from '@/components/staff/ReserveGownForm';
import { GownStateBadge } from '@/components/staff/badges';
import { UtilisationBar } from '@/components/staff/UtilisationBar';
import { gownSizeLabel } from '@/data/bridal';
import { getCatalogue, findGownBySlug } from '@/data/catalogue';
import type { Gown } from '@/data/types';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getGownId, getGownStateLog, getReservationsForGown, getUtilisation } from '@/lib/atelier/repository';
import { shiftDate, type DateRange } from '@/lib/atelier/ranges';
import { utilisationOf } from '@/lib/atelier/utilisation';
import { getStaffSession, isOwner } from '@/lib/auth';
import { hasConsoleData } from '@/lib/console/demo';
import { usePrice } from '@/lib/use-price';

/**
 * One dress: what it is, where it has been, and where it is going.
 *
 * The utilisation figure here is computed in TypeScript rather than fetched from the aggregate,
 * because the reservations are already loaded to draw the history — and the pure function merges
 * overlapping spans before counting, so the number stays truthful even against rows repaired by
 * hand in the SQL console.
 */

const WINDOW_DAYS = 90;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const gown = await findGownBySlug(slug);
  const t = await getTranslations({ locale, namespace: 'atelier.gown' });
  return { title: gown ? t('title', { gown: gown.name }) : t('unknown') };
}

export default async function AtelierGownPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const gown = await findGownBySlug(slug);
  if (!gown) notFound();

  const t = await getTranslations({ locale, namespace: 'atelier.gown' });
  const session = await getStaffSession();
  const canWrite = isOwner(session);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
  const window: DateRange = { start: today, end: shiftDate(today, WINDOW_DAYS) };

  const [{ accessories }, reservations, utilisationRows, gownId] = await Promise.all([
    getCatalogue(),
    getReservationsForGown(slug),
    getUtilisation(window),
    getGownId(slug),
  ]);

  const stateLog = gownId ? await getGownStateLog(gownId) : [];
  // Null when there is no database or the read failed — the badge is then left off rather than
  // defaulted, which would be this page inventing the dress's condition.
  const state = utilisationRows.find((row) => row.slug === slug)?.state ?? null;
  const utilisation = utilisationOf(reservations, window);

  const upcoming = reservations.filter((r) => r.range.end > today);
  const past = reservations.filter((r) => r.range.end <= today).reverse();

  return (
    <div className="flex flex-col gap-9">
      <nav aria-label={t('breadcrumb')}>
        <Link href="/atelier" className="text-[13px] text-ink-2 transition-colors hover:text-rose-deep">
          ← {t('backToAtelier')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[clamp(28px,4.4vw,40px)] font-light leading-tight text-charcoal">
            {gown.name}
          </h1>
          <p className="text-[12px] uppercase tracking-[.18em] text-taupe">
            {gown.tier} · {t('sizes', { range: gownSizeLabel(gown) })}
          </p>
          <GownRentalPrice gown={gown} />
        </div>
        {state ? <GownStateBadge state={state} /> : null}
      </header>

      <section aria-labelledby="utilisation-heading" className="flex flex-col gap-3">
        <h2 id="utilisation-heading" className="sr-only">
          {t('utilisationHeading')}
        </h2>
        <div className="max-w-[420px]">
          <UtilisationBar
            reservedDays={utilisation.reservedDays}
            windowDays={utilisation.windowDays}
          />
        </div>
      </section>

      {canWrite ? (
        <section aria-labelledby="reserve-heading" className="flex flex-col gap-4">
          <h2
            id="reserve-heading"
            className="font-display text-[22px] font-light text-charcoal"
          >
            {t('reserveHeading')}
          </h2>
          <div className="rounded-[20px] border border-line bg-white px-5 py-5 sm:px-6 sm:py-6">
            <ReserveGownForm
              gownSlug={gown.slug}
              gownName={gown.name}
              accessories={accessories}
              today={today}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4">
        <h2 id="upcoming-heading" className="font-display text-[22px] font-light text-charcoal">
          {t('upcomingHeading')}
        </h2>
        <ReservationList
          reservations={upcoming}
          configured={hasConsoleData()}
          canWrite={canWrite}
          emptyHint={t('upcomingEmptyHint')}
        />
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="flex flex-col gap-4">
          <h2 id="past-heading" className="font-display text-[22px] font-light text-charcoal">
            {t('pastHeading')}
          </h2>
          <ReservationList reservations={past} configured canWrite={false} />
        </section>
      ) : null}

      <section aria-labelledby="log-heading" className="flex flex-col gap-4">
        <h2 id="log-heading" className="font-display text-[22px] font-light text-charcoal">
          {t('stateLog')}
        </h2>
        {stateLog.length === 0 ? (
          <p className="text-[13px] text-taupe">{t('stateLogEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {stateLog.map((entry) => (
              <li
                key={`${entry.createdAt}-${entry.toState}`}
                className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-2.5 text-[13px]"
              >
                <time
                  dateTime={entry.createdAt}
                  className="text-taupe"
                  suppressHydrationWarning
                >
                  {new Date(entry.createdAt).toLocaleDateString(INTL_TAG[locale], {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'Africa/Algiers',
                  })}
                </time>
                <span className="text-charcoal">
                  {entry.fromState ? `${entry.fromState} → ${entry.toState}` : entry.toState}
                </span>
                {entry.reason ? <span className="text-taupe-2">· {entry.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Rental prices were never supplied (§6) — this renders "Sur devis", never a guess. */
function GownRentalPrice({ gown }: { gown: Gown }) {
  const price = usePrice();
  return <p className="text-[14px] text-ink-2">{price(gown.rentalPrice)}</p>;
}
