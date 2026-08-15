import { useLocale, useTranslations } from 'next-intl';
import { formatPrice, type Price } from './money';
import { isTodo, type Unless } from './todo';
import type { Locale } from '@/i18n/routing';

/**
 * Formats a price for the active locale. Works in Server Components — next-intl's hooks are
 * usable in both, so pricing never forces a component to the client.
 *
 * A price we were never given renders "Sur devis", never a zero and never a guess (§12.2).
 */
export function usePrice() {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');

  const labels = {
    currency: t('currency'),
    onRequest: t('onRequest'),
    from: (amount: string) => t('fromPrice', { price: amount }),
    free: t('free'),
  };

  return (price: Unless<Price>) => formatPrice(price, locale, labels);
}

/** Durations are unknown for every service (§6); this renders the em dash consistently. */
export function useDuration() {
  const t = useTranslations('common');

  return (duration: Unless<number>) => {
    if (isTodo(duration)) return t('unknown');
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes}`;
  };
}
