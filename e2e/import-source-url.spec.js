import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Import / Export → Cards: a Source URL cell is only kept when it's a plain
// http(s) link. Anything else (e.g. "javascript:...") is dropped at import,
// so it's never saved and never becomes a clickable link in the Catalog.

test('an imported Source URL keeps http(s) links and drops script URLs', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();

  const csv = [
    'SKU,Name,Game,Qty,Price,Source URL',
    'imp-1,Charizard,Pokemon,1,45,https://www.tcgplayer.com/product/1',
    'imp-2,Sol Ring,Magic,1,3,javascript:alert(document.cookie)',
  ].join('\n');
  await page.locator('input[accept=".csv,.xlsx"]').setInputFiles({
    name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });

  await expect(page.locator('.map-row', { hasText: 'Source / Product URL' }).locator('select')).toHaveValue('Source URL');
  await page.locator('#imp_posChannel').check();
  await page.locator('#imp_skipImageSearch').check();
  await page.getByRole('button', { name: 'Import rows' }).click();

  await expect.poll(async () => page.evaluate(() => window.__HARNESS_DB__.catalog.length)).toBe(2);
  const rows = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(rows.find(r => r.sku === 'imp-1').source_url).toBe('https://www.tcgplayer.com/product/1');
  expect(rows.find(r => r.sku === 'imp-2').source_url || '').toBe('');

  // Nothing on the page links to a script URL.
  await page.locator('.tab', { hasText: 'Catalog' }).first().click();
  await expect(page.getByText('Sol Ring')).toBeVisible();
  expect(await page.locator('a[href^="javascript:" i]').count()).toBe(0);
});
