import { z } from 'zod';

/**
 * What the atelier's forms are allowed to send.
 *
 * Separate from the server actions because a `'use server'` module may only export async
 * functions — and a validation boundary that cannot be unit-tested is a validation boundary
 * nobody checks. The same split the booking flow already uses (`booking-schema.ts`).
 *
 * These schemas are the *first* check. The database function re-validates all of it inside the
 * transaction, which is the one that decides.
 */

const ALGERIAN_MOBILE = /^0[5-7]\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An optional number typed into a form.
 *
 * The obvious spelling — `z.union([z.coerce.number(), z.literal('')])` — is wrong in a way that
 * is easy to miss and expensive to ship: `Number('')` is `0`, so the coercing branch matches an
 * empty field first and a blank input silently becomes zero. For a deposit that is the
 * difference between "nobody has set a policy yet" and "we took nothing", which is exactly the
 * confusion §6 exists to prevent.
 *
 * Emptiness is therefore decided *before* anything is coerced.
 */
const optionalNumber = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? null : value),
    z.coerce.number().int().min(0).max(max).nullable(),
  );

export const reservationInput = z
  .object({
    gownSlug: z.string().min(1),
    clientName: z.string().trim().min(2).max(80),
    clientPhone: z
      .string()
      .transform((v) => v.replace(/[\s.-]/g, ''))
      .refine((v) => ALGERIAN_MOBILE.test(v), 'invalid_phone'),
    firstDay: z.string().regex(ISO_DATE),
    lastDay: z.string().regex(ISO_DATE),
    /*
     * Defaults to zero because nobody has said how long a gown needs between brides (§6, open
     * question 11). Zero means "no turnaround is protected", which is visibly wrong on screen
     * and therefore gets asked about — unlike a plausible-looking 2, which never would be.
     *
     * Unlike the deposit, an empty box here genuinely does mean zero, so coercion is correct.
     */
    cleaningBufferDays: z.coerce.number().int().min(0).max(60).catch(0),
    status: z.enum(['held', 'confirmed']).catch('held'),
    /*
     * Typed in dinars, stored in centimes — money is integers, never a float and never a
     * `number` that means "dinars" (§7). The conversion happens here, once, at the boundary.
     *
     * Null until the sisters set a deposit policy (§6, open question 9), and null renders
     * "Non défini" rather than `0 DA`.
     */
    depositDinars: optionalNumber(10_000_000).transform((v) => (v === null ? null : v * 100)),
    notes: z.string().trim().max(1000).optional(),
    accessorySlugs: z.array(z.string().min(1)).max(12).default([]),
  })
  // Cheap enough to check here so the console can say "the last day must follow the first"
  // rather than relaying a range error from Postgres.
  .refine((value) => value.lastDay >= value.firstDay, {
    message: 'invalid_period',
    path: ['lastDay'],
  });

export type ReservationInput = z.infer<typeof reservationInput>;

export const reservationStatusInput = z.object({
  reservationId: z.string().uuid(),
  /*
   * `held` is absent on purpose: it is where a reservation starts, never somewhere it returns
   * to. The legal transitions are enforced in `set_reservation_status`; this is the same rule
   * stated at the edge.
   */
  status: z.enum(['confirmed', 'returned', 'cancelled']),
  reason: z.string().trim().max(500).optional(),
});

export const gownStateInput = z.object({
  gownId: z.string().uuid(),
  state: z.enum(['available', 'rented', 'cleaning', 'repair']),
  reason: z.string().trim().max(500).optional(),
});
