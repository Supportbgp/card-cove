import { test, expect } from '@playwright/test';
import { seedHarness } from './fixtures.js';

function publicRow(overrides = {}) {
  return {
    sku: 'sku-1', name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
    item_type: 'single', grader: '', grade: '', qty: 3, price: 45,
    image_url: '', image_data: '', photo_url: '', photo_data: '', active_image: 'photo', location: 'Binder A',
    ...overrides,
  };
}

test('shows the binder\'s items on the public, no-login page', async ({ page }) => {
  await seedHarness(page, {
    seed: { catalog: [], sync_queue: [], store_settings: [], catalog_public_view: [publicRow()], public_binder_list: [{ location: 'Binder A' }] },
  });
  await page.goto('./?binder=Binder%20A');

  await expect(page.getByText('Binder A')).toBeVisible(); // topbar location label
  await expect(page.getByText('Charizard')).toBeVisible();
  await expect(page.getByText('3 in stock')).toBeVisible();
  await expect(page.getByText('$45.00')).toBeVisible();
  // Public page never shows authenticated-app chrome.
  await expect(page.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
});

test('shows an empty-binder message when nothing matches the location', async ({ page }) => {
  await seedHarness(page, {
    seed: { catalog: [], sync_queue: [], store_settings: [], catalog_public_view: [], public_binder_list: [{ location: 'Empty Binder' }] },
  });
  await page.goto('./?binder=Empty%20Binder');
  await expect(page.getByText('Nothing here right now')).toBeVisible();
});

test("a binder that isn't public says so instead of looking empty", async ({ page }) => {
  await seedHarness(page, {
    seed: { catalog: [], sync_queue: [], store_settings: [], catalog_public_view: [], public_binder_list: [] },
  });
  await page.goto('./?binder=Private%20Case');
  await expect(page.getByText("This binder isn't shared online")).toBeVisible();
  await expect(page.getByText('Nothing here right now')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Search all stock' })).toBeVisible();
});
