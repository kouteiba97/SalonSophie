import type { AccessoryStock, ProductStock } from './stock';

/**
 * What the salon is short of — the one question the stock screen exists to answer.
 *
 * A pure function, deliberately, and in its own module rather than inside the page: it encodes a
 * §6 judgement that is easy to get quietly wrong, and a rule nobody can test is a rule nobody can
 * trust. No clock, no database — a shelf goes in, a list of shortages comes out.
 *
 * Type-only import from the `server-only` module above it, so this stays loadable in a plain unit
 * test while the reads it describes do not.
 */

/**
 * A product is short when the database says so.
 *
 * `product_stock.needs_reorder` is already false when no threshold exists, because a threshold
 * nobody set is not the same as a stock level that is fine. This mirrors that rather than
 * recomputing it, so the screen and the reporting function cannot drift apart.
 */
export function productShortages(products: ProductStock[]): ProductStock[] {
  return products.filter((product) => product.needsReorder);
}

/**
 * An accessory is short when every one it owns is out today.
 *
 * The subtle case is `stockTotal === 0`, which is the seeded default and means *nobody has
 * counted these* — not "we own none". Reading it as an empty shelf would raise an alarm about a
 * rail that may be perfectly full, and would do it for all three accessories on the day the salon
 * first opens the screen. `check_accessory_stock` makes the same call: it skips its limit
 * entirely on zero.
 *
 * So an uncounted accessory is never short. It is *unknown*, which the screen says separately.
 */
export function isAccessoryShort(accessory: AccessoryStock): boolean {
  return accessory.stockTotal > 0 && accessory.outOnLoan >= accessory.stockTotal;
}

export function accessoryShortages(accessories: AccessoryStock[]): AccessoryStock[] {
  return accessories.filter(isAccessoryShort);
}

/** How many accessories nobody has counted — the gap, kept distinct from a shortage. */
export function uncountedAccessories(accessories: AccessoryStock[]): number {
  return accessories.filter((accessory) => accessory.stockTotal === 0).length;
}
