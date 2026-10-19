import { test, expect } from '@playwright/test';
import { seedHarness, makeCardRow, catalogSeed } from './fixtures.js';

// Undo a sale: from the toast right after Mark sold, and from a Sync Queue
// ticket. Both put the quantity back, and delete the ticket and the Reports
// (sales) row, which are matched by sku + the shared sale timestamp.

const SOLD_AT = '2026-10-18T15:30:00.000Z';

function ticketRow(overrides = {}) {
  return {
    id: 't-1', sku: 'sku-1', name: 'Charizard', set_name: 'Base Set', condition: 'NM', printing: 'Holo',
    price: 45, qty_sold: 2, ts: SOLD_AT, pos_done: false, tcgplayer_done: false, collectr_done: false,
    pos_channel: true, tcgplayer_channel: true, collectr_channel: true,
    ...overrides,
  };
}

function saleRow(overrides = {}) {
  return {
    id: 's-1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM',
    qty_sold: 2, sale_price: 45, cost: null, sold_at: SOLD_AT,
    ...overrides,
  };
}

test('the toast after Mark sold can undo it, restoring qty and removing the ticket and sales record', async ({ page }, testInfo) => {
  await seedHarness(page, {
    seed: catalogSeed([makeCardRow({ sku: 'sku-2', name: 'Blastoise', qty: 1, pos_synced: true })]),
  });
  await page.goto('./');

  if (testInfo.project.name === 'Mobile') {
    await page.locator('.catalog-card-head').filter({ hasText: 'Blastoise' }).locator('input[type="checkbox"]').check();
  } else {
    await page.getByText('Blastoise').click();
  }
  await page.getByRole('button', { name: 'Mark sold' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.locator('.toast')).toContainText('Sold 1 Blastoise');
  await expect(page.locator('.badge.sold')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();

  await expect(page.locator('.toast')).toContainText('Undid the sale of Blastoise');
  await expect(page.locator('.badge.sold')).toHaveCount(0);
  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.catalog.find(r => r.sku === 'sku-2')).toMatchObject({ qty: 1, sold: false, pos_synced: true });
  expect(db.sync_queue).toHaveLength(0);
  expect(db.sales).toHaveLength(0);
});

test('Undo sale on a Sync Queue ticket puts the qty back and removes only that sale', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([makeCardRow({ sku: 'sku-1', name: 'Charizard', qty: 1 })]),
      sync_queue: [ticketRow()],
      sales: [saleRow(), saleRow({ id: 's-2', sold_at: '2026-10-17T10:00:00.000Z', qty_sold: 1 })],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Sync Queue' }).click();

  await page.getByRole('button', { name: 'Undo sale' }).click();
  await expect(page.getByText(/Undo the sale of 2 × Charizard\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.locator('.ticket')).toHaveCount(0);
  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.catalog.find(r => r.sku === 'sku-1')).toMatchObject({ qty: 3, sold: false });
  expect(db.sync_queue).toHaveLength(0);
  // Only the sale with this ticket's timestamp goes; an earlier sale of the same card stays.
  expect(db.sales.map(s => s.id)).toEqual(['s-2']);
});

test('the Sync Queue undo warns when a platform was already stamped done', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([makeCardRow({ sku: 'sku-1', name: 'Charizard', qty: 1 })]),
      sync_queue: [ticketRow({ tcgplayer_done: true })],
      sales: [saleRow()],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Sync Queue' }).click();

  await page.getByRole('button', { name: 'Undo sale' }).click();
  await expect(page.getByText(/already marked it updated on TCG Player/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.sync_queue).toHaveLength(1);
  expect(db.sales).toHaveLength(1);
});
