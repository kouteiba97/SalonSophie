import { expect, test } from '@playwright/test';

/**
 * Flow 2 of the two §14 requires end-to-end: reserving a gown.
 *
 * In Phase 1 that means reaching one gown by its own URL and starting a fitting — the rental
 * itself is a date range against physical stock and lands in Phase 4 behind the exclusion
 * constraint. What this asserts is the part a bride does today: find the dress, see the sizes,
 * send the link, ask for a fitting.
 */
test('a bride can open one gown by URL and see its sizes', async ({ page }) => {
  await page.goto('/fr/robes/anastasia');

  await expect(page.getByRole('heading', { name: 'Anastasia', level: 1 })).toBeVisible();

  // Sizes are the most-asked question (§6) — visible without a click.
  await expect(page.getByText('36 – 42')).toBeVisible();

  // Rental price is unknown, so it must read "Sur devis" and never a number.
  await expect(page.getByText('Sur devis').first()).toBeVisible();

  // The page must be linkable and self-describing.
  await expect(page).toHaveTitle(/Anastasia/);
});

test('choosing a gown books a fitting, not a rental', async ({ page }) => {
  await page.goto('/fr/robes/anastasia');

  // The distinction is stated to the client, not just enforced in the data model.
  await expect(page.getByText(/réserve un essai, pas la location/)).toBeVisible();

  await page.getByRole('button', { name: /Réserver un essai/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Opens at step 2 with the gown already chosen.
  await expect(dialog.getByRole('heading', { name: 'Votre experte', exact: true, level: 2 })).toBeVisible();

  await dialog.getByRole('button', { name: /Sophie/ }).click();
  await dialog.getByRole('button', { name: 'Continuer' }).click();
  await expect(dialog.getByRole('heading', { name: 'Date & heure', exact: true, level: 2 })).toBeVisible();
});

test('every gown card in the gallery shows its size range', async ({ page }) => {
  await page.goto('/fr/robes');

  for (const [name, sizes] of [
    ['Anastasia', '36 – 42'],
    ['ABir', '38 – 44'],
    ['RYMA', '36 – 40'],
  ] as const) {
    await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible();
    await expect(page.getByText(`Tailles ${sizes}`)).toBeVisible();
  }
});
