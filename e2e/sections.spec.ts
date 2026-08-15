import { expect, test } from '@playwright/test';

/**
 * Every section of the approved design must actually appear.
 *
 * Reveals are IntersectionObserver-driven and start at `opacity: 0`, which means a broken
 * observer, a failed hydration, or an unresolved Suspense boundary all present the same way to a
 * client: a blank page below the hero. That is invisible to a smoke test that only checks the
 * DOM, so this asserts computed visibility after scrolling, section by section.
 */
const SECTIONS = [
  { name: 'services', heading: /Huit univers/ },
  { name: 'bridal', heading: /Say yes to the/ },
  { name: 'packages', heading: /Tout le grand jour/ },
  { name: 'tarifs', heading: /La carte complète/ },
  { name: 'sisters', heading: /Deux sœurs/ },
  { name: 'transformations', heading: /Avant, après/ },
  { name: 'testimonials', heading: /Ce que nos clientes/ },
  { name: 'instagram', heading: /Le studio, tous les jours/ },
  { name: 'contact', heading: /UV5, Nouvelle Ville/ },
];

test('every section reveals when scrolled into view', async ({ page }) => {
  await page.goto('/fr');

  for (const section of SECTIONS) {
    const heading = page.getByRole('heading', { name: section.heading });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading, `${section.name} heading should be visible`).toBeVisible({ timeout: 8000 });

    // Visible in the DOM sense is not enough — Playwright's visibility check ignores opacity,
    // so poll until the 0.8s fade has actually finished.
    await expect
      .poll(
        () =>
          heading.evaluate((el) => {
            const wrapper = el.closest('.ns-reveal') ?? el;
            return Number(getComputedStyle(wrapper).opacity);
          }),
        { message: `${section.name} should not be left at opacity 0`, timeout: 5000 },
      )
      .toBeGreaterThan(0.9);
  }
});

/**
 * The stylesheet must actually load.
 *
 * This exists because it once did not: a hand-written <head> in the locale layout displaced
 * Next's own stylesheet link, and every other test still passed — assertions on roles and text
 * do not notice an unstyled page, and the reveal test passed *because* the missing CSS left
 * `.ns-reveal` at its default opacity of 1. Only a screenshot caught it. Assert on a token.
 */
test('the design tokens are actually applied', async ({ page }) => {
  await page.goto('/fr');

  // --color-cream, #f7f3f0.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 243, 240)');

  // Self-hosted display face, not a fallback serif.
  const headingFont = await page
    .getByRole('heading', { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(headingFont).toContain('cormorant');

  // The sticky header must be sticky, i.e. utilities compiled.
  await expect(page.locator('header')).toHaveCSS('position', 'sticky');
});

test('the page has real height, not a collapsed shell', async ({ page }) => {
  await page.goto('/fr');
  await page.getByRole('heading', { name: /UV5, Nouvelle Ville/ }).scrollIntoViewIfNeeded();
  const height = await page.evaluate(() => document.body.scrollHeight);
  expect(height).toBeGreaterThan(4000);
});
