import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ReservationList } from '@/components/staff/ReservationList';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getReservations } from '@/lib/atelier/repository';
import { shiftDate, type DateRange } from '@/lib/atelier/ranges';
import { occupies, type ReservationStatus } from '@/lib/atelier/types';
import { getStaffSession, isOwner } from '@/lib/auth';
import { isAuthConfigured } from '@/lib/supabase/session';
import { cn } from '@/lib/utils';

/**
 * Every reservation touching the next year, filtered by status.
 *
 * The filter is a URL query parameter rather than component state, so a link to "everything
 * currently held" is shareable and the back button works — the same rule the public catalogue
 * follows for its category filter.
 */

const HORIZON_DAYS = 365;

const FILTERS = ['active', 'held', 'confirmed', 'returned', 'cancelled', 'all'] as const;
type Filter = (typeof FILTERS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'atelier.reservations' });
  return { title: t('title') };
}

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ statut?: string }>;
}) {
  const { locale } = await params;
  const { statut } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'atelier.reservations' });
  const session = await getStaffSession();
  const canWrite = isOwner(session);

  const filter: Filter = (FILTERS as readonly string[]).includes(statut ?? '')
    ? (statut as Filter)
    : 'active';

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
  const window: DateRange = { start: today, end: shiftDate(today, HORIZON_DAYS) };

  const all = await getReservations(window);
  const reservations = all.filter((reservation) => matches(reservation.status, filter));

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle', { days: HORIZON_DAYS })}</p>
      </header>

      {/*
        Real links, not buttons that push state: each filter is an address. `aria-current` marks
        the active one for a screen reader, since the visual treatment alone says nothing.
      */}
      <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = option === filter;
          return (
            <Link
              key={option}
              href={option === 'active' ? '/atelier/reservations' : `/atelier/reservations?statut=${option}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-4 py-2 text-[12px] transition-colors',
                active
                  ? 'border-rose-deep bg-rose-deep text-white'
                  : 'border-rose-soft/55 text-ink-2 hover:border-rose-deep hover:text-rose-deep',
              )}
            >
              {t(`filters.${option}`)}
            </Link>
          );
        })}
      </nav>

      <ReservationList
        reservations={reservations}
        configured={isAuthConfigured}
        canWrite={canWrite}
        emptyHint={filter === 'active' ? undefined : t('emptyFilteredHint')}
      />
    </div>
  );
}

/** `active` is the pair the exclusion constraint counts — the dresses actually spoken for. */
function matches(status: ReservationStatus, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return occupies(status);
  return status === filter;
}
