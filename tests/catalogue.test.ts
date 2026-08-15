import { describe, expect, it } from 'vitest';
import { CATEGORIES, SERVICES, findService } from '@/data/services';
import { BRIDAL_PACKAGES, GOWNS } from '@/data/bridal';
import { EXPERTS } from '@/data/team';
import { BUSINESS } from '@/data/business';
import { DA } from '@/lib/money';
import { isTodo } from '@/lib/todo';

/**
 * These guard non-negotiable §12.2 — no invented prices, durations or staff.
 *
 * The design file contained a plausible value for every one of these, which is exactly why they
 * are asserted: a well-meaning future edit that "fills in the blanks" from the prototype should
 * fail the build rather than reach a client.
 */

describe('the published tariff (§6)', () => {
  it('has all eight categories', () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Coiffure',
      'Soins Capillaires',
      'Soin de Visage',
      'Nails',
      'Pédicure',
      'Extension de Cils',
      'Épilation',
      'Massage',
    ]);
  });

  it('uses the real published prices, not the design file’s', () => {
    // The design priced these at 1 500 / 7 500; §6 says otherwise.
    expect(findService('coupe')?.price).toEqual({ kind: 'fixed', amount: DA(700) });
    expect(findService('coupe-brushing-courts')?.price).toEqual({ kind: 'fixed', amount: DA(1200) });
    expect(findService('balayage')).toMatchObject({ price: { kind: 'from', amount: DA(16_000) } });
    expect(findService('soins-capillaires')?.price).toEqual({
      kind: 'range',
      min: DA(14_000),
      max: DA(35_000),
    });
    expect(findService('epilation-levre-superieure')?.price).toEqual({
      kind: 'fixed',
      amount: DA(200),
    });
    expect(findService('massage-visage')?.price).toEqual({ kind: 'free' });
    expect(findService('deco')?.price).toEqual({ kind: 'addon', amount: DA(500) });
  });

  it('does not contain any service invented by the design file', () => {
    const invented = ['Botox Capillaire', 'Lissage Brésilien', 'Chignon Mariée', 'Balayage & Ombré'];
    const names = SERVICES.map((s) => s.name);
    for (const name of invented) expect(names).not.toContain(name);
  });

  it('gives every service a unique slug', () => {
    const slugs = SERVICES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('points every service at a real category', () => {
    const known = new Set(CATEGORIES.map((c) => c.slug));
    for (const service of SERVICES) expect(known.has(service.categorySlug)).toBe(true);
  });

  /** §6: durations are unknown for every service. */
  it('invents no durations', () => {
    for (const service of SERVICES) {
      expect(isTodo(service.duration)).toBe(true);
    }
  });
});

describe('bridal (§6)', () => {
  it('has exactly the three named gowns, with sizes visible', () => {
    expect(GOWNS.map((g) => g.name)).toEqual(['Anastasia', 'ABir', 'RYMA']);
    for (const gown of GOWNS) {
      expect(gown.sizeMin).toBeLessThan(gown.sizeMax);
    }
  });

  it('invents no rental prices', () => {
    for (const gown of GOWNS) expect(isTodo(gown.rentalPrice)).toBe(true);
  });

  it('invents no package prices', () => {
    for (const pkg of BRIDAL_PACKAGES) expect(isTodo(pkg.price)).toBe(true);
  });
});

describe('staff (§6)', () => {
  it('lists only the two confirmed sisters', () => {
    expect(EXPERTS.map((e) => e.name)).toEqual(['Nour', 'Sophie']);
  });

  it('does not resurrect the design file’s invented staff', () => {
    const names = EXPERTS.map((e) => e.name);
    expect(names).not.toContain('Amina');
    expect(names).not.toContain('Lynda');
  });
});

describe('contact (§1)', () => {
  it('uses the salon’s one real line', () => {
    expect(BUSINESS.phone).toBe('0553366712');
    expect(BUSINESS.whatsappNumber).toBe('213553366712');
  });

  /** The design hardcoded +213 661 23 45 67. It must never ship. */
  it('never ships the design file’s placeholder number', () => {
    const serialised = JSON.stringify(BUSINESS);
    expect(serialised).not.toContain('661234567');
    expect(serialised).not.toContain('213661234567');
  });

  it('invents no opening hours', () => {
    expect(isTodo(BUSINESS.openingHours)).toBe(true);
  });
});
