import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Import / Export → Cards: a "Cost" column maps to each card's Cost (what the
// shop paid per copy), which feeds the Reports tab's Cost/Profit.

test('a Cost column in a CSV import is saved on each card', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();

  const csv = [
    'SKU,Name,Game,Qty,Price,Cost',
    'imp-1,Charizard,Pokemon,2,45,"$20.50"',
    'imp-2,Sol Ring,Magic,1,3,',
  ].join('\n');
  await page.locator('input[accept=".csv,.xlsx"]').setInputFiles({
    name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });

  // The Cost column is matched automatically.
  const costRow = page.locator('.map-row', { hasText: 'Cost ($)' });
  await expect(costRow.locator('select')).toHaveValue('Cost');

  await page.locator('#imp_posChannel').check();
  await page.locator('#imp_skipImageSearch').check();
  await page.getByRole('button', { name: 'Import rows' }).click();

  await expect.poll(async () => page.evaluate(() => window.__HARNESS_DB__.catalog.length)).toBe(2);
  const rows = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(rows.find(r => r.sku === 'imp-1')).toMatchObject({ name: 'Charizard', price: 45, cost: 20.5, qty: 2 });
  expect(rows.find(r => r.sku === 'imp-2').cost ?? null).toBeNull();
});
