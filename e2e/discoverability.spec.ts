import { expect, test } from '@playwright/test';

/**
 * What a crawler is told, and what it is told to leave alone.
 *
 * Both files are generated rather than written by hand, so both can silently drift: the sitemap
 * follows the catalogue, and the disallow list follows the console's routes. A new console screen
 * that nobody adds here does not break a page — it just becomes crawlable, and the console holds
 * every client's phone number.
 *
 * These assertions are about the *rendered* output, which is the only place the drift shows.
 */

/** Every console route, in every locale. None may appear in the sitemap. */
const CONSOLE_PATHS = [
  'connexion',
  'mot-de-passe',
  'aujourdhui',
  'ma-journee',
  'atelier',
  'clients',
  'messages',
  'prestations',
  'stock',
  'finances',
  'equipe',
  'collaborations',
];

const LOCALES = ['fr', 'ar', 'en'];

test.describe('robots.txt', () => {
  test('disallows every console route in every locale', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    for (const locale of LOCALES) {
      for (const path of CONSOLE_PATHS) {
        expect(body, `${locale}/${path} must be disallowed`).toContain(
          `Disallow: /${locale}/${path}`,
        );
      }
    }
  });

  test('still lets the public site be crawled, and points at the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Allow: /');
    expect(body).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  });
});

test.describe('sitemap.xml', () => {
  test('lists the public site in all three locales and nothing behind the login', async ({
    request,
  }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(urls.length).toBeGreaterThan(0);

    // The console must not be discoverable, in any locale.
    const leaked = urls.filter((url) =>
      CONSOLE_PATHS.some((path) => LOCALES.some((l) => url.includes(`/${l}/${path}`))),
    );
    expect(leaked, `these console URLs are in the sitemap: ${leaked.join(', ')}`).toEqual([]);

    // Every locale carries the same number of pages, or one of them is quietly unindexable.
    const perLocale = LOCALES.map((l) => urls.filter((u) => new RegExp(`/${l}(/|$)`).test(u)).length);
    expect(new Set(perLocale).size, `uneven locales: ${perLocale.join(' / ')}`).toBe(1);

    // The landing pages a client actually reaches.
    for (const locale of LOCALES) {
      expect(urls.some((u) => u.endsWith(`/${locale}`))).toBe(true);
      expect(urls.some((u) => u.endsWith(`/${locale}/services`))).toBe(true);
      expect(urls.some((u) => u.endsWith(`/${locale}/robes`))).toBe(true);
    }
  });

  test('gives every gown its own indexable page, which is the point of the route', async ({
    request,
  }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // A bride sends her mother a link to one gown (§ conventions). Three gowns are seeded.
    const gowns = urls.filter((u) => /\/fr\/robes\/[^/]+$/.test(u));
    expect(gowns.length).toBeGreaterThanOrEqual(3);

    // And the tariff, which is what most visitors arrive looking for.
    const services = urls.filter((u) => /\/fr\/services\/[^/]+$/.test(u));
    expect(services.length).toBeGreaterThan(10);
  });
});

/**
 * The card WhatsApp draws when somebody sends the salon a link.
 *
 * Asserted per locale because it already broke per locale: Satori could not shape Arabic, the
 * route returned 500, and `og:image` pointed at an image that could not exist. Nothing in the
 * app surfaces that — you find out when a bride sends her mother a link and it arrives with a
 * torn thumbnail.
 */
test.describe('link previews', () => {
  for (const locale of LOCALES) {
    test(`${locale} declares a preview image, and the image exists`, async ({ request }) => {
      const html = await (await request.get(`/${locale}`)).text();

      const url = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
      expect(url, 'no og:image declared').toBeTruthy();

      // The tag carries the canonical origin; fetch it from the server under test.
      const path = new URL(url as string).pathname + new URL(url as string).search;
      const image = await request.get(path);

      expect(image.status(), `og:image for /${locale} is not reachable`).toBe(200);
      expect(image.headers()['content-type']).toContain('image/png');
      // A card that renders as an empty canvas still returns 200.
      expect((await image.body()).byteLength).toBeGreaterThan(10_000);
    });
  }
});
