import { test, expect } from '@playwright/test';
import { seedHarness, makeCardRow, catalogSeed } from './fixtures.js';

// "Report lost / stolen" from a card's Edit screen: a copy missing from stock
// (qty down, Sync Queue ticket), or a sold copy lost in shipment (refunded
// sale leaves revenue). Either way the loss is Cost x qty and Reports
// subtract it from Profit.

const NAME = 'Pocahontas, Peace Keeper';

function activePanel(page) {
  return page.locator('.panel.active');
}

async function openReport(page, testInfo) {
  if (testInfo.project.name === 'Mobile') {
    // Tapping the card toggles it open; it may still be open from before.
    const edit = page.locator('.catalog-card').getByRole('button', { name: 'Edit' });
    if (!(await edit.isVisible())) await activePanel(page).getByText(NAME).click();
    await edit.click();
  } else {
    await page.locator('table tbody tr').filter({ hasText: NAME }).getByRole('button', { name: 'Edit' }).click();
  }
  await page.getByRole('button', { name: 'Report lost / stolen…' }).click();
  return page.locator('.modal', { hasText: `Report lost / stolen: ${NAME}` });
}

const db = (page) => page.evaluate(() => window.__HARNESS_DB__);

test('a copy missing from stock: qty goes down, a Sync Queue ticket, and the loss in Reports', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([makeCardRow({ sku: 'poca', name: NAME, game: 'Lorcana', qty: 3, price: 25, cost: 17 })]) });
  await page.goto('./');

  const modal = await openReport(page, testInfo);
  const report = modal.getByRole('button', { name: 'Report loss' });
  await expect(modal.getByText('Pick a reason.')).toBeVisible();
  await expect(report).toBeDisabled();
  await modal.getByLabel('Reason').selectOption('stolen');
  await expect(modal.locator('.loss-summary')).toContainText('Loss: $17.00 (1 × $17.00 cost)');
  await report.click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Reported 1 × Pocahontas, Peace Keeper as stolen, $17.00 loss');

  const after = await db(page);
  expect(after.catalog.find(r => r.sku === 'poca').qty).toBe(2);
  expect(after.sync_queue).toHaveLength(1);
  expect(after.sync_queue[0]).toMatchObject({ kind: 'loss', qty_sold: 1, sku: 'poca' });
  expect(after.inventory_losses).toHaveLength(1);
  expect(after.inventory_losses[0]).toMatchObject({ sku: 'poca', qty: 1, cost_each: 17, loss_amount: 17, reason: 'stolen', sale_id: null, refunded: false });

  // The Sync Queue ticket says it's a loss, with no "Undo sale".
  await page.locator('.tab', { hasText: 'Sync Queue' }).click();
  const ticket = activePanel(page).locator('.ticket', { hasText: NAME });
  await expect(ticket.getByText('Lost / stolen')).toBeVisible();
  await expect(ticket.getByRole('button', { name: 'Undo sale' })).toHaveCount(0);
  await expect(ticket.getByRole('button', { name: 'Undo loss' })).toBeVisible();

  // Reports: nothing sold, a $17 loss, so Profit is -$17.
  await page.locator('.tab', { hasText: 'Reports' }).click();
  await expect(page.locator('.stat-losses')).toContainText('$17.00');
  await expect(page.locator('.stat-profit')).toContainText('-$17.00');
  await expect(activePanel(page).locator('.losses-table')).toContainText('Stolen');
});

test('a sold copy lost in shipment, customer refunded, card had no Cost', async ({ page }, testInfo) => {
  const seed = catalogSeed([makeCardRow({ sku: 'poca', name: NAME, game: 'Lorcana', qty: 0, sold: true, price: 25 })]);
  seed.sales = [{
    id: 's1', sku: 'poca', name: NAME, game: 'Lorcana', condition: 'NM', qty_sold: 1, sale_price: 25, cost: null,
    sold_at: new Date().toISOString(),
  }];
  await seedHarness(page, { seed });
  await page.goto('./');

  const modal = await openReport(page, testInfo);
  // Nothing in stock, so it's the after-a-sale case, already on "Lost in shipment".
  await expect(modal.getByRole('button', { name: 'Missing from stock' })).toBeDisabled();
  await expect(modal.getByLabel('Reason')).toHaveValue('lost_in_shipment');
  await expect(modal.locator('input[name="rl_sale"]')).toBeChecked();

  // No Cost anywhere: it says so and won't report until one is entered.
  await expect(modal.getByText("This card has no Cost, so the loss can't be calculated", { exact: false })).toBeVisible();
  const report = modal.getByRole('button', { name: 'Report loss' });
  await expect(report).toBeDisabled();
  await modal.getByLabel('Customer was refunded').check();
  await modal.getByLabel('Cost per copy ($)').fill('17');
  await expect(modal.locator('.loss-summary')).toContainText('Loss: $17.00');
  await expect(modal.locator('.loss-summary')).toContainText("The sale's $25.00 revenue comes out of Reports (refunded).");
  await report.click();
  await expect(modal).toHaveCount(0);

  const after = await db(page);
  expect(after.inventory_losses[0]).toMatchObject({ sale_id: 's1', refunded: true, loss_amount: 17, reason: 'lost_in_shipment' });
  expect(after.sales[0].refunded_at).toBeTruthy();
  expect(after.sales[0].cost).toBe(17);
  expect(after.catalog.find(r => r.sku === 'poca')).toMatchObject({ cost: 17, qty: 0 });
  expect(after.sync_queue).toHaveLength(0);

  // Reports: the refunded sale is out of revenue; the loss is in.
  await page.locator('.tab', { hasText: 'Reports' }).click();
  await expect(page.locator('.stat-revenue')).toContainText('$0.00');
  await expect(page.locator('.stat-losses')).toContainText('$17.00');
  await expect(page.locator('.stat-profit')).toContainText('-$17.00');
  await expect(activePanel(page).getByText('1 refunded sale(s) ($25.00) are left out', { exact: false })).toBeVisible();

  // Undo in Reports (any time later) puts the sale back.
  await activePanel(page).locator('.losses-table').getByRole('button', { name: 'Undo' }).click();
  await page.locator('.modal', { hasText: 'Undo loss' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.stat-revenue')).toContainText('$25.00');
  const final = await db(page);
  expect(final.inventory_losses).toHaveLength(0);
  expect(final.sales[0].refunded_at ?? null).toBeNull();
});

test('Undo right after reporting puts everything back', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([makeCardRow({ sku: 'poca', name: NAME, game: 'Lorcana', qty: 3, price: 25, cost: 17 })]) });
  await page.goto('./');

  const modal = await openReport(page, testInfo);
  await modal.getByLabel('How many?').fill('2');
  await modal.getByLabel('Reason').selectOption('lost_in_store');
  await modal.getByRole('button', { name: 'Report loss' }).click();
  await expect.poll(async () => (await db(page)).catalog.find(r => r.sku === 'poca').qty).toBe(1);

  await page.locator('.toast-action').click();
  await expect.poll(async () => (await db(page)).catalog.find(r => r.sku === 'poca').qty).toBe(3);
  const after = await db(page);
  expect(after.inventory_losses).toHaveLength(0);
  expect(after.sync_queue).toHaveLength(0);
});

test('Undo loss later, from the Sync Queue ticket or the Reports list', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([makeCardRow({ sku: 'poca', name: NAME, game: 'Lorcana', qty: 3, price: 25, cost: 17 })]) });
  await page.goto('./');

  // Report two separate losses of one copy each.
  for (const reason of ['stolen', 'damaged']) {
    const modal = await openReport(page, testInfo);
    await modal.getByLabel('Reason').selectOption(reason);
    await modal.getByRole('button', { name: 'Report loss' }).click();
    await expect(modal).toHaveCount(0);
  }
  await expect.poll(async () => (await db(page)).catalog.find(r => r.sku === 'poca').qty).toBe(1);

  // From the Sync Queue: the first ticket's Undo loss.
  await page.locator('.tab', { hasText: 'Sync Queue' }).click();
  await activePanel(page).getByRole('button', { name: 'Undo loss' }).first().click();
  await page.locator('.modal', { hasText: 'Undo loss' }).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => (await db(page)).catalog.find(r => r.sku === 'poca').qty).toBe(2);
  let now = await db(page);
  expect(now.inventory_losses).toHaveLength(1);
  expect(now.sync_queue).toHaveLength(1);

  // From Reports: the other one; its Sync Queue ticket goes too.
  await page.locator('.tab', { hasText: 'Reports' }).click();
  await activePanel(page).locator('.losses-table').getByRole('button', { name: 'Undo' }).click();
  await page.locator('.modal', { hasText: 'Undo loss' }).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => (await db(page)).catalog.find(r => r.sku === 'poca').qty).toBe(3);
  now = await db(page);
  expect(now.inventory_losses).toHaveLength(0);
  expect(now.sync_queue).toHaveLength(0);
});
