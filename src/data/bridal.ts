import { TODO_GOWN_RENTAL_PRICE, TODO_PACKAGE_PRICE } from '@/lib/todo';
import type { Accessory, BridalPackage, Gown } from './types';

/**
 * Bridal inventory — BUILD_BRIEF §6.
 *
 * Gown names, size ranges and tiers come from the approved design (the brief does not list them
 * among the unknowns, and sizes are the most-asked question so they appear on every card).
 * Rental prices are unknown and render "Sur devis" — the design's 38 000 / 45 000 / 55 000 were
 * invented, as were the 65 000 / 95 000 / 140 000 package prices.
 *
 * A gown is rented over an interval, never booked as a point in time. Nothing here creates a
 * reservation; choosing a gown in the booking flow schedules a *fitting* (§5.3 item 10).
 */

export const GOWNS: Gown[] = [
  {
    slug: 'anastasia',
    name: 'Anastasia',
    tier: 'Signature',
    sizeMin: 36,
    sizeMax: 42,
    rentalPrice: TODO_GOWN_RENTAL_PRICE,
    imageId: 'ns-gown-anastasia',
  },
  {
    slug: 'abir',
    name: 'ABir',
    tier: 'Essential',
    sizeMin: 38,
    sizeMax: 44,
    rentalPrice: TODO_GOWN_RENTAL_PRICE,
    imageId: 'ns-gown-abir',
  },
  {
    slug: 'ryma',
    name: 'RYMA',
    tier: 'Couture',
    sizeMin: 36,
    sizeMax: 40,
    rentalPrice: TODO_GOWN_RENTAL_PRICE,
    imageId: 'ns-gown-ryma',
  },
];

/** Separate stock, rentable alongside a gown (§6). */
export const ACCESSORIES: Accessory[] = [
  { slug: 'barnous', name: 'Barnous' },
  { slug: 'diademe', name: 'Diadème' },
  { slug: 'voile', name: 'Voile' },
];

export const BRIDAL_PACKAGES: BridalPackage[] = [
  { slug: 'essential', name: 'Forfait Essential', price: TODO_PACKAGE_PRICE, includesKey: 'bridal.packages.essential.includes' },
  { slug: 'signature', name: 'Forfait Signature', price: TODO_PACKAGE_PRICE, includesKey: 'bridal.packages.signature.includes' },
  { slug: 'couture', name: 'Forfait Couture', price: TODO_PACKAGE_PRICE, includesKey: 'bridal.packages.couture.includes' },
];

export const findGown = (slug: string): Gown | undefined => GOWNS.find((g) => g.slug === slug);

export const gownSizeLabel = (gown: Gown): string => `${gown.sizeMin} – ${gown.sizeMax}`;
