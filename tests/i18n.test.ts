import { describe, expect, it } from 'vitest';
import fr from '../messages/fr.json';
import ar from '../messages/ar.json';
import en from '../messages/en.json';

/**
 * Non-negotiable §12.3: Arabic must be correct on every screen, tested before English.
 *
 * A missing key renders as a raw dotted path in front of a client, so key parity is asserted
 * rather than hoped for — a forgotten translation fails here instead of shipping.
 */

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  if (Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const frKeys = flatten(fr).sort();
const arKeys = flatten(ar).sort();
const enKeys = flatten(en).sort();

describe('message catalogues', () => {
  it('Arabic has every key French has', () => {
    expect(arKeys).toEqual(frKeys);
  });

  it('English has every key French has', () => {
    expect(enKeys).toEqual(frKeys);
  });

  it('leaves no value empty in any locale', () => {
    for (const [name, catalogue] of [
      ['fr', fr],
      ['ar', ar],
      ['en', en],
    ] as const) {
      const empties = flatten(catalogue).filter((path) => {
        const value = path.split('.').reduce<unknown>(
          (node, key) => (node as Record<string, unknown>)?.[key],
          catalogue,
        );
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empties, `${name} has empty strings`).toEqual([]);
    }
  });

  it('gives Arabic a full seven-day week for the calendar', () => {
    expect(ar.booking.calendar.weekdays).toHaveLength(7);
    expect(ar.booking.calendar.weekdaysFull).toHaveLength(7);
  });

  it('actually contains Arabic script, not copied French', () => {
    const arabic = /[؀-ۿ]/;
    expect(arabic.test(ar.nav.services)).toBe(true);
    expect(arabic.test(ar.booking.steps.date)).toBe(true);
    expect(arabic.test(ar.errors.notFound.title)).toBe(true);
    expect(arabic.test(ar.tarifs.title)).toBe(true);
  });

  /**
   * The design's invented claims must not creep back in through the copy — this is the
   * text-side counterpart to the catalogue assertions in catalogue.test.ts.
   */
  it('carries none of the design file’s unverifiable claims', () => {
    const banned = [
      '15+', 'quinze expertes', '500+', '340 k', '180+',
      'Vingt-deux robes', '661 23 45 67', 'Meriem B.', 'Yasmine K.', 'Lamia T.',
      '09 h 00 – 19 h 00',
    ];
    for (const catalogue of [fr, ar, en]) {
      const serialised = JSON.stringify(catalogue);
      for (const phrase of banned) {
        expect(serialised).not.toContain(phrase);
      }
    }
  });
});
