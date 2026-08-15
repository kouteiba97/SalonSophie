'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useBooking } from './BookingProvider';
import { EXPERTS, NO_PREFERENCE } from '@/data/team';
import { formatLongDate, fromIsoDate } from '@/lib/datetime';
import type { Locale } from '@/i18n/routing';

/** One human-readable line describing the booking so far, shared by the details and done steps. */
export function useBookingSummary(): string {
  const t = useTranslations('booking');
  const team = useTranslations('team');
  const locale = useLocale() as Locale;
  const { state, catalogue } = useBooking();

  const parts: string[] = [];

  if (state.gownSlug) {
    const gown = catalogue.gowns.find((g) => g.slug === state.gownSlug);
    if (gown) parts.push(`${t('fitting')} · ${gown.name}`);
  } else if (state.serviceSlug) {
    const service = catalogue.services.find((s) => s.slug === state.serviceSlug);
    if (service) parts.push(service.name);
  }

  if (state.expertSlug) {
    const expert = EXPERTS.find((e) => e.slug === state.expertSlug);
    parts.push(expert ? expert.name : team('noPreference.name'));
  }

  if (state.date) parts.push(formatLongDate(fromIsoDate(state.date), locale));
  if (state.time) parts.push(state.time);

  return parts.join(' · ');
}

export { NO_PREFERENCE };
