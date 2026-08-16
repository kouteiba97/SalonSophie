import { z } from 'zod';

/**
 * Validation for everything the sisters can now change.
 *
 * Deliberately mirrors the database's own checks rather than replacing them. The constraints in
 * `services_price_shape` and the named exceptions in `upsert_service` are the guarantee; these
 * exist so the console can refuse a bad shape before a round trip, and say which field is wrong.
 *
 * Money arrives from a form in dinars — that is what a person types — and leaves in centimes,
 * which is the only unit the database knows (§7).
 */

const DINARS_TO_CENTIMES = 100;

/** "1 500" / "1500,50" / "1 500.5" → centimes. Blank is null, not zero. */
export const dinarsToCentimes = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s  ]/g, '').replace(',', '.'))
  .transform((value) => (value === '' ? null : Math.round(Number(value) * DINARS_TO_CENTIMES)))
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), 'invalid_amount');

const optionalInt = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value > 0), 'invalid_number');

export const PRICE_KINDS = ['fixed', 'range', 'from', 'addon', 'free'] as const;
export type PriceKindInput = (typeof PRICE_KINDS)[number];

export const serviceInput = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'invalid_slug'),
    categorySlug: z.string().trim().min(1),
    name: z.string().trim().min(1, 'invalid_name').max(120),
    kind: z.enum(PRICE_KINDS),
    priceMin: dinarsToCentimes,
    priceMax: dinarsToCentimes,
    /** Null means unknown, and unknown is what keeps a booking a request (§6). */
    durationMinutes: optionalInt,
    bufferMinutes: z
      .string()
      .trim()
      .transform((v) => (v === '' ? 0 : Number(v)))
      .refine((v) => Number.isInteger(v) && v >= 0, 'invalid_number'),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    // The same three rules the Postgres function enforces, checked early for a better message.
    if (value.kind === 'free') {
      if (value.priceMin !== null || value.priceMax !== null) {
        ctx.addIssue({ code: 'custom', path: ['priceMin'], message: 'free_has_price' });
      }
      return;
    }
    if (value.priceMin === null) {
      ctx.addIssue({ code: 'custom', path: ['priceMin'], message: 'price_required' });
    }
    if (value.kind === 'range') {
      if (value.priceMax === null) {
        ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'range_needs_max' });
      } else if (value.priceMin !== null && value.priceMin >= value.priceMax) {
        ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'range_backwards' });
      }
    }
  });

export type ServiceInput = z.infer<typeof serviceInput>;

export const categoryInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'invalid_slug'),
  name: z.string().trim().min(1, 'invalid_name').max(120),
  sortOrder: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 0 : Number(v)))
    .refine((v) => Number.isInteger(v), 'invalid_number'),
  isActive: z.boolean().default(true),
});

/* ── Opening hours ──────────────────────────────────────────────────────────────────────── */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const openingDay = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isClosed: z.boolean(),
    opensAt: z.string().trim(),
    closesAt: z.string().trim(),
  })
  .superRefine((day, ctx) => {
    if (day.isClosed) return;
    if (!TIME.test(day.opensAt) || !TIME.test(day.closesAt)) {
      ctx.addIssue({ code: 'custom', path: ['opensAt'], message: 'incomplete' });
      return;
    }
    if (day.opensAt >= day.closesAt) {
      ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'backwards' });
    }
  });

/** The whole week at once — a partial update is how a salon ends up open on a day it is shut. */
export const openingHoursInput = z.array(openingDay).length(7);
export type OpeningDay = z.infer<typeof openingDay>;

/* ── Products and stock ─────────────────────────────────────────────────────────────────── */

export const PRODUCT_UNITS = ['piece', 'ml', 'l', 'g', 'kg', 'application'] as const;
export const STOCK_REASONS = ['delivery', 'usage', 'correction', 'loss', 'return'] as const;
export const BUSINESS_LINES = ['salon', 'bridal', 'makeup'] as const;

export const productInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'invalid_slug'),
  name: z.string().trim().min(1, 'invalid_name').max(120),
  brand: z.string().trim().max(80).optional(),
  /** Empty means shared across the three businesses rather than belonging to one. */
  line: z.enum(BUSINESS_LINES).nullable().default(null),
  unit: z.enum(PRODUCT_UNITS).default('piece'),
  unitCost: dinarsToCentimes,
  reorderLevel: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'invalid_number'),
  isActive: z.boolean().default(true),
});

export const stockMovementInput = z
  .object({
    productSlug: z.string().trim().min(1),
    reason: z.enum(STOCK_REASONS),
    /** Always entered as a positive amount; the sign is derived from the reason. */
    quantity: z
      .string()
      .trim()
      .transform((v) => Number(v.replace(',', '.')))
      .refine((v) => Number.isFinite(v) && v > 0, 'invalid_quantity'),
    totalCost: dinarsToCentimes,
    note: z.string().trim().max(300).optional(),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .transform((value) => ({
    ...value,
    /*
     * A person types "3 used", not "-3". Deriving the sign here means the sign can never
     * contradict the reason, which is exactly what the table's check constraint refuses.
     * A correction is the one case where direction is the point, so it keeps its sign.
     */
    signedQuantity:
      value.reason === 'usage' || value.reason === 'loss' ? -value.quantity : value.quantity,
  }));

/* ── Spending ───────────────────────────────────────────────────────────────────────────── */

export const EXPENSE_CATEGORIES = [
  'stock',
  'rent',
  'utilities',
  'salary',
  'marketing',
  'equipment',
  'maintenance',
  'other',
] as const;

export const expenseInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  label: z.string().trim().min(1, 'invalid_label').max(120),
  amount: dinarsToCentimes.refine((v) => v !== null && v > 0, 'invalid_amount'),
  /** Null keeps a shared cost shared: rent belongs to the business, not to hair. */
  line: z.enum(BUSINESS_LINES).nullable().default(null),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date'),
  note: z.string().trim().max(300).optional(),
});
