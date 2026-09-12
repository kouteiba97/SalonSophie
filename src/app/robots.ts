import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * The public site is for finding; the console is not.
 *
 * `/connexion` and everything behind it redirects a signed-out visitor anyway, so this is not the
 * boundary — RLS and the session check are. It is the difference between a door that is locked
 * and a door that is locked and unmarked: there is no reason for a crawler to be walking the
 * screens that hold every client's phone number, and no reason for a staff URL to surface in a
 * search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/fr/connexion',
        '/ar/connexion',
        '/en/connexion',
        '/fr/mot-de-passe',
        '/ar/mot-de-passe',
        '/en/mot-de-passe',
        '/fr/aujourdhui',
        '/ar/aujourdhui',
        '/en/aujourdhui',
        '/fr/ma-journee',
        '/ar/ma-journee',
        '/en/ma-journee',
        '/fr/atelier',
        '/ar/atelier',
        '/en/atelier',
        '/fr/clients',
        '/ar/clients',
        '/en/clients',
        '/fr/messages',
        '/ar/messages',
        '/en/messages',
        '/fr/prestations',
        '/ar/prestations',
        '/en/prestations',
        '/fr/stock',
        '/ar/stock',
        '/en/stock',
        '/fr/finances',
        '/ar/finances',
        '/en/finances',
        '/fr/equipe',
        '/ar/equipe',
        '/en/equipe',
        '/fr/collaborations',
        '/ar/collaborations',
        '/en/collaborations',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
