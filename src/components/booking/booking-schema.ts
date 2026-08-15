import { z } from 'zod';

/**
 * Zod at every boundary (BUILD_BRIEF §12.6). The design had no validation whatsoever — the
 * "Confirmer" button only checked that the two fields were non-empty strings.
 *
 * This schema is shared: the client form uses it for inline errors, and Phase 3's server action
 * re-validates with the same shape before it touches the database. The server never trusts this.
 */

/** Algerian mobile: 10 digits starting 05, 06 or 07 (§7). */
export const ALGERIAN_MOBILE = /^0[5-7]\d{8}$/;

export interface BookingMessages {
  nameRequired: string;
  nameTooShort: string;
  phoneRequired: string;
  phoneInvalid: string;
}

export const bookingDetailsSchema = (m: BookingMessages) =>
  z.object({
    name: z
      .string({ required_error: m.nameRequired })
      .trim()
      .min(1, m.nameRequired)
      .min(2, m.nameTooShort)
      .max(80),
    phone: z
      .string({ required_error: m.phoneRequired })
      .trim()
      .min(1, m.phoneRequired)
      // Clients type spaces and dashes; normalise before testing the shape.
      .transform((value) => value.replace(/[\s.-]/g, ''))
      .refine((value) => ALGERIAN_MOBILE.test(value), m.phoneInvalid),
    notes: z.string().trim().max(500).optional(),
  });

export type BookingDetails = z.infer<ReturnType<typeof bookingDetailsSchema>>;

/** What a confirmed booking submits. Phase 3 posts this and re-validates it server-side. */
export const bookingSubmissionSchema = (m: BookingMessages) =>
  bookingDetailsSchema(m).extend({
    kind: z.enum(['service', 'fitting']),
    serviceSlug: z.string().nullable(),
    gownSlug: z.string().nullable(),
    expertSlug: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    locale: z.enum(['fr', 'ar', 'en']),
  });

export type BookingSubmission = z.infer<ReturnType<typeof bookingSubmissionSchema>>;
