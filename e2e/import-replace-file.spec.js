import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { seedHarness, catalogSeed } from './fixtures.js';

// Import / Export → Cards: choosing a new file replaces the one loaded
// before. A multi-sheet .xlsx picked after a CSV used to leave the CSV's
// rows and mapping (and its Import rows button) on screen, so Import saved
// the old file instead of the new one.

function twoSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SKU', 'Name', 'Game', 'Qty'], ['x1', 'Black Lotus', 'Magic', 1]]), 'Magic');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SKU', 'Name', 'Game', 'Qty'], ['p1', 'Pikachu', 'Pokemon', 2]]), 'Pokemon');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('a multi-sheet file picked after a CSV replaces the CSV, and imports the chosen sheet', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();
  const fileInput = page.locator('.panel.active input[accept=".csv,.xlsx"]');

  await fileInput.setInputFiles({
    name: 'old.csv', mimeType: 'text/csv',
    buffer: Buffer.from(['SKU,Name,Game,Qty', 'c1,Charizard,Pokemon,1'].join('\n')),
  });
  await expect(page.getByRole('button', { name: 'Import rows' })).toBeVisible();

  await fileInput.setInputFiles({
    name: 'new.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: twoSheetWorkbook(),
  });
  await expect(page.getByText('2 sheets found')).toBeVisible();
  // Nothing from the old CSV is left to import.
  await expect(page.getByRole('button', { name: 'Import rows' })).toHaveCount(0);

  await page.getByLabel('Sheet to import').selectOption('Pokemon');
  await page.getByRole('button', { name: 'Load sheet' }).click();
  await page.locator('#imp_posChannel').check();
  await page.locator('#imp_skipImageSearch').check();
  await page.getByRole('button', { name: 'Import rows' }).click();

  await expect.poll(async () => page.evaluate(() => window.__HARNESS_DB__.catalog.length)).toBe(1);
  const rows = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  expect(rows[0]).toMatchObject({ sku: 'p1', name: 'Pikachu', qty: 2 });
});
