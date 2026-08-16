import { z } from 'zod';

/**
 * What Phase 6's forms may send.
 *
 * Outside the `'use server'` modules, which may only export async functions — so the validation
 * boundary can be unit-tested rather than merely trusted. Same split as the atelier's schema,
 * and the same reason: the deposit bug that lived in a `z.coerce` was invisible until a test
 * looked at it directly.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An optional number typed into a form, in dinars, stored as centimes.
 *
 * Emptiness is decided *before* coercion. `Number('')` is 0, so the tempting
 * `union([coerce.number(), literal('')])` matches the coercing branch first and an untouched box
 * silently becomes zero — which for a deal value reads as "agreed, and worth nothing" rather
 * than "not agreed yet".
 */
const optionalDinars = (max: number) =>
  z
    .preprocess(
      (value) => (value === '' || value === null || value === undefined ? null : value),
      z.coerce.number().int().min(0).max(max).nullable(),
    )
    .transform((v) => (v === null ? null : v * 100));

const optionalDate = z
  .preprocess(
    (value) => (value === '' || value === null || value === undefined ? null : value),
    z.string().regex(ISO_DATE).nullable(),
  );

export const clientNoteInput = z.object({
  clientId: z.string().uuid(),
  // A colour formula or an allergy is worth a paragraph, not an essay.
  body: z.string().trim().min(1).max(2000),
});

export const logMessageInput = z.object({
  clientId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  conversationId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  channel: z.enum(['whatsapp', 'instagram', 'phone', 'walk_in', 'other']).catch('whatsapp'),
  direction: z.enum(['inbound', 'outbound']),
  body: z.string().trim().min(1).max(4000),
});

export const dealStageInput = z.object({
  dealId: z.string().uuid(),
  stage: z.enum(['pitched', 'negotiating', 'contracted', 'delivered']),
});

export const dealInput = z.object({
  brandName: z.string().trim().min(1).max(120),
  valueDinars: optionalDinars(100_000_000),
  contactName: z.string().trim().max(120).optional(),
  contactHandle: z.string().trim().max(120).optional(),
  nextAction: z.string().trim().max(500).optional(),
  nextActionDue: optionalDate,
});
