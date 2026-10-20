import { test, expect } from '@playwright/test';
import { seedHarness, makeCardRow, catalogSeed } from './fixtures.js';

// Duplicate: select one catalog item (here a sold one, the common case:
// "sold one last week, got another"), then Duplicate opens Add item
// prefilled from it, and Save creates a second, separate row.

test('duplicating a sold item opens a prefilled new item and saves a separate row', async ({ page }, testInfo) => {
  await seedHarness(page, {
    seed: catalogSeed([
      makeCardRow({ sku: 'sku-gecko', name: 'Gecko Moria', game: 'One Piece', set_name: 'OP01', qty: 0, sold: true, price: 12, cost: 3, notes: 'From Jake' }),
      makeCardRow({ sku: 'sku-other', name: 'Charizard', qty: 2 }),
    ]),
  });
  await page.goto('./');

  if (testInfo.project.name === 'Mobile') {
    await page.locator('.catalog-card-head').filter({ hasText: 'Gecko Moria' }).locator('input[type="checkbox"]').check();
  } else {
    await page.getByText('Gecko Moria').click();
  }
  await page.getByRole('button', { name: 'Duplicate' }).click();

  await expect(page.getByText('Duplicate item')).toBeVisible();
  await expect(page.getByText('Copy of Gecko Moria.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Duplicate item')).toHaveCount(0);

  const rows = await page.evaluate(() => window.__HARNESS_DB__.catalog.filter(r => r.name === 'Gecko Moria'));
  expect(rows).toHaveLength(2);
  const original = rows.find(r => r.sku === 'sku-gecko');
  const copy = rows.find(r => r.sku !== 'sku-gecko');
  expect(original).toMatchObject({ qty: 0, sold: true });
  expect(copy).toMatchObject({ qty: 1, sold: false, price: 12, set_name: 'OP01', game: 'One Piece', notes: 'From Jake' });
  expect(copy.cost ?? null).toBeNull();
});

test('Duplicate only appears when exactly one item is selected', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'Desktop', 'row-click selection is desktop-only');
  await seedHarness(page, {
    seed: catalogSeed([makeCardRow({ sku: 'a', name: 'Charizard' }), makeCardRow({ sku: 'b', name: 'Blastoise' })]),
  });
  await page.goto('./');
  await page.getByText('Charizard').click();
  await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await page.getByText('Blastoise').click();
  await expect(page.getByRole('button', { name: 'Duplicate' })).toHaveCount(0);
});
