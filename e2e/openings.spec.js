import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Openings tab (CLAUDE.md "Openings"): record a sealed product opened by
// the store, value the pulls like a quote, and send them to Sorting.

function activePanel(page) {
  return page.locator('.panel.active');
}

test.beforeEach(async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
});

async function startOpening(page, { game = 'Pokemon' } = {}) {
  await page.locator('.tab', { hasText: 'Openings' }).click();
  await page.getByRole('button', { name: '+ New opening' }).click();
  await page.locator('#op-product').fill('Surging Sparks Booster Box');
  await page.locator('#op-qty').fill('2');
  if (game) await page.locator('#op-game').selectOption(game);
  await page.locator('#op-employee').fill('Noah');
  await page.locator('#op-reason').fill('Singles for online sales');
  await page.locator('#op-sealed').fill('50');
  await page.locator('#op-expected').fill('60');
}

async function addPulls(page) {
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  const single = page.locator('.modal .scan-row').first();
  await single.getByPlaceholder('Card name').fill('Pikachu ex');
  await single.locator('input[placeholder="Price"]').fill('40');

  await page.getByRole('button', { name: '+ Add bulk lot' }).click();
  const lot = page.locator('.modal .scan-row').nth(1);
  await lot.getByPlaceholder('Qty').fill('100');
  await lot.getByPlaceholder('e.g. Pokemon surge bulk').fill('Surging Sparks bulk');
  await lot.getByPlaceholder('Value').fill('10');
}

test('values the pulls, works out the difference, and sends the pulls to Sorting with Cost', async ({ page }) => {
  await startOpening(page);
  await addPulls(page);

  // A new single takes the opening's Game.
  await expect(page.locator('.modal .scan-row').first().locator('select').first()).toHaveValue('Pokemon');
  // Payout % controls from quotes aren't shown on an opening.
  await expect(page.getByText('Alter %?')).toHaveCount(0);
  await expect(page.getByText('Apply a %?')).toHaveCount(0);

  await expect(page.getByTestId('op-singles')).toContainText('$40.00');
  await expect(page.getByTestId('op-bulk')).toContainText('$10.00');
  await expect(page.getByTestId('op-total')).toContainText('$50.00');
  await expect(page.getByTestId('op-diff')).toContainText('-$10.00 (-16.67%)');
  await page.locator('#op-diff-reason').fill('No chase card');

  await page.locator('#op-status').selectOption('done');
  await expect(page.locator('.status-line.ok')).toContainText('move 2 pull(s) to Sorting');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  // The list shows it as done, with the difference.
  const row = activePanel(page).locator('table tbody tr').first();
  await expect(row).toContainText('Surging Sparks Booster Box');
  await expect(row).toContainText('Done');
  await expect(row).toContainText('-$10.00');

  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.openings).toHaveLength(1);
  const opening = db.openings[0];
  expect(opening).toMatchObject({ status: 'done', moved_to_sorting: true, sealed_value: 50, expected_value: 60, difference_reason: 'No chase card', product_qty: 2 });
  // Sealed $50 split by value: Pikachu $40 of $50, the bulk lot $10 over 100 cards.
  expect(db.sorting_queue).toHaveLength(2);
  expect(db.sorting_queue.every(r => r.opening_id === opening.id)).toBe(true);
  expect(db.sorting_queue.find(r => r.name === 'Pikachu ex')).toMatchObject({ cost: 40, game: 'Pokemon' });
  expect(db.sorting_queue.find(r => r.name === 'Surging Sparks bulk')).toMatchObject({ cost: 0.1, qty: 100 });

  await page.locator('.tab', { hasText: 'Sorting' }).click();
  await expect(activePanel(page).getByText('From Opening #1: 2× Surging Sparks Booster Box').first()).toBeVisible();
});

test('a pulled card keeps a link back to its opening in Catalog', async ({ page }, testInfo) => {
  await startOpening(page);
  await addPulls(page);
  await page.locator('#op-status').selectOption('done');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  await page.locator('.tab', { hasText: 'Sorting' }).click();
  await activePanel(page).locator('.scan-row', { hasText: 'Pikachu ex' }).getByRole('button', { name: 'Sort' }).click();
  await page.getByLabel('Binder / case / collection').fill('Red binder');
  await page.locator('#si_posChannel').check();
  await page.locator('.modal').getByRole('button', { name: 'Confirm' }).click();

  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.catalog.find(r => r.name === 'Pikachu ex')).toMatchObject({ source_opening_id: db.openings[0].id, cost: 40 });

  await page.locator('.tab', { hasText: 'Catalog' }).click();
  if (testInfo.project.name === 'Mobile') {
    await activePanel(page).getByText('Pikachu ex').click();
    await page.locator('.catalog-card').getByRole('button', { name: 'Edit' }).click();
  } else {
    await page.locator('table tbody tr').filter({ hasText: 'Pikachu ex' }).getByRole('button', { name: 'Edit' }).click();
  }
  const ref = page.locator('.quote-source-ref');
  await expect(ref).toContainText('Opening #1');
  await expect(ref).toContainText('Opened by Noah');
  await ref.getByRole('button', { name: 'View opening' }).click();
  await expect(page.locator('.modal-head .name')).toHaveText('Opening #1: 2× Surging Sparks Booster Box');
});

test('an in-progress opening can be saved, found again and finished later; Done needs a Game on every pull', async ({ page }) => {
  await startOpening(page, { game: null });
  await addPulls(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  let db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.openings[0]).toMatchObject({ status: 'open', moved_to_sorting: false });
  expect(db.sorting_queue).toHaveLength(0);
  await expect(page.locator('.tab', { hasText: 'Openings' }).locator('.count')).toHaveText('1');

  // Search and status filters.
  await activePanel(page).getByLabel('Search openings').fill('nothing like this');
  await expect(activePanel(page).getByText('No openings match')).toBeVisible();
  await activePanel(page).getByLabel('Search openings').fill('surging');
  await activePanel(page).getByRole('button', { name: 'Done' }).click();
  await expect(activePanel(page).getByText('No openings match')).toBeVisible();
  await activePanel(page).getByRole('button', { name: 'In progress' }).click();
  await activePanel(page).locator('table tbody tr').first().click();

  // No Game on the pulls or the opening: Done is blocked.
  await page.locator('#op-status').selectOption('done');
  await expect(page.locator('.status-line.err')).toContainText('Pick a Game for 2 pull(s)');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  // Setting the opening's Game fills it in for every pull.
  await page.locator('#op-game').selectOption('Pokemon');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.openings[0]).toMatchObject({ status: 'done', moved_to_sorting: true });
  expect(db.sorting_queue.map(r => r.game)).toEqual(['Pokemon', 'Pokemon']);
  await expect(page.locator('.tab', { hasText: 'Openings' }).locator('.count')).toHaveText('0');
});
