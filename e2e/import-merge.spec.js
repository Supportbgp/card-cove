import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

// Import / Export → Cards, Merge: a row whose SKU is already in the catalog
// only changes what that row fills in. Blank cells and skipped columns keep
// the card's current value (CLAUDE.md "Merge imports keep what the file
// leaves out").

const charizard = makeCardRow({
  sku: 'c1', name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', qty: 2, price: 300,
  cost: 120, notes: 'top loader', location: 'Case A', photo_data: 'data:image/jpeg;base64,AAA',
  pos_channel: false,
});
const other = makeCardRow({ sku: 'o1', name: 'Pikachu', location: 'Binder B' });

test('a Merge import only changes what the file fills in', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([charizard, other]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();

  // Price for the existing card, a blank Cost cell, no Notes/Qty columns,
  // plus one new card.
  const csv = [
    'SKU,Name,Game,Price,Cost',
    'c1,Charizard,Pokemon,350,',
    'n1,Sol Ring,Magic,3,1.50',
  ].join('\n');
  await page.locator('input[accept=".csv,.xlsx"]').setInputFiles({
    name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  await expect(page.locator('.import-merge-note')).toBeVisible();
  // The batch's Binder / case goes on new cards only.
  await page.locator('.field-group', { hasText: 'Binder / case / collection for this import' })
    .locator('select').selectOption('Binder B');
  await page.locator('#imp_posChannel').check();
  await page.locator('#imp_skipImageSearch').check();
  await page.getByRole('button', { name: 'Import rows' }).click();

  await expect.poll(async () => page.evaluate(() => window.__HARNESS_DB__.catalog.length)).toBe(3);
  const rows = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(rows.find(r => r.sku === 'c1')).toMatchObject({
    price: 350, cost: 120, qty: 2, notes: 'top loader', location: 'Case A',
    photo_data: 'data:image/jpeg;base64,AAA', pos_channel: false,
  });
  expect(rows.find(r => r.sku === 'n1')).toMatchObject({ name: 'Sol Ring', qty: 1, cost: 1.5, pos_channel: true, location: 'Binder B' });
  await expect(page.getByText('1 was already in the catalog')).toBeVisible();
});
