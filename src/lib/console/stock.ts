import 'server-only';
import { cache } from 'react';

import { getSupabaseSessionClient } from '@/lib/supabase/session';
import type { BusinessLine } from './day-line';
import { demoAccessoryStock, demoProductStock, isDemoMode } from './demo';

/**
 * What is on the shelf, and what is on the rail.
 *
 * Two different kinds of thing, read side by side on purpose. A product is *consumed* — a tube of
 * colour leaves and does not come back — while an accessory is *rented* and returns, which is why
 * they live in separate tables with separate rules. But "what am I short of" is one question, and
 * answering it in two places is how a salon runs out of something it owns.
 *
 * Products come from `product_stock`, whose `on_hand` is the sum of signed movements rather than a
 * stored counter: the number on screen and the history explaining it cannot disagree.
 *
 * Neither read filters by tenant or role. RLS does that — `products_front_desk_read` gives owner
 * and reception the shelf and a stylist nothing at all, and the view is `security_invoker` so it
 * inherits exactly that.
 */

export interface ProductStock {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  /** Null means shared across the three businesses rather than belonging to one. */
  line: BusinessLine | null;
  unit: string;
  /** Centimes. Null when nobody has told us what a unit costs (§6) — never a zero. */
  unitCost: number | null;
  /** Null means no threshold has been set, which is not the same as "never warn". */
  reorderLevel: number | null;
  onHand: number;
  needsReorder: boolean;
  lastMovementOn: string | null;
}

export interface AccessoryStock {
  id: string;
  slug: string;
  name: string;
  /**
   * Zero means *not counted yet*, not "we own none" — the seed leaves it at the column default
   * because the real counts were never supplied, and `check_accessory_stock` skips its limit on
   * zero for exactly that reason. The screen has to say "non compté", never "0 en stock".
   */
  stockTotal: number;
  rentalPrice: number | null;
  /** Units out with a bride today: unreturned loans whose period covers the day. */
  outOnLoan: number;
}

interface ProductStockRow {
  product_id: string;
  slug: string;
  name: string;
  brand: string | null;
  line: BusinessLine | null;
  unit: string;
  unit_cost: number | null;
  reorder_level: number | string | null;
  on_hand: number | string;
  needs_reorder: boolean;
  last_movement_on: string | null;
}

interface AccessoryRow {
  id: string;
  slug: string;
  name: string;
  stock_total: number;
  rental_price: number | null;
}

interface AccessoryLoanRow {
  accessory_id: string;
  quantity: number;
}

/** Postgres `numeric` arrives over PostgREST as a string, because a float would round it. */
const toNumber = (value: number | string | null): number | null =>
  value === null ? null : typeof value === 'number' ? value : Number(value);

export const getProductStock = cache(async (): Promise<ProductStock[]> => {
  if (isDemoMode()) return demoProductStock();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('product_stock')
    .select(
      'product_id, slug, name, brand, line, unit, unit_cost, reorder_level, on_hand, needs_reorder, last_movement_on',
    )
    .eq('is_active', true)
    .order('name')
    .returns<ProductStockRow[]>();

  if (error) {
    // A stylist has no policy granting the shelf; an empty list beats an error page.
    return [];
  }

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    line: row.line,
    unit: row.unit,
    unitCost: row.unit_cost,
    reorderLevel: toNumber(row.reorder_level),
    onHand: toNumber(row.on_hand) ?? 0,
    needsReorder: row.needs_reorder,
    lastMovementOn: row.last_movement_on,
  }));
});

/**
 * The rail, with today's loans counted against it.
 *
 * `accessory_loans` has no exclusion constraint — unlike a gown, three veils are three veils, and
 * the trigger checks the sum. So "out today" is a sum here too, over unreturned loans overlapping
 * the day.
 */
export const getAccessoryStock = cache(async (today: string): Promise<AccessoryStock[]> => {
  if (isDemoMode()) return demoAccessoryStock();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  // `[today, today)` is the empty range and overlaps nothing. One day is `[today, today + 1)`.
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);

  const [accessories, loans] = await Promise.all([
    supabase
      .from('accessories')
      .select('id, slug, name, stock_total, rental_price')
      .eq('is_active', true)
      .order('name')
      .returns<AccessoryRow[]>(),
    supabase
      .from('accessory_loans')
      .select('accessory_id, quantity')
      .is('returned_at', null)
      .overlaps('period', `[${today},${tomorrow})`)
      .returns<AccessoryLoanRow[]>(),
  ]);

  if (accessories.error || !accessories.data) return [];

  const out = new Map<string, number>();
  for (const loan of loans.data ?? []) {
    out.set(loan.accessory_id, (out.get(loan.accessory_id) ?? 0) + loan.quantity);
  }

  return accessories.data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    stockTotal: row.stock_total,
    rentalPrice: row.rental_price,
    outOnLoan: out.get(row.id) ?? 0,
  }));
});
