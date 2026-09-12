import { cache } from 'react';
import { getSupabaseServerClient, isDatabaseConfigured } from '@/lib/supabase/server';
import type {
  GownRow,
  ServiceCategoryRow,
  ServiceRow,
  AccessoryRow,
  StaffRow,
} from '@/lib/supabase/types';
import { TODO_GOWN_RENTAL_PRICE, TODO_SERVICE_DURATION } from '@/lib/todo';
import type { Price } from '@/lib/money';
import { ACCESSORIES as STATIC_ACCESSORIES, GOWNS as STATIC_GOWNS } from './bridal';
import { CATEGORIES as STATIC_CATEGORIES, SERVICES as STATIC_SERVICES } from './services';
import { EXPERTS as STATIC_EXPERTS } from './team';
import type { Accessory, Expert, Gown, Service, ServiceCategory } from './types';

/**
 * The catalogue, read from the database when one is configured and from the static seed
 * otherwise.
 *
 * The fallback is not a convenience. The same tariff is committed to the repo and seeded into
 * Postgres by the same migration, so a build, a preview deploy or a local checkout with no
 * credentials renders the real prices rather than an empty page — and the day the database is
 * unreachable, the public site still shows a client what a brushing costs.
 *
 * Every read goes through React's `cache()`, so a page that renders the grid, the tariff and the
 * booking modal makes one query, not three.
 */

export interface Catalogue {
  categories: ServiceCategory[];
  services: Service[];
  gowns: Gown[];
  accessories: Accessory[];
  /**
   * Who a client may book.
   *
   * Read from `staff`, not from a constant. It used to be a hardcoded pair, and the reasoning
   * was sound at the time — §6 forbids inventing staff, and the design's roster invented two
   * people. But the roster stopped being unknown the day an owner could hire from `/equipe`:
   * it is now the salon's own record, and reading it is the opposite of inventing it.
   *
   * Leaving it hardcoded had already produced the failure §6 exists to prevent, pointing the
   * other way. A real stylist with a real schedule was bookable in the database and invisible on
   * the website, so no client could ever choose her.
   */
  team: Expert[];
  /** True when the rows came from Postgres; useful in diagnostics and tests. */
  fromDatabase: boolean;
}

/**
 * Slugs the message catalogues carry a translated role line for.
 *
 * Without this, reading the roster from the database quietly untranslated the two sisters: their
 * `specialty` is stored in French, so the Arabic booking step showed "Coiffure & mariée" under
 * Nour. Arabic is a first-class locale, not a translation layer, and it is the surface that
 * catches this kind of regression — which is why it is tested first.
 */
const TRANSLATED_ROLES = new Set(['nour', 'sophie']);

function mapStaff(row: StaffRow): Expert {
  return {
    slug: row.slug,
    name: row.display_name,
    // The key wins where one exists; `specialty` is the untranslated fallback for a new hire.
    roleKey: TRANSLATED_ROLES.has(row.slug) ? `team.${row.slug}.role` : undefined,
    specialty: row.specialty,
  };
}

function toPrice(row: ServiceRow): Price {
  switch (row.kind) {
    case 'free':
      return { kind: 'free' };
    case 'range':
      // The database's check constraint guarantees both bounds exist for a range.
      return { kind: 'range', min: row.price_min!, max: row.price_max! };
    case 'from':
      return { kind: 'from', amount: row.price_min! };
    case 'addon':
      return { kind: 'addon', amount: row.price_min! };
    case 'fixed':
    default:
      return { kind: 'fixed', amount: row.price_min! };
  }
}

function mapCategory(row: ServiceCategoryRow): ServiceCategory {
  return { slug: row.slug, name: row.name, order: row.sort_order };
}

function mapService(row: ServiceRow, categorySlugById: Map<string, string>): Service {
  return {
    slug: row.slug,
    categorySlug: categorySlugById.get(row.category_id) ?? '',
    name: row.name,
    price: toPrice(row),
    // Null in the database means genuinely unknown, which is exactly what TODO_* represents.
    duration: row.duration_minutes ?? TODO_SERVICE_DURATION,
  };
}

function mapGown(row: GownRow): Gown {
  return {
    slug: row.slug,
    name: row.name,
    tier: row.tier,
    sizeMin: row.size_min,
    sizeMax: row.size_max,
    rentalPrice: row.rental_price === null ? TODO_GOWN_RENTAL_PRICE : { kind: 'fixed', amount: row.rental_price },
    imageId: row.image_id ?? `ns-gown-${row.slug}`,
  };
}

function mapAccessory(row: AccessoryRow): Accessory {
  return { slug: row.slug, name: row.name };
}

const staticCatalogue = (): Catalogue => ({
  categories: STATIC_CATEGORIES,
  services: STATIC_SERVICES,
  gowns: STATIC_GOWNS,
  accessories: STATIC_ACCESSORIES,
  team: STATIC_EXPERTS,
  fromDatabase: false,
});

export const getCatalogue = cache(async (): Promise<Catalogue> => {
  const supabase = getSupabaseServerClient();
  if (!supabase) return staticCatalogue();

  try {
    /*
     * `.returns<T>()` states the row shape rather than inferring it. The Database generic here
     * is hand-written (no project exists yet to generate from), and an approximate generic makes
     * supabase-js infer `never`. Once `supabase gen types` produces the real file, these calls
     * can drop the explicit type and let inference do it.
     */
    const [categoriesRes, servicesRes, gownsRes, accessoriesRes, staffRes] = await Promise.all([
      supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .returns<ServiceCategoryRow[]>(),
      supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .returns<ServiceRow[]>(),
      supabase
        .from('gowns')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .returns<GownRow[]>(),
      supabase
        .from('accessories')
        .select('*')
        .eq('is_active', true)
        .order('name')
        .returns<AccessoryRow[]>(),
      supabase
        .from('staff')
        .select('*')
        .eq('is_bookable', true)
        .order('sort_order')
        .returns<StaffRow[]>(),
    ]);

    // Checked one at a time: a PostgrestResponse is a discriminated union, and testing the
    // errors collectively leaves `data` unnarrowed.
    if (categoriesRes.error) throw categoriesRes.error;
    if (servicesRes.error) throw servicesRes.error;
    if (gownsRes.error) throw gownsRes.error;
    if (accessoriesRes.error) throw accessoriesRes.error;
    if (staffRes.error) throw staffRes.error;

    // An empty catalogue means the migration ran but the seed did not. Showing a client an empty
    // price list is worse than showing the committed one, so fall back rather than render blank.
    if (categoriesRes.data.length === 0 || servicesRes.data.length === 0) return staticCatalogue();

    const categorySlugById = new Map(categoriesRes.data.map((c) => [c.id, c.slug]));

    return {
      categories: categoriesRes.data.map(mapCategory),
      services: servicesRes.data.map((s) => mapService(s, categorySlugById)),
      gowns: gownsRes.data.map(mapGown),
      accessories: accessoriesRes.data.map(mapAccessory),
      // An empty roster falls back rather than offering a client nobody to choose. The seeded
      // two are the ones §6 confirms exist, so this is the same honesty as the tariff fallback.
      team: staffRes.data.length > 0 ? staffRes.data.map(mapStaff) : STATIC_EXPERTS,
      fromDatabase: true,
    };
  } catch (error) {
    // Never take the public site down because Postgres blinked.
    console.error('[N&S] catalogue read failed, serving the committed seed instead:', error);
    return staticCatalogue();
  }
});

export const catalogueSource = () => (isDatabaseConfigured ? 'database' : 'static seed');

/* ── Lookups ─────────────────────────────────────────────────────────────────────────────── */

export async function findServiceBySlug(slug: string): Promise<Service | undefined> {
  const { services } = await getCatalogue();
  return services.find((s) => s.slug === slug);
}

export async function findCategoryBySlug(slug: string): Promise<ServiceCategory | undefined> {
  const { categories } = await getCatalogue();
  return categories.find((c) => c.slug === slug);
}

export async function findGownBySlug(slug: string): Promise<Gown | undefined> {
  const { gowns } = await getCatalogue();
  return gowns.find((g) => g.slug === slug);
}
