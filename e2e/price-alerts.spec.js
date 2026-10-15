import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

// Price-spike alerts UI (Feature B, PR 2): the topbar badge, the alerts list,
// the Catalog row marker, Edit's reference box, and clearing an alert. The
// alerts themselves are written by the daily price-check Edge Function — here
// they're seeded straight into the harness DB.
function makeAlertRow(overrides = {}) {
  return {
    id: 'alert-1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon',
    previous_price: 250, new_price: 417.78, pct_change: 67.1,
    detected_at: '2026-10-14T13:07:00.000Z', acknowledged: false,
    ...overrides,
  };
}

function seedWithAlert(alerts = [makeAlertRow()]) {
  return {
    ...catalogSeed([makeCardRow({ sku: 'sku-1', name: 'Charizard', price: 250 })]),
    price_alerts: alerts,
  };
}

const harnessAlerts = (page) => page.evaluate(() => window.__HARNESS_DB__.price_alerts);

test('no open alerts means no badge and no row markers', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert([makeAlertRow({ acknowledged: true })]) });
  await page.goto('./');
  await expect(page.locator('.pending-badge')).toBeVisible();
  await expect(page.locator('.price-alerts-badge')).toHaveCount(0);
  await expect(page.locator('.price-alert-marker')).toHaveCount(0);
});

test('an open alert shows a topbar badge and a marker on the item\'s price', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert() });
  await page.goto('./');
  await expect(page.locator('.price-alerts-badge')).toHaveText(/1 price alert$/);
  await expect(page.locator('.price-alert-marker')).toHaveCount(1);

  await page.locator('.price-alerts-badge').click();
  const row = page.locator('.price-alert-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Charizard');
  await expect(row).toContainText('$250.00');
  await expect(row).toContainText('$417.78');
  await expect(row).toContainText('+67%');
});

test('"Find card" opens Edit with the alert for reference, never changes the price itself, and saving clears the alert', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert() });
  await page.goto('./');
  await page.locator('.price-alerts-badge').click();
  await page.locator('.price-alert-row').getByRole('button', { name: 'Find card' }).click();

  await expect(page.getByText('Edit item')).toBeVisible();
  await expect(page.locator('.price-alert-ref')).toContainText('$417.78');
  // Not prefilled — Our Price is still the item's own price until staff change it.
  const ourPrice = page.locator('.field-group', { hasText: 'Our price ($)' }).locator('input');
  await expect(ourPrice).toHaveValue('250');

  await ourPrice.fill('400');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.price-alerts-badge')).toHaveCount(0);
  await expect(page.locator('.price-alert-marker')).toHaveCount(0);
  const alerts = await harnessAlerts(page);
  expect(alerts[0].acknowledged).toBe(true); // acknowledged, not deleted
  const catalog = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(catalog[0].price).toBe(400);
});

test('Dismiss acknowledges the alert and leaves the price alone', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert() });
  await page.goto('./');
  await page.locator('.price-alerts-badge').click();
  await page.locator('.price-alert-row').getByRole('button', { name: 'Dismiss' }).click();

  await expect(page.locator('.price-alert-row')).toHaveCount(0);
  await expect(page.getByText('No open alerts')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.price-alerts-badge')).toHaveCount(0);

  const alerts = await harnessAlerts(page);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].acknowledged).toBe(true);
  const catalog = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(catalog[0].price).toBe(250);
});

test('an alert for an item no longer in the catalog can be dismissed but not opened', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert([makeAlertRow({ sku: 'gone-sku', name: 'Blastoise' })]) });
  await page.goto('./');
  await page.locator('.price-alerts-badge').click();
  const row = page.locator('.price-alert-row');
  await expect(row).toContainText('no longer in the catalog');
  await expect(row.getByRole('button', { name: 'Find card' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
});

test('Pricing settings edits the daily price check\'s floor and spike thresholds', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert([]) });
  await page.goto('./');
  await page.getByRole('link', { name: 'Pricing settings' }).click();
  await page.getByLabel('Track items priced at or above ($)').fill('40');
  await page.getByLabel('Alert when market is up at least (%)').fill('15');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect.poll(async () => page.evaluate(() => window.__HARNESS_DB__.price_tracking_settings[0]))
    .toMatchObject({ floor_price: 40, spike_pct: 15 });
});

test('each alert shows which card the check compared against, in the list and in Edit', async ({ page }) => {
  await seedHarness(page, {
    seed: seedWithAlert([makeAlertRow({
      matched_name: 'Charizard', matched_set: 'Base Set 2', matched_number: '4',
      matched_image: '', matched_url: 'https://www.tcgplayer.com/product/42479', match_basis: 'set',
    })]),
  });
  await page.goto('./');
  await page.locator('.price-alerts-badge').click();
  const match = page.locator('.price-alert-row .price-alert-match');
  await expect(match).toContainText('Compared against: Charizard — Base Set 2 #4');
  await expect(match).toContainText("matched by this item's Set");
  await expect(match.getByRole('link', { name: /View listing/ })).toHaveAttribute('href', 'https://www.tcgplayer.com/product/42479');

  await page.locator('.price-alert-row').getByRole('button', { name: 'Find card' }).click();
  await expect(page.locator('.price-alert-ref .price-alert-match')).toContainText('Base Set 2 #4');
});

test('an alert raised before matched-card recording says so instead of showing nothing', async ({ page }) => {
  await seedHarness(page, { seed: seedWithAlert() });
  await page.goto('./');
  await page.locator('.price-alerts-badge').click();
  await expect(page.locator('.price-alert-match.none')).toContainText('not recorded');
});
