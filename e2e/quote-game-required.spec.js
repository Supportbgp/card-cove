import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// A quote card with no Game used to reach Catalog as game "Other" (a blank
// game becomes "Other"), where nothing searches or price-checks it. Now a
// quote can't be accepted until every card has a Game, and a card already
// waiting in Sorting without one gets its game picked in the Sort window.

function activePanel(page) {
  return page.locator('.panel.active');
}

test('a quote can\'t be accepted while a card has no Game', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Quote' }).click();
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Game check');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await page.getByPlaceholder('Card name').fill('Mystery Card');
  const row = page.locator('.scan-row').first();
  await row.locator('input[placeholder="Price"]').fill('10');

  // In progress: saving is fine with no game.
  const save = page.locator('.modal-foot').getByRole('button', { name: 'Save' });
  await expect(save).toBeEnabled();

  // Accepting: blocked, the card is named, and its Game box is flagged.
  await page.locator('.field-group', { hasText: 'Offer status' }).locator('select').selectOption('accepted_cash');
  await expect(page.getByText('Pick a Game for 1 card(s) before accepting: Mystery Card.', { exact: false })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(row.locator('select.field-missing')).toHaveCount(1);

  await row.locator('select').first().selectOption('Magic');
  await expect(save).toBeEnabled();
  await save.click();

  const sorting = await page.evaluate(() => window.__HARNESS_DB__.sorting_queue);
  expect(sorting).toHaveLength(1);
  expect(sorting[0]).toMatchObject({ name: 'Mystery Card', game: 'Magic' });
});

test('a card already in Sorting with no game gets one picked before it\'s placed', async ({ page }) => {
  const seed = catalogSeed([]);
  seed.sorting_queue = [{
    id: 'sq-1', quote_id: null, quote_collection_name: 'Old quote', name: 'Gameless Card', game: null,
    set: '', number: '', rarity: '', printing: '', condition: 'Near Mint', price: 5, base_price: null, cost: 2,
    qty: 1, notes: '', image_url: '', image_data: '', photo_url: '', photo_data: '', active_image: 'photo',
    source_url: '', created_at: '2026-10-01T00:00:00.000Z',
  }];
  await seedHarness(page, { seed });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Sorting' }).click();
  await activePanel(page).getByRole('button', { name: 'Sort' }).click();

  const modal = page.locator('.modal', { hasText: 'Sort: Gameless Card' });
  await expect(modal.getByText('This card has no game set.', { exact: false })).toBeVisible();
  await page.getByLabel('Binder / case / collection').fill('Red binder');
  await modal.locator('#si_posChannel').check();
  const confirm = modal.getByRole('button', { name: 'Confirm' });
  await expect(confirm).toBeDisabled();

  await modal.getByLabel('Game').selectOption('Pokemon');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(activePanel(page).getByText('Nothing waiting')).toBeVisible();
  const row = await page.evaluate(() => window.__HARNESS_DB__.catalog.find(r => r.name === 'Gameless Card'));
  expect(row).toMatchObject({ game: 'Pokemon', location: 'Red binder' });
});
