import { isTodo, type Unless } from './todo';
import type { Locale } from '@/i18n/routing';

/**
 * Money is integers in centimes — never floats, never a bare number meaning "dinars"
 * (BUILD_BRIEF §7). 700 DA is 70_000.
 */
export type Centimes = number;

export const DA = (dinars: number): Centimes => Math.round(dinars * 100);

/**
 * The real tariff is not a flat list of numbers. It contains ranges ("14 000 – 35 000"),
 * open-ended floors ("à partir de 6 000"), an add-on ("+ 500"), and one service that is
 * free with any massage. Flattening these into a single price would misrepresent the
 * published tariff, so the shape is explicit.
 */
export type Price =
  | { kind: 'fixed'; amount: Centimes }
  | { kind: 'range'; min: Centimes; max: Centimes }
  | { kind: 'from'; amount: Centimes }
  | { kind: 'addon'; amount: Centimes }
  | { kind: 'free' };

export const fixed = (dinars: number): Price => ({ kind: 'fixed', amount: DA(dinars) });
export const range = (min: number, max: number): Price => ({
  kind: 'range',
  min: DA(min),
  max: DA(max),
});
export const from = (dinars: number): Price => ({ kind: 'from', amount: DA(dinars) });
export const addon = (dinars: number): Price => ({ kind: 'addon', amount: DA(dinars) });
export const free = (): Price => ({ kind: 'free' });

const INTL_LOCALE: Record<Locale, string> = {
  fr: 'fr-DZ',
  ar: 'ar-DZ',
  en: 'fr-DZ', // English visitors still read Algerian dinar grouping
};

/** `16 000` — grouping only; the currency word is appended by the caller's locale. */
function groupDinars(centimes: Centimes, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    maximumFractionDigits: 0,
  }).format(centimes / 100);
}

export interface PriceLabels {
  /** "DA" */
  currency: string;
  /** "Sur devis" */
  onRequest: string;
  /** Wraps a formatted amount, e.g. `16 000 DA` -> `à partir de 16 000 DA`. */
  from: (amount: string) => string;
  /** "Offert" */
  free: string;
}

/**
 * Renders a price, or "Sur devis" when we were never told what it costs.
 * Ranges render `14 000 – 35 000 DA` with an en dash, matching the published tariff.
 */
export function formatPrice(
  price: Unless<Price>,
  locale: Locale,
  labels: PriceLabels,
): string {
  if (isTodo(price)) return labels.onRequest;

  const amount = (c: Centimes) => `${groupDinars(c, locale)} ${labels.currency}`;

  switch (price.kind) {
    case 'fixed':
      return amount(price.amount);
    case 'range':
      return `${groupDinars(price.min, locale)} – ${amount(price.max)}`;
    case 'from':
      return labels.from(amount(price.amount));
    case 'addon':
      return `+ ${amount(price.amount)}`;
    case 'free':
      return labels.free;
  }
}

/** Lowest real number a price implies, for sorting and "from" badges. `null` when free. */
export function priceFloor(price: Unless<Price>): Centimes | null {
  if (isTodo(price)) return null;
  switch (price.kind) {
    case 'fixed':
    case 'from':
    case 'addon':
      return price.amount;
    case 'range':
      return price.min;
    case 'free':
      return null;
  }
}
