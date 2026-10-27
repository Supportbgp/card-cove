import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { seedHarness, catalogSeed } from './fixtures.js';

// Import/Export → Quotes: the old Excel quote sheets become real quotes, an
// accepted one sends its cards to Sorting (Cost filled in from the payout),
// and once sorted the Catalog item links back to the quote it was bought in.

function activePanel(page) {
  return page.locator('.panel.active');
}

// A sheet laid out like the shop's real quote template (column A unused).
function quoteSheet({ customer, date, status, payout, priceHeader = 'Price', cards }) {
  return XLSX.utils.aoa_to_sheet([
    [null, 'Customer Name:', customer, 'Customer ID:', null, 'Phone #:', null],
    [null, 'Date Quoted:', date],
    [null, 'Offer Status:', status, 'Payout Amount:', payout],
    [null, null, null, 'Paid Out?', true],
    [null, 'Time taken to Quote:', '15 min', 'Employee:', 'Noah'],
    [null, 'Name of Card', 'Set - PKM #', 'Condition', priceHeader, 'Qty', 'Notes:'],
    ...cards,
  ]);
}

function quoteWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [null, 'Customer Name:', null, 'Customer ID:', null, 'Phone #:', null],
    [null, 'Name of Card', 'Set - PKM #', 'Condition', 'Price', 'Qty', 'Notes:'],
  ]), 'Template');
  XLSX.utils.book_append_sheet(wb, quoteSheet({
    customer: 'John Cena', date: '2026-08-24', status: 'Accepted Cash ', payout: 30,
    cards: [
      [null, "Ethan's Typhlosion - 190/182 - SV10: Destined Rivals (DRI)", null, 'Light P', 40, null, null],
      [null, 'Lapras GX - SM Base Set (SM01)', null, 'NM', 10, 2, null],
    ],
  }), 'Example 1');
  XLSX.utils.book_append_sheet(wb, quoteSheet({
    customer: 'Jacob Stuart', date: '2026-08-25', status: 'Rejected Offer', payout: null,
    cards: [[null, 'Pikachu', null, 'NM', 5, null, null]],
  }), 'Example 3');
  XLSX.utils.book_append_sheet(wb, quoteSheet({
    customer: 'James Matney', date: '2026-08-26', status: null, payout: null, priceHeader: null,
    cards: [[null, 'Diancie', null, 'NM', 2, 1, null]],
  }), 'Example 4');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function uploadQuotes(page) {
  await page.locator('.tab', { hasText: 'Import / Export' }).click();
  await activePanel(page).getByRole('button', { name: 'Quotes' }).click();
  await page.getByTestId('quote-import-file').setInputFiles({
    name: 'Quotes templates.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: quoteWorkbook(),
  });
}

test('importing quotes: statuses kept, accepted cards go to Sorting with Cost, and the Catalog item links back', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await uploadQuotes(page);

  const items = page.getByTestId('quote-import-item');
  await expect(items).toHaveCount(3); // the blank Template sheet is skipped
  await expect(activePanel(page).getByText('skipped 1 empty sheet(s)', { exact: false })).toBeVisible();
  await expect(items.nth(0)).toContainText('Accepted Cash');
  await expect(items.nth(1)).toContainText('Rejected Offer');
  await expect(items.nth(2)).toContainText('In progress');

  const importBtn = activePanel(page).getByRole('button', { name: 'Import 3 quote(s)' });
  await expect(importBtn).toBeDisabled();
  await expect(activePanel(page).getByText('Pick a game for 3 quote(s).')).toBeVisible();
  await page.getByLabel('Game for all quotes').selectOption('Pokemon');
  await expect(importBtn).toBeEnabled();
  await importBtn.click();

  await expect(activePanel(page).locator('.status-line.ok')).toContainText(
    'Imported 3 quote(s): 1 in progress, 1 accepted, 1 rejected. 2 card(s) moved to Sorting.');

  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.quotes).toHaveLength(3);
  const accepted = db.quotes.find(q => q.customer_name === 'John Cena');
  expect(accepted).toMatchObject({ offer_status: 'accepted_cash', payout_amount: 30, date_quoted: '2026-08-24', converted_to_catalog: true });
  expect(db.quotes.find(q => q.customer_name === 'Jacob Stuart')).toMatchObject({ offer_status: 'rejected', converted_to_catalog: false });
  expect(db.quotes.find(q => q.customer_name === 'James Matney').offer_status ?? null).toBeNull();
  expect(db.quotes.find(q => q.customer_name === 'James Matney').items[0].price).toBe(2);

  // Payout $30 split by each card's value: Typhlosion $20, Lapras 2 × $5.
  expect(db.sorting_queue).toHaveLength(2);
  expect(db.sorting_queue.every(r => r.quote_id === accepted.id)).toBe(true);
  const typhlosion = db.sorting_queue.find(r => r.name === "Ethan's Typhlosion");
  expect(typhlosion).toMatchObject({ cost: 20, condition: 'Lightly Played', game: 'Pokemon', set: 'SV10: Destined Rivals (DRI)' });
  expect(db.sorting_queue.find(r => r.name === 'Lapras GX')).toMatchObject({ cost: 5, qty: 2 });

  // Sort the Typhlosion into a binder: it becomes a Catalog row linked to the quote.
  await page.locator('.tab', { hasText: 'Sorting' }).click();
  await activePanel(page).locator('.scan-row', { hasText: "Ethan's Typhlosion" }).getByRole('button', { name: 'Sort' }).click();
  await page.getByLabel('Binder / case / collection').fill('Red binder');
  await page.locator('#si_posChannel').check();
  await page.locator('.modal').getByRole('button', { name: 'Confirm' }).click();

  const row = await page.evaluate(() => window.__HARNESS_DB__.catalog.find(r => r.name === "Ethan's Typhlosion"));
  expect(row).toMatchObject({ source_quote_id: accepted.id, cost: 20 });

  // Its edit screen shows where it was bought, and "View quote" opens that quote.
  await page.locator('.tab', { hasText: 'Catalog' }).click();
  if (testInfo.project.name === 'Mobile') {
    await activePanel(page).getByText("Ethan's Typhlosion").click();
    await page.locator('.catalog-card').getByRole('button', { name: 'Edit' }).click();
  } else {
    await page.locator('table tbody tr').filter({ hasText: "Ethan's Typhlosion" }).getByRole('button', { name: 'Edit' }).click();
  }
  const ref = page.locator('.quote-source-ref');
  await expect(ref).toContainText(`Quote #${accepted.quote_number}`);
  await expect(ref).toContainText('Customer: John Cena');
  await expect(ref).toContainText('Quoted by Noah');
  await ref.getByRole('button', { name: 'View quote' }).click();

  await expect(page.locator('.tab.active')).toContainText('Quote');
  await expect(page.locator('.modal-head .name')).toHaveText(`Quote #${accepted.quote_number} — John Cena (2026-08-24)`);
});

test('a quote that looks already imported starts unticked', async ({ page }) => {
  const seed = catalogSeed([]);
  seed.quotes = [{
    id: 'q-existing', quote_number: 7, collection_name: 'John Cena (2026-08-24)', customer_name: 'John Cena',
    date_quoted: '2026-08-24', items: [{ name: 'a' }, { name: 'b' }], offer_status: 'accepted_cash',
    payout_amount: 30, paid_out: true, converted_to_catalog: true, created_at: '2026-08-24T00:00:00.000Z',
  }];
  await seedHarness(page, { seed });
  await page.goto('./');
  await uploadQuotes(page);

  const first = page.getByTestId('quote-import-item').nth(0);
  await expect(first).toContainText('Looks already imported');
  await expect(first.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(activePanel(page).getByRole('button', { name: 'Import 2 quote(s)' })).toBeVisible();
});
