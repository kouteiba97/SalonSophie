/**
 * The site's own origin.
 *
 * Read through a function rather than a module constant so a deploy that sets
 * `NEXT_PUBLIC_SITE_URL` is honoured at request time. The fallback is the real domain, because a
 * sitemap or a canonical tag pointing at `localhost` is worse than one that is merely premature.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thesisters-ns.dz').replace(/\/+$/, '');
}
