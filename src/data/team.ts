import type { Expert } from './types';

/**
 * Only Nour and Sophie are confirmed to exist (BUILD_BRIEF §6).
 *
 * The design's EXPERTS array added "Amina — Nails & cils" and "Lynda — Massage & épilation".
 * Naming staff who may not work here would put invented people in front of clients, so they
 * are not reproduced. Step 2 of the booking flow ("Votre experte") therefore offers Nour,
 * Sophie, and a no-preference option rather than a fabricated roster.
 */
export const EXPERTS: Expert[] = [
  { slug: 'nour', name: 'Nour', roleKey: 'team.nour.role' },
  { slug: 'sophie', name: 'Sophie', roleKey: 'team.sophie.role' },
];

/** Lets a client book without picking a person — also the honest default while the roster is unknown. */
export const NO_PREFERENCE = 'sans-preference';
