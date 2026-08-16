import { expect, test } from '@playwright/test';

/**
 * The staff console's boundary, end to end.
 *
 * There is no Supabase project yet, so nobody can sign in and the console cannot be driven
 * further than this. What can be proven — and is worth proving on every commit — is that the
 * boundary holds in the direction that matters: signed out, every atelier URL sends you to the
 * login page rather than rendering a page and hoping RLS returns nothing.
 *
 * These run against `next start`, so they also catch the failure mode the unit tests cannot: a
 * console page accidentally prerendered at build time would serve a cached redirect (or worse, a
 * cached page) instead of asking who you are.
 */

const GUARDED = [
  '/fr/aujourdhui',
  '/fr/clients',
  '/fr/prestations',
  '/fr/messages',
  '/fr/collaborations',
  '/fr/atelier',
  '/fr/atelier/reservations',
  '/fr/atelier/robes/anastasia',
  '/ar/aujourdhui',
  '/ar/messages',
  '/ar/atelier',
  '/en/atelier',
];

test.describe('signed out', () => {
  for (const path of GUARDED) {
    test(`${path} redirects to the login page`, async ({ page }) => {
      await page.goto(path);
      // The locale survives the redirect: an Arabic-speaking receptionist stays in Arabic.
      const locale = path.split('/')[1];
      await expect(page).toHaveURL(new RegExp(`/${locale}/connexion$`));
    });
  }
});

test('the login page renders and is kept out of search results', async ({ page }) => {
  await page.goto('/fr/connexion');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // A console indexed by Google is a console someone finds without being told about it.
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute('content', /noindex/);
});

/**
 * Arabic is tested before English (§12.3). The console shares the document shell with the public
 * site, so a regression in direction would show up here first.
 */
test('the Arabic console is right to left', async ({ page }) => {
  await page.goto('/ar/connexion');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});

/**
 * With no database configured the form would be a dead end, so the page says so instead of
 * showing a password field that could only ever fail. The same honesty the booking flow uses
 * when it degrades to request mode.
 */
test('says plainly that no database is connected', async ({ page }) => {
  await page.goto('/fr/connexion');

  await expect(page.getByRole('status')).toContainText(/Supabase/);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
});

test('the public site keeps its own chrome after the route split', async ({ page }) => {
  await page.goto('/fr');

  // The header, footer and WhatsApp bubble live in the (site) group now; the console has none
  // of them. If the split leaked, this is where it shows.
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();

  await page.goto('/fr/connexion');
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
});
