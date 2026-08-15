import { describe, expect, it } from 'vitest';
import { DA, addon, fixed, formatPrice, free, from, priceFloor, range } from '@/lib/money';
import { TODO_GOWN_RENTAL_PRICE } from '@/lib/todo';

const labels = {
  currency: 'DA',
  onRequest: 'Sur devis',
  from: (amount: string) => `à partir de ${amount}`,
  free: 'Offert',
};

/** Non-negotiable §7: money is integers in centimes, never floats. */
describe('money is centimes', () => {
  it('stores dinars as integer centimes', () => {
    expect(DA(700)).toBe(70_000);
    expect(DA(16_000)).toBe(1_600_000);
  });

  it('never produces a float', () => {
    for (const dinars of [200, 700, 1500, 3500, 16_000, 35_000]) {
      expect(Number.isInteger(DA(dinars))).toBe(true);
    }
  });
});

describe('formatPrice', () => {
  it('groups thousands as the published tariff does', () => {
    // fr-DZ uses a narrow no-break space; assert on the digits and separator-agnostic shape.
    expect(formatPrice(fixed(16_000), 'fr', labels).replace(/\s| | /g, '')).toBe('16000DA');
    expect(formatPrice(fixed(700), 'fr', labels)).toBe('700 DA');
  });

  it('renders a range with an en dash, both bounds', () => {
    const out = formatPrice(range(14_000, 35_000), 'fr', labels).replace(/\s| | /g, '');
    expect(out).toBe('14000–35000DA');
  });

  it('renders an open-ended floor', () => {
    expect(formatPrice(from(6_000), 'fr', labels)).toContain('à partir de');
  });

  it('renders an add-on with a plus', () => {
    expect(formatPrice(addon(500), 'fr', labels).startsWith('+')).toBe(true);
  });

  it('renders a free service as free, not as zero', () => {
    expect(formatPrice(free(), 'fr', labels)).toBe('Offert');
    expect(formatPrice(free(), 'fr', labels)).not.toContain('0');
  });

  /** Non-negotiable §12.2 — the whole point of TODO_*. */
  it('renders an unknown price as "Sur devis", never as a number', () => {
    const out = formatPrice(TODO_GOWN_RENTAL_PRICE, 'fr', labels);
    expect(out).toBe('Sur devis');
    expect(out).not.toMatch(/\d/);
  });
});

describe('priceFloor', () => {
  it('returns null for unknown and free, so neither sorts as zero', () => {
    expect(priceFloor(TODO_GOWN_RENTAL_PRICE)).toBeNull();
    expect(priceFloor(free())).toBeNull();
  });

  it('takes the lower bound of a range', () => {
    expect(priceFloor(range(14_000, 35_000))).toBe(DA(14_000));
  });
});
