import { expect, test } from '@playwright/test';

/**
 * The headers, asserted on a real response.
 *
 * They live in `next.config.ts`, which nothing else tests and which is edited for unrelated
 * reasons — an image domain, a redirect, a bundler flag. A header silently dropped there is
 * invisible until someone thinks to look, and "someone thought to look" is not a security
 * control.
 *
 * The console is the reason these matter more than they would on a marketing page: it shares an
 * origin and a session cookie with the public site, and it holds every client's phone number.
 */

const PAGES = ['/fr', '/ar', '/fr/robes'];

test.describe('security headers', () => {
  for (const path of PAGES) {
    test(`${path} refuses to be framed`, async ({ request }) => {
      const res = await request.get(path);
      const csp = res.headers()['content-security-policy'] ?? '';

      // Both, because X-Frame-Options is what older browsers understand.
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers()['x-frame-options']).toBe('DENY');
    });
  }

  test('sets a content security policy that closes the non-script surface', async ({ request }) => {
    const csp = (await request.get('/fr')).headers()['content-security-policy'] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // An injected <base> would repoint every relative URL on the page.
    expect(csp).toContain("base-uri 'self'");
    // An injected form must not be able to post a client's details to another origin.
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  /**
   * There is no browser-side Supabase client: every database call goes through a Server Action or
   * a Server Component. If that ever changes, `connect-src` has to learn the Supabase origin, and
   * this test is where that decision gets noticed rather than discovered.
   */
  test('allows the browser to talk to this origin and nowhere else', async ({ request }) => {
    const csp = (await request.get('/fr')).headers()['content-security-policy'] ?? '';
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('connect-src *');
  });

  test('does not leak a console path to another origin, or announce the framework', async ({
    request,
  }) => {
    const res = await request.get('/fr');
    // /clients/<id> names a client; the path must not travel cross-origin.
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });

  test('asks for HTTPS for long enough to matter', async ({ request }) => {
    const hsts = (await request.get('/fr')).headers()['strict-transport-security'] ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain('includeSubDomains');
  });

  test('turns off the device APIs nothing here uses', async ({ request }) => {
    const pp = (await request.get('/fr')).headers()['permissions-policy'] ?? '';
    for (const feature of ['camera=()', 'microphone=()', 'geolocation=()']) {
      expect(pp).toContain(feature);
    }
  });
});
