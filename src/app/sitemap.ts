import type { MetadataRoute } from 'next';

import { getCatalogue } from '@/data/catalogue';
import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/site';

/**
 * Every public page, in every locale.
 *
 * The brief makes this load-bearing rather than decorative. §5.6 item 23 requires all three
 * locales to be indexable at their own path, and the reason every service and every gown has its
 * own route is that "a bride must be able to send her mother a link to one gown" — a link nobody
 * can find is only half of that.
 *
 * The staff console is absent on purpose, and is also disallowed in `robots.ts`. It holds every
 * client's phone number.
 *
 * Gowns and services come from the catalogue, so the sitemap follows the tariff rather than a
 * second list that drifts from it. With no database configured it reads the committed seed, which
 * means a preview deploy still produces a correct sitemap instead of an empty one.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { services, gowns } = await getCatalogue();
  const now = new Date();

  /** The same path in all three locales, cross-referenced so each declares the others. */
  const entry = (path: string, priority: number): MetadataRoute.Sitemap =>
    routing.locales.map((locale) => ({
      url: `${siteUrl()}/${locale}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((other) => [other, `${siteUrl()}/${other}${path}`]),
        ),
      },
    }));

  return [
    ...entry('', 1),
    ...entry('/services', 0.8),
    ...entry('/robes', 0.8),
    // Linked from every page's footer, so it should be findable rather than only reachable.
    ...entry('/confidentialite', 0.3),
    // A gown outranks a single service: it is the page a bride actually sends to somebody.
    ...gowns.flatMap((gown) => entry(`/robes/${gown.slug}`, 0.7)),
    ...services.flatMap((service) => entry(`/services/${service.slug}`, 0.6)),
  ];
}
