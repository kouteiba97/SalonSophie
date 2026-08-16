import { describe, expect, it } from 'vitest';
import {
  isTodo,
  known,
  todo,
  TODO_GOWN_RENTAL_PRICE,
  TODO_SERVICE_DURATION,
  UNKNOWN_FIELDS,
} from '@/lib/todo';
import { formatPrice, type Price } from '@/lib/money';
import type { Unless } from '@/lib/todo';

/**
 * The chokepoint for everything nobody has told us (§6, §12.2).
 *
 * The serialisation cases below are not hypothetical. `TodoValue` was branded with a `Symbol`,
 * which is the textbook way to brand a type and which silently does not survive the Server →
 * Client boundary: the booking modal received a plain `{ field, source }`, `isTodo` returned
 * false, and the gown price rendered blank while the card behind it said "Sur devis". Nothing
 * in the type system noticed, because the types are erased exactly where the bug lived.
 */

const labels = {
  currency: 'DA',
  onRequest: 'Sur devis',
  from: (amount: string) => `à partir de ${amount}`,
  free: 'Offert',
};

describe('isTodo', () => {
  it('recognises a TodoValue', () => {
    expect(isTodo(TODO_SERVICE_DURATION)).toBe(true);
  });

  it('rejects the things it must not swallow', () => {
    expect(isTodo(null)).toBe(false);
    expect(isTodo(undefined)).toBe(false);
    expect(isTodo(0)).toBe(false);
    expect(isTodo('Sur devis')).toBe(false);
    expect(isTodo({ kind: 'fixed', amount: 70_000 })).toBe(false);
    expect(isTodo({ field: 'Durée', source: 'Nour' })).toBe(false);
  });
});

/**
 * The regression. React Server Components serialise props to the client, and whatever brand
 * survives that trip is the only brand `isTodo` can rely on.
 */
describe('crossing the Server/Client boundary', () => {
  it('survives a JSON round-trip', () => {
    const revived = JSON.parse(JSON.stringify(TODO_GOWN_RENTAL_PRICE));

    expect(isTodo(revived)).toBe(true);
    expect(revived.field).toBe(TODO_GOWN_RENTAL_PRICE.field);
  });

  it('survives structured cloning, which is what RSC actually uses', () => {
    const revived = structuredClone(TODO_SERVICE_DURATION);
    expect(isTodo(revived)).toBe(true);
  });

  it('still renders "Sur devis" after serialisation', () => {
    const serialised = JSON.parse(JSON.stringify(TODO_GOWN_RENTAL_PRICE)) as Unless<Price>;

    // The exact failure: this returned undefined, and the modal showed a gown with no price.
    expect(formatPrice(serialised, 'fr', labels)).toBe('Sur devis');
    // And it agrees with the server-rendered side, which is the bug's real signature.
    expect(formatPrice(TODO_GOWN_RENTAL_PRICE, 'fr', labels)).toBe('Sur devis');
  });

  it('keeps a real price rendering normally after serialisation', () => {
    const price = JSON.parse(JSON.stringify({ kind: 'fixed', amount: 70_000 })) as Price;
    expect(formatPrice(price, 'fr', labels)).toContain('700');
  });
});

describe('known', () => {
  it('falls back for an unknown value and passes a real one through', () => {
    expect(known<number>(TODO_SERVICE_DURATION, 30)).toBe(30);
    expect(known<number>(45, 30)).toBe(45);
  });
});

describe('the registry', () => {
  it('returns the same instance for the same field', () => {
    expect(todo('Durée des prestations')).toBe(TODO_SERVICE_DURATION);
  });

  it('lists every unknown for the build warning, with somebody to ask', () => {
    expect(UNKNOWN_FIELDS.length).toBeGreaterThan(0);
    for (const field of UNKNOWN_FIELDS) {
      expect(isTodo(field)).toBe(true);
      expect(field.field.trim()).not.toBe('');
      expect(field.source.trim()).not.toBe('');
    }
  });
});
