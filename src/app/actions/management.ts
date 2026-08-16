'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';
import {
  accessoryStockInput,
  categoryInput,
  expenseInput,
  openingHoursInput,
  productInput,
  serviceInput,
  stockMovementInput,
} from '@/lib/management/schema';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';

/**
 * Everything the sisters can change: the tariff, opening hours, products, stock and spending.
 *
 * Each action is a thin shell around a Postgres function — validate the shape, call it, translate
 * the named exception. The decisions live inside the transaction, and none of those functions is
 * `security definer`, so RLS is what actually refuses a non-owner. The role check here only buys
 * a better message.
 */

export type ManagementError =
  | 'forbidden'
  | 'not_configured'
  | 'invalid'
  | 'invalid_range'
  | 'price_required'
  | 'free_has_price'
  | 'unknown_category'
  | 'unknown_product'
  | 'not_found'
  | 'hours_incomplete'
  | 'hours_backwards'
  | 'invalid_quantity'
  | 'unavailable';

export type ManagementState =
  | { status: 'idle' }
  | { status: 'success'; message?: string }
  | { status: 'error'; error: ManagementError; field?: string };

function classify(message: string): ManagementState {
  const named: [string, ManagementError][] = [
    ['service_invalid_range', 'invalid_range'],
    ['service_price_required', 'price_required'],
    ['service_free_has_price', 'free_has_price'],
    ['service_unknown_category', 'unknown_category'],
    ['service_invalid_duration', 'invalid'],
    ['service_invalid_name', 'invalid'],
    ['service_not_found', 'not_found'],
    ['category_invalid_name', 'invalid'],
    ['hours_incomplete', 'hours_incomplete'],
    ['hours_backwards', 'hours_backwards'],
    ['hours_no_location', 'unavailable'],
    ['stock_unknown_product', 'unknown_product'],
    ['stock_invalid_quantity', 'invalid_quantity'],
    ['product_invalid_name', 'invalid'],
    ['product_invalid_cost', 'invalid'],
    ['expense_invalid_label', 'invalid'],
    ['expense_invalid_amount', 'invalid'],
    ['expense_invalid_date', 'invalid'],
    ['_forbidden', 'forbidden'],
    // A raw policy refusal, when RLS rejects before the function's own guard runs.
    ['row-level security', 'forbidden'],
    ['permission denied', 'forbidden'],
  ];

  for (const [needle, error] of named) {
    if (message.includes(needle)) return { status: 'error', error };
  }

  console.error('[N&S] management: unmapped database error:', message);
  return { status: 'error', error: 'unavailable' };
}

/** Every console surface that shows a tariff, an hour or a stock level. */
function revalidateConsole() {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`, 'layout');
  }
}

/**
 * Owner-only guard shared by every action below.
 *
 * Returns *which* thing was missing, rather than a bare null. Collapsing both cases told an owner
 * "only Nour and Sophie can change this" when the real answer was that no database is connected —
 * an error that sends someone hunting for a permissions problem they do not have. An error should
 * say what to do next, and those two say opposite things.
 */
async function requireOwner() {
  const session = await getStaffSession();
  if (!session || !isOwner(session)) return { supabase: null, error: 'forbidden' as const };

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { supabase: null, error: 'not_configured' as const };

  return { supabase, error: null };
}

/* ── the tariff ───────────────────────────────────────────────────────────────────────────── */

export async function saveService(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const parsed = serviceInput.safeParse({
    slug: formData.get('slug'),
    categorySlug: formData.get('categorySlug'),
    name: formData.get('name'),
    kind: formData.get('kind'),
    priceMin: formData.get('priceMin') ?? '',
    priceMax: formData.get('priceMax') ?? '',
    durationMinutes: formData.get('durationMinutes') ?? '',
    bufferMinutes: formData.get('bufferMinutes') ?? '',
    isActive: formData.get('isActive') !== 'false',
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const known: Record<string, ManagementError> = {
      range_needs_max: 'invalid_range',
      range_backwards: 'invalid_range',
      price_required: 'price_required',
      free_has_price: 'free_has_price',
    };
    const mapped = issue ? known[issue.message] : undefined;
    return { status: 'error', error: mapped ?? 'invalid', field: issue?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const d = parsed.data;
  const { error } = await callRpc<string>(supabase, 'upsert_service', {
    p_slug: d.slug,
    p_category_slug: d.categorySlug,
    p_name: d.name,
    p_kind: d.kind,
    p_price_min: d.priceMin,
    p_price_max: d.priceMax,
    p_duration_minutes: d.durationMinutes,
    p_buffer_minutes: d.bufferMinutes,
    p_is_active: d.isActive,
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

export async function archiveService(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const slug = String(formData.get('slug') ?? '');
  if (!slug) return { status: 'error', error: 'invalid', field: 'slug' };

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const { error } = await callRpc<null>(supabase, 'archive_service', {
    p_slug: slug,
    p_archived: formData.get('archived') !== 'false',
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

export async function saveCategory(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const parsed = categoryInput.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    sortOrder: formData.get('sortOrder') ?? '',
    isActive: formData.get('isActive') !== 'false',
  });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', field: parsed.error.issues[0]?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const { error } = await callRpc<string>(supabase, 'upsert_category', {
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_sort_order: parsed.data.sortOrder,
    p_is_active: parsed.data.isActive,
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

/* ── opening hours ────────────────────────────────────────────────────────────────────────── */

export async function saveOpeningHours(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isClosed: formData.get(`closed-${weekday}`) === 'on',
    opensAt: String(formData.get(`opens-${weekday}`) ?? ''),
    closesAt: String(formData.get(`closes-${weekday}`) ?? ''),
  }));

  const parsed = openingHoursInput.safeParse(days);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === 'backwards') return { status: 'error', error: 'hours_backwards' };
    return { status: 'error', error: 'hours_incomplete', field: issue?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const { error } = await callRpc<number>(supabase, 'set_business_hours', {
    p_days: parsed.data.map((d) => ({
      weekday: d.weekday,
      is_closed: d.isClosed,
      opens_at: d.isClosed ? null : d.opensAt,
      closes_at: d.isClosed ? null : d.closesAt,
    })),
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

/* ── products and stock ───────────────────────────────────────────────────────────────────── */

export async function saveProduct(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const rawLine = String(formData.get('line') ?? '');
  const parsed = productInput.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    brand: formData.get('brand') ?? undefined,
    line: rawLine === '' ? null : rawLine,
    unit: formData.get('unit') ?? 'piece',
    unitCost: formData.get('unitCost') ?? '',
    reorderLevel: formData.get('reorderLevel') ?? '',
    isActive: formData.get('isActive') !== 'false',
  });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', field: parsed.error.issues[0]?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const d = parsed.data;
  const { error } = await callRpc<string>(supabase, 'upsert_product', {
    p_slug: d.slug,
    p_name: d.name,
    p_brand: d.brand ?? null,
    p_line: d.line,
    p_unit: d.unit,
    p_unit_cost: d.unitCost,
    p_reorder_level: d.reorderLevel,
    p_is_active: d.isActive,
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

/**
 * Recording stock is the one write reception may make here: they are the ones who notice a
 * bottle running out. RLS allows their insert and refuses everything else on this file.
 */
export async function recordStockMovement(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const parsed = stockMovementInput.safeParse({
    productSlug: formData.get('productSlug'),
    reason: formData.get('reason'),
    quantity: formData.get('quantity') ?? '',
    totalCost: formData.get('totalCost') ?? '',
    note: formData.get('note') ?? undefined,
    occurredOn: formData.get('occurredOn') || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === 'invalid_quantity') return { status: 'error', error: 'invalid_quantity' };
    return { status: 'error', error: 'invalid', field: issue?.path.join('.') };
  }

  const session = await getStaffSession();
  if (!session) return { status: 'error', error: 'forbidden' };
  const supabase = await getSupabaseSessionClient();
  if (!supabase) return { status: 'error', error: 'not_configured' };

  const d = parsed.data;
  const { error } = await callRpc<string>(supabase, 'record_stock_movement', {
    p_product_slug: d.productSlug,
    p_quantity: d.signedQuantity,
    p_reason: d.reason,
    p_total_cost: d.totalCost,
    p_note: d.note ?? null,
    p_occurred_on: d.occurredOn ?? null,
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

/**
 * Counting the accessory rail.
 *
 * A direct table write rather than an RPC, unlike everything else on this file. There is no
 * `upsert_accessory` because the three accessories are seeded and fixed (§6) — this only records
 * how many of each exist, which is one column. `accessories_owner_write` is the boundary, exactly
 * as `client_notes` and `brand_deals` are written elsewhere in the console.
 *
 * `.eq('slug', ...)` alone is safe: the policy adds `same_tenant`, so a slug from another salon
 * matches no row rather than updating theirs.
 */
export async function saveAccessoryStock(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const parsed = accessoryStockInput.safeParse({
    slug: formData.get('slug'),
    stockTotal: formData.get('stockTotal') ?? '',
  });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', field: parsed.error.issues[0]?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const { data, error } = await supabase
    .from('accessories')
    .update({ stock_total: parsed.data.stockTotal })
    .eq('slug', parsed.data.slug)
    .select('id');

  if (error) return classify(error.message);
  // RLS returns an empty set rather than an error when the policy refuses the row.
  if (!data || data.length === 0) return { status: 'error', error: 'not_found' };

  revalidateConsole();
  return { status: 'success' };
}

/* ── spending ─────────────────────────────────────────────────────────────────────────────── */

export async function recordExpense(
  _previous: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const rawLine = String(formData.get('line') ?? '');
  const parsed = expenseInput.safeParse({
    category: formData.get('category'),
    label: formData.get('label'),
    amount: formData.get('amount') ?? '',
    line: rawLine === '' ? null : rawLine,
    incurredOn: formData.get('incurredOn'),
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', field: parsed.error.issues[0]?.path.join('.') };
  }

  const owner = await requireOwner();
  if (!owner.supabase) return { status: 'error', error: owner.error };
  const supabase = owner.supabase;

  const d = parsed.data;
  const { error } = await callRpc<string>(supabase, 'record_expense', {
    p_category: d.category,
    p_label: d.label,
    p_amount: d.amount,
    p_incurred_on: d.incurredOn,
    p_line: d.line,
    p_note: d.note ?? null,
  });

  if (error) return classify(error.message);
  revalidateConsole();
  return { status: 'success' };
}

/*
 * Nothing else is exported from this file, and nothing else may be.
 *
 * A `'use server'` module may only export async functions: Next builds a client-callable entry
 * from *every* export, and a plain object among them throws "A 'use server' file can only export
 * async functions" — at request time, not at build time. An unused `managementIdleState` constant
 * sat here and made every write on this file answer 500, which looked like a broken screen rather
 * than a broken export. Shared constants belong in `src/lib/management/`.
 */
