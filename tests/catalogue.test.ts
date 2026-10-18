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

  /**
   * §6: durations. Sixteen are the salon's own; the other thirty-nine are still unknown.
   *
   * This used to assert that every one was unknown. That rule has not been relaxed — it has been
   * answered in part, and the test now pins both halves: the real values must not drift, and the
   * unanswered ones must not quietly acquire a plausible-looking number.
   */
  it('carries the salon’s real durations and invents none of the rest', () => {
    const real = new Map<string, number>([
      ['brushing-courts', 15],
      ['brushing-mi-longs', 15],
      ['brushing-longs', 15],
      ['brushing-tres-tres-longs', 15],
      ['soins-capillaires', 300],
      ['soin-visage-simple', 60],
      ['soin-visage-profond', 60],
      ['hydra-facial', 60],
      ['soin-des-mains', 30],
      ['pose-capsule', 120],
      ['gel-ongle-naturel', 120],
      ['french-pose-capsule', 120],
      ['french-gel-ongle-naturel', 120],
      ['babyboomer', 120],
      ['pedicure-soin-sans-paraffine', 45],
      ['pedicure-soin-avec-paraffine', 45],
    ]);

    for (const service of SERVICES) {
      const expected = real.get(service.slug);
      if (expected === undefined) {
        expect(isTodo(service.duration), `${service.slug} should still be unknown`).toBe(true);
      } else {
        expect(service.duration, `${service.slug} duration`).toBe(expected);
      }
    }

    expect(SERVICES.filter((s) => !isTodo(s.duration))).toHaveLength(real.size);
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
  /**
   * This constant is the *fallback*, not the roster.
   *
   * Who a client may book is read from the `staff` table — an owner hires from `/equipe`, and
   * for a while this constant was the whole list, which meant a real stylist with a real schedule
   * was bookable in the database and invisible on the website. §6 is satisfied by reading the
   * salon's own record; it was never satisfied by a hardcoded pair.
   *
   * What stays true here: with no database configured, the only names shown are the two anyone
   * has confirmed exist.
   */
  it('lists only the two confirmed sisters', () => {
    expect(EXPERTS.map((e) => e.name)).toEqual(['Nour', 'Sophie']);
  });

  // No test here for the database path: `getCatalogue` imports `server-only`, which will not
  // load in this environment. It is verified against the live project in the browser instead.

  it('keeps a role line for the seeded two, so the booking step is not blank', () => {
    expect(EXPERTS.every((e) => Boolean(e.roleKey))).toBe(true);
  });

  /**
   * Names only, and only in the seed. The salon has since hired someone called Amina Belkacem,
   * who is a real person in the `staff` table — unrelated to the design's invented
   * "Amina — Nails & cils". Do not read a database row as evidence this test has been defeated,
   * and do not widen it to cover the roster: the roster is allowed to contain whoever the sisters
   * actually employ.
   */
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

  /**
   * The salon's real week: 09:30–17:00, closed Sunday.
   *
   * Pinned rather than merely "present", because the design's invented hours were wrong in three
   * separate ways — 09 h – 19 h, and Friday hardcoded closed via `d.getDay() === 5`. The salon
   * trades on Friday and closes on Sunday. A regression toward the mockup would send clients to
   * a locked door, so the closed day and both ends of the clock are asserted explicitly.
   */
  it('publishes the salon’s real opening hours', () => {
    expect(BUSINESS.openingHours).toHaveLength(7);

    const sunday = BUSINESS.openingHours.find((d) => d.weekday === 0);
    expect(sunday?.isClosed).toBe(true);

    const trading = BUSINESS.openingHours.filter((d) => d.weekday !== 0);
    expect(trading).toHaveLength(6);
    for (const day of trading) {
      expect(day.isClosed, `weekday ${day.weekday}`).toBe(false);
      expect(day.opensAt, `weekday ${day.weekday}`).toBe('09:30');
      expect(day.closesAt, `weekday ${day.weekday}`).toBe('17:00');
    }

    // Friday (5) is a trading day. The design closed it; the salon does not.
    expect(BUSINESS.openingHours.find((d) => d.weekday === 5)?.isClosed).toBe(false);
  });
});
