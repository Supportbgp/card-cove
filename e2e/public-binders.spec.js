import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

function publicRow(overrides = {}) {
  return {
    name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
    item_type: 'single', grader: '', grade: '', qty: 1, price: 45,
    image_url: '', image_data: '', photo_url: '', photo_data: '', active_image: 'photo', location: 'Binder A',
    ...overrides,
  };
}

test('the public stock page lists public stock and filters it', async ({ page }) => {
  await seedHarness(page, {
    signedIn: false,
    seed: {
      catalog_public_view: [
        publicRow(),
        publicRow({ name: 'Black Lotus', set_name: 'Alpha', game: 'Magic', location: 'Case 1', price: 9000 }),
        publicRow({ name: 'Pikachu', set_name: 'Jungle', price: 3 }),
      ],
      public_binder_list: [{ location: 'Binder A' }, { location: 'Case 1' }],
    },
  });
  await page.goto('./?shop=1');

  await expect(page.getByText('3 cards')).toBeVisible();
  await expect(page.locator('.binder-card-name', { hasText: 'Black Lotus' })).toBeVisible();
  await expect(page.getByText('In: Case 1')).toBeVisible();

  await page.getByLabel('Search cards').fill('chari');
  await expect(page.getByText('1 card', { exact: true })).toBeVisible();
  await expect(page.locator('.binder-card-name', { hasText: 'Charizard' })).toBeVisible();
  await expect(page.locator('.binder-card-name', { hasText: 'Pikachu' })).toHaveCount(0);

  await page.getByLabel('Search cards').fill('');
  await page.getByLabel('Game').selectOption('Magic');
  await expect(page.getByText('1 card', { exact: true })).toBeVisible();
  await page.getByLabel('Game').selectOption('');
  await page.getByLabel('Binder').selectOption('Binder A');
  await expect(page.getByText('2 cards')).toBeVisible();

  // Never the signed-in app.
  await expect(page.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
});

test('the public stock page with nothing public says so', async ({ page }) => {
  await seedHarness(page, { signedIn: false, seed: { catalog_public_view: [], public_binder_list: [] } });
  await page.goto('./?shop=1');
  await expect(page.getByText('Nothing listed online right now')).toBeVisible();
});

test('staff choose which binders are public', async ({ page }) => {
  const seed = catalogSeed([
    makeCardRow({ sku: 'a', location: 'Binder A' }),
    makeCardRow({ sku: 'b', name: 'Pikachu', location: 'Binder B' }),
    makeCardRow({ sku: 'c', name: 'Bulk — Pokemon', location: 'Binder B', item_type: 'bulk', qty: 40 }),
  ]);
  seed.public_binders = [{ location: 'Binder B' }];
  await seedHarness(page, { seed });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();

  // The QR window warns about a binder that isn't public.
  await page.getByRole('button', { name: 'Binder QR code…' }).click();
  await page.getByLabel('Binder / case').selectOption('Binder A');
  await expect(page.getByText("This binder isn't public")).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Public binders…' }).click();
  const a = page.getByLabel(/^Binder A/);
  const b = page.getByLabel(/^Binder B/);
  await expect(a).not.toBeChecked();
  await expect(b).toBeChecked();
  // Bulk isn't counted as shown.
  await expect(page.getByText('Binder B · 1 card in stock')).toBeVisible();

  await a.check();
  await b.uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('1 binder is public')).toBeVisible();

  const rows = await page.evaluate(() => window.__HARNESS_DB__.public_binders.map(r => r.location));
  expect(rows).toEqual(['Binder A']);
});
