import { describe, expect, it } from 'vitest';
import {
  accessoryShortages,
  isAccessoryShort,
  productShortages,
  uncountedAccessories,
} from '@/lib/console/shortages';
import { demoAccessoryStock, demoProductStock } from '@/lib/console/demo';
import { accessoryStockInput, stockMovementInput } from '@/lib/management/schema';
import type { AccessoryStock, ProductStock } from '@/lib/console/stock';

/**
 * What the salon is short of, and what it merely has not counted.
 *
 * The distinction is the whole test. `accessories.stock_total` ships at 0 for every seeded row
 * because the real counts were never supplied (§6), so zero there means *uncounted*, not "we own
 * none" — and a shortage rule that misreads it would raise an alarm about all three accessories
 * on the day the salon first opens the screen, which is exactly how a real warning gets ignored.
 *
 * The database-side counterparts live in tests/db/management.test.ts: this file proves the
 * judgement, that one proves the constraints under it.
 */

const product = (over: Partial<ProductStock> = {}): ProductStock => ({
  productId: 'p',
  slug: 'p',
  name: 'Produit',
  brand: null,
  line: 'salon',
  unit: 'piece',
  unitCost: null,
  reorderLevel: 5,
  onHand: 10,
  needsReorder: false,
  lastMovementOn: null,
  ...over,
});

const accessory = (over: Partial<AccessoryStock> = {}): AccessoryStock => ({
  id: 'a',
  slug: 'a',
  name: 'Voile',
  stockTotal: 0,
  rentalPrice: null,
  outOnLoan: 0,
  ...over,
});

describe('product shortages', () => {
  it('takes the database at its word rather than recomputing the threshold', () => {
    const low = product({ slug: 'low', needsReorder: true });
    const fine = product({ slug: 'fine', needsReorder: false });

    expect(productShortages([low, fine])).toEqual([low]);
  });

  it('never warns about a product whose threshold nobody set', () => {
    /*
     * `product_stock.needs_reorder` is false when `reorder_level` is null, however little is on
     * the shelf. That is deliberate: no threshold is an unanswered question, not a claim that the
     * stock is fine, and the screen says so in words instead of raising an alarm nobody set.
     */
    const untracked = product({ reorderLevel: null, onHand: 0, needsReorder: false });

    expect(productShortages([untracked])).toEqual([]);
  });
});

describe('accessory shortages', () => {
  it('is short when every one it owns is out', () => {
    expect(isAccessoryShort(accessory({ stockTotal: 3, outOnLoan: 3 }))).toBe(true);
  });

  it('is not short while one is still on the rail', () => {
    expect(isAccessoryShort(accessory({ stockTotal: 3, outOnLoan: 2 }))).toBe(false);
  });

  it('treats zero owned as uncounted, never as an empty rail', () => {
    // The seeded state for all three accessories. None of them is a shortage.
    expect(isAccessoryShort(accessory({ stockTotal: 0, outOnLoan: 0 }))).toBe(false);
    expect(isAccessoryShort(accessory({ stockTotal: 0, outOnLoan: 2 }))).toBe(false);
  });

  it('counts the uncounted separately from the short', () => {
    const rail = [
      accessory({ slug: 'barnous', stockTotal: 0 }),
      accessory({ slug: 'diademe', stockTotal: 0 }),
      accessory({ slug: 'voile', stockTotal: 2, outOnLoan: 2 }),
    ];

    expect(uncountedAccessories(rail)).toBe(2);
    expect(accessoryShortages(rail).map((a) => a.slug)).toEqual(['voile']);
  });
});

describe('the demo shelf', () => {
  it('shows every state the screen has to render', () => {
    const products = demoProductStock();

    expect(productShortages(products).length).toBeGreaterThan(0);
    // A product with no threshold, and one with no unit cost — the two §6 renderings.
    expect(products.some((p) => p.reorderLevel === null)).toBe(true);
    expect(products.some((p) => p.unitCost === null)).toBe(true);
    // Nothing invents a zero cost, which would report a 100% margin.
    expect(products.every((p) => p.unitCost === null || p.unitCost > 0)).toBe(true);
  });

  it('leaves accessories uncounted, as the seed does', () => {
    const rail = demoAccessoryStock();

    expect(uncountedAccessories(rail)).toBeGreaterThan(0);
    // A counted one too, so both renderings can be judged side by side.
    expect(rail.some((a) => a.stockTotal > 0)).toBe(true);
  });
});

describe('recording a movement', () => {
  it('derives the sign from the reason, so it can never contradict it', () => {
    // The table's check constraint refuses a mismatched sign; this is why it never sees one.
    const used = stockMovementInput.parse({
      productSlug: 'coloration-7-3',
      reason: 'usage',
      quantity: '3',
      totalCost: '',
    });
    const delivered = stockMovementInput.parse({
      productSlug: 'coloration-7-3',
      reason: 'delivery',
      quantity: '12',
      totalCost: '9 500',
    });

    expect(used.signedQuantity).toBe(-3);
    expect(delivered.signedQuantity).toBe(12);
    // Dinars in, centimes out (§7).
    expect(delivered.totalCost).toBe(950_000);
  });

  it('keeps a correction pointing wherever it was typed', () => {
    const up = stockMovementInput.parse({
      productSlug: 'p',
      reason: 'correction',
      quantity: '2',
      totalCost: '',
    });

    expect(up.signedQuantity).toBe(2);
  });

  it('refuses a quantity of zero', () => {
    const result = stockMovementInput.safeParse({
      productSlug: 'p',
      reason: 'usage',
      quantity: '0',
      totalCost: '',
    });

    expect(result.success).toBe(false);
  });

  it('leaves a blank cost null rather than zero', () => {
    const parsed = stockMovementInput.parse({
      productSlug: 'p',
      reason: 'delivery',
      quantity: '1',
      totalCost: '',
    });

    // A zero here would post a 0 DA expense for a delivery that certainly cost something.
    expect(parsed.totalCost).toBeNull();
  });
});

describe('counting the rail', () => {
  it('maps a blank count back to uncounted', () => {
    expect(accessoryStockInput.parse({ slug: 'voile', stockTotal: '' }).stockTotal).toBe(0);
  });

  it('takes a real count', () => {
    expect(accessoryStockInput.parse({ slug: 'voile', stockTotal: '4' }).stockTotal).toBe(4);
  });

  it('refuses a fraction of a veil', () => {
    expect(accessoryStockInput.safeParse({ slug: 'voile', stockTotal: '2.5' }).success).toBe(false);
  });
});
