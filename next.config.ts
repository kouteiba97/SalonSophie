import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Security headers.
 *
 * There were none. For a marketing page that is untidy; for this one it is not, because the same
 * origin serves a console holding every client's phone number, and the two share a session cookie.
 *
 * `script-src` keeps `'unsafe-inline'`, deliberately and with regret. Next's App Router streams
 * its hydration payload through inline `<script>` tags it generates per response, so the honest
 * alternatives are a per-request nonce or nothing. A nonce has to be minted in middleware and read
 * during render, which forces every page out of static rendering — and `/[locale]` and every
 * service and gown page are prerendered today (`●` in the build output). Trading that for a
 * directive is the wrong trade on Algerian 4G, where the static HTML is most of why the page is
 * fast.
 *
 * What the rest of the policy still buys, with `'unsafe-inline'` in place: no third-party script
 * origin can load at all, `object-src 'none'` closes the plugin surface, `base-uri 'self'` stops
 * an injected `<base>` from redirecting every relative URL, and `form-action 'self'` stops an
 * injected form from posting a client's details somewhere else. XSS via an inline `<script>` is
 * the hole; everything downstream of it is shut.
 *
 * `connect-src 'self'` is genuinely tight here: there is no browser-side Supabase client. Every
 * database call goes through a Server Action or a Server Component, so the anon key is used
 * server-side and the browser only ever talks to this origin. If a browser client is ever added,
 * this line has to learn the Supabase URL — and the fact that it does not is worth keeping.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Tailwind and next/font both emit inline styles; there is no build without this.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  // The console must never be framed: a session cookie plus an invisible iframe is clickjacking.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  /*
   * Two years, subdomains included. Deliberately without `preload`: that submits the domain to a
   * browser-baked list which is slow to leave, and is the owner's decision rather than a default.
   */
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy twin of frame-ancestors, for browsers that predate it.
  { key: 'X-Frame-Options', value: 'DENY' },
  /*
   * A console URL can name a client — /clients/<id> — so the path must not travel to another
   * origin. Cross-origin requests send the origin only; same-origin keeps the full path.
   */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs a camera, a microphone or a location. Say so rather than leaving it open.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A version header naming the framework helps nobody outside the building.
  poweredByHeader: false,
  images: {
    // Phase 1 serves branded local placeholders; Phase 2 swaps in Supabase Storage.
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
