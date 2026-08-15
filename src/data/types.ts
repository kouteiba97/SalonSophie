import type { Price } from '@/lib/money';
import type { Unless } from '@/lib/todo';

export type Minutes = number;

export interface ServiceCategory {
  slug: string;
  /** Canonical French label, as published on the tariff. */
  name: string;
  order: number;
}

export interface Service {
  slug: string;
  categorySlug: string;
  /**
   * Canonical French name, exactly as the salon publishes it. Locales that have a real
   * translation override this via `catalogue.services.<slug>` in their message catalogue;
   * the rest fall back to French rather than rendering blank.
   */
  name: string;
  price: Price;
  /**
   * Not known for any service (§6). The design invented values like "45 min" and "2 h";
   * they are not reproduced here.
   */
  duration: Unless<Minutes>;
  /**
   * Optional free-text qualifier that is part of the published tariff itself
   * (e.g. "offert avec tout massage"), not marketing copy.
   */
  note?: string;
}

export type GownTier = 'Essential' | 'Signature' | 'Couture';

export interface Gown {
  slug: string;
  /** Inventory name, as the atelier refers to it. */
  name: string;
  tier: GownTier;
  /** Size range — the most frequently asked question, so it shows on every card (§6). */
  sizeMin: number;
  sizeMax: number;
  /** Rental price is not known (§6). */
  rentalPrice: Unless<Price>;
  imageId: string;
}

export interface Accessory {
  slug: string;
  name: string;
  /** Rentable alongside a gown; own stock. */
  imageId?: string;
}

export interface BridalPackage {
  slug: string;
  name: string;
  /** Package prices are not known (§6). */
  price: Unless<Price>;
  /** What the package includes — structural, filled from the message catalogue. */
  includesKey: string;
}

export interface Expert {
  slug: string;
  name: string;
  /** Role line. Only Nour and Sophie are confirmed to exist (§6). */
  roleKey: string;
}
