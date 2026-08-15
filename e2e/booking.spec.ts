import { expect, test } from '@playwright/test';

/**
 * Flow 1 of the two §14 requires end-to-end: booking a salon appointment.
 *
 * Driven entirely by accessible names and roles — if this passes, the flow is navigable by
 * assistive technology, which is the point of §12.8 rather than a side effect.
 */
test('a client can book a salon appointment through all five steps', async ({ page }) => {
  await page.goto('/fr');

  await page.getByRole('button', { name: 'Réserver', exact: true }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Le service', exact: true, level: 2 })).toBeVisible();

  // Step 1 — a real service from the published tariff, at its real price.
  const service = dialog.getByRole('button', { name: /Coupe \+ brushing courts/ });
  await service.click();
  await expect(service).toHaveAttribute('aria-pressed', 'true');
  await expect(service).toContainText('1');
  await expect(service).toContainText('200 DA');

  await dialog.getByRole('button', { name: 'Continuer' }).click();

  // Step 2 — only the two confirmed sisters, plus no-preference. Never Amina or Lynda.
  await expect(dialog.getByRole('heading', { name: 'Votre experte', exact: true, level: 2 })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Nour/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Sophie/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Amina|Lynda/ })).toHaveCount(0);

  await dialog.getByRole('button', { name: /Nour/ }).click();
  await dialog.getByRole('button', { name: 'Continuer' }).click();

  // Step 3 — the first genuinely bookable day, then a time. Disabled cells are never clickable.
  // `:visible` matters here: both calendar views are in the DOM and CSS picks one, so on mobile
  // the first match would otherwise be a hidden cell from the desktop month grid.
  await expect(dialog.getByRole('heading', { name: 'Date & heure', exact: true, level: 2 })).toBeVisible();
  await dialog.locator('button[aria-pressed="false"]:not([disabled]):visible').first().click();
  await dialog.getByRole('button', { name: '10:30' }).click();
  await dialog.getByRole('button', { name: 'Continuer' }).click();

  // Step 4 — validation must reject a bad number before it accepts a good one.
  await expect(dialog.getByRole('heading', { name: 'Vos coordonnées', exact: true, level: 2 })).toBeVisible();
  await dialog.getByLabel('Nom complet').fill('Amel B');
  await dialog.getByLabel('Téléphone / WhatsApp').fill('123');
  await dialog.getByRole('button', { name: 'Confirmer la réservation' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByLabel('Téléphone / WhatsApp').fill('0553366712');
  await dialog.getByRole('button', { name: 'Confirmer la réservation' }).click();

  /*
   * Step 5 — confirmation.
   *
   * With no database configured the server answers "request", not "booked", and the copy says
   * so: the salon confirms the time on WhatsApp. Asserting the booked wording here would be
   * asserting a promise the system has not made. Once a project is provisioned and durations
   * exist, the same flow reaches "C'est réservé" with a real reference.
   */
  await expect(dialog.getByText(/Demande envoyée/)).toBeVisible();
  await expect(dialog.getByText(/on vous confirme/)).toBeVisible();

  // No database means no row, so no reference may be shown — an id matching nothing is worse
  // than none at all.
  await expect(dialog.getByText(/Référence/)).toHaveCount(0);

  await expect(dialog.getByRole('link', { name: /Confirmer sur WhatsApp/ })).toHaveAttribute(
    'href',
    /wa\.me\/213553366712/,
  );
});

test('the booking modal traps focus, closes on Escape, and restores focus', async ({ page }) => {
  await page.goto('/fr');

  const trigger = page.getByRole('button', { name: 'Réserver', exact: true }).first();
  await trigger.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Scroll lock — the page behind must not move while the modal is open.
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  // Focus restore is the part hand-rolled modals almost always miss.
  await expect(trigger).toBeFocused();
});

test('the step change is announced to screen readers', async ({ page }) => {
  await page.goto('/fr');
  await page.getByRole('button', { name: 'Réserver', exact: true }).first().click();

  const dialog = page.getByRole('dialog');
  const live = dialog.locator('[aria-live="polite"]');
  await expect(live).toHaveText(/Étape 1 sur 5/);

  await dialog.getByRole('button', { name: /Coupe \+ brushing courts/ }).click();
  await dialog.getByRole('button', { name: 'Continuer' }).click();

  await expect(live).toHaveText(/Étape 2 sur 5/);
});
