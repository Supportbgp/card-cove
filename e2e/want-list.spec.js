import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

// Want list (CLAUDE.md "Want list"): staff record cards customers asked
// for; quotes and Sorting flag them; the public Wanted page lists them
// without the customer.

function makeWantRow(overrides = {}) {
  return {
    id: 'want-1', game: 'Pokemon', name: 'Charizard', set_name: 'Base Set', number: '4', rarity: '', printing: '',
    condition: '', image_url: '', max_price: 250, customer_name: 'Jake Doe', customer_contact: '555-0100',
    responsible: 'Noah', notes: '', show_public: true, status: 'open',
    created_at: '2026-11-01T12:00:00.000Z', closed_at: null,
    ...overrides,
  };
}

const harnessWants = (page) => page.evaluate(() => window.__HARNESS_DB__.want_requests);
const activePanel = (page) => page.locator('.panel.active');

test('staff add a request; it shows on the public Wanted page without the customer', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Want list' }).click();
  await page.getByRole('button', { name: '+ Add request' }).click();

  await page.getByLabel('Game').selectOption('Lorcana');
  await page.getByLabel('Card name').fill('Circle of Life');
  await page.getByLabel("They'd pay up to ($, optional)").fill('30');
  await page.getByLabel('Name', { exact: true }).fill('Ana Smith');
  await page.getByLabel('Phone, email or Discord (optional)').fill('ana#1234');
  await page.getByLabel('Responsible (optional)').fill('Shawn');
  await page.getByRole('button', { name: 'Add to list' }).click();

  const row = activePanel(page).locator('.want-table tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Circle of Life');
  await expect(row).toContainText('Ana Smith');
  await expect(row).toContainText('ana#1234');
  await expect(row).toContainText('Up to $30.00');
  await expect(page.locator('.tab', { hasText: 'Want list' }).locator('.count')).toHaveText('1');
  const [saved] = await harnessWants(page);
  expect(saved).toMatchObject({ name: 'Circle of Life', customer_name: 'Ana Smith', responsible: 'Shawn', status: 'open', show_public: true });

});

test('the public Wanted page lists shown, open requests without the customer', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      want_requests: [
        makeWantRow({ show_public: false }),
        makeWantRow({ id: 'want-2', name: 'Mew' }),
        makeWantRow({ id: 'want-3', name: 'Gengar', status: 'fulfilled' }),
      ],
    },
  });
  await page.goto('./?shop=1&view=wanted');
  await expect(page.locator('.binder-card')).toHaveCount(1);
  await expect(page.locator('.binder-card')).toContainText('Mew');
  await expect(page.getByText('Jake Doe')).toHaveCount(0);
  await expect(page.getByText('555-0100')).toHaveCount(0);
  await expect(page.getByText('$250')).toHaveCount(0);
  // The In stock view is one tap away.
  await page.getByRole('button', { name: 'In stock' }).click();
  await expect(page.locator('.brand .sub')).toHaveText('In stock');
});

test('fulfilled, rejected and reopened requests', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([makeCardRow({ sku: 'sku-1', name: 'Charizard', game: 'Pokemon', qty: 2 })]),
      want_requests: [makeWantRow(), makeWantRow({ id: 'want-2', name: 'Mew' })],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Want list' }).click();
  const rows = activePanel(page).locator('.want-table tbody tr');
  await expect(rows).toHaveCount(2);
  // The catalog already has Charizard.
  await expect(rows.filter({ hasText: 'Charizard' })).toContainText('2 in stock');

  await rows.filter({ hasText: 'Charizard' }).getByRole('button', { name: 'Fulfilled' }).click();
  await expect(rows).toHaveCount(1);
  await rows.filter({ hasText: 'Mew' }).getByRole('button', { name: 'Reject' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Confirm' }).click();
  await expect(activePanel(page).getByText('Nothing here')).toBeVisible();

  let wants = await harnessWants(page);
  expect(wants.find(w => w.id === 'want-1').status).toBe('fulfilled');
  expect(wants.find(w => w.id === 'want-2').status).toBe('rejected');
  expect(wants.find(w => w.id === 'want-2').closed_at).toBeTruthy();

  await activePanel(page).getByRole('button', { name: /^Rejected/ }).click();
  await rows.filter({ hasText: 'Mew' }).getByRole('button', { name: 'Reopen' }).click();
  await activePanel(page).getByRole('button', { name: /^Open/ }).click();
  await expect(rows).toHaveCount(1);
  wants = await harnessWants(page);
  expect(wants.find(w => w.id === 'want-2')).toMatchObject({ status: 'open', closed_at: null });
});

test('editing a request saves the changes', async ({ page }) => {
  await seedHarness(page, { seed: { ...catalogSeed([]), want_requests: [makeWantRow()] } });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Want list' }).click();
  await activePanel(page).locator('.want-table tbody tr').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Card name')).toHaveValue('Charizard');
  await page.getByLabel('Phone, email or Discord (optional)').fill('jake@example.com');
  await page.getByLabel(/Show on the public Wanted list/).uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(activePanel(page).locator('.want-table tbody tr')).toContainText('jake@example.com');
  await expect(activePanel(page).locator('.want-table tbody tr')).toContainText('Not on the public list');
  const [saved] = await harnessWants(page);
  expect(saved).toMatchObject({ customer_contact: 'jake@example.com', show_public: false });
});

test('a quote flags a wanted card and suggests paying more', async ({ page }) => {
  await seedHarness(page, { seed: { ...catalogSeed([]), want_requests: [makeWantRow()] } });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Quote' }).click();
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Walk-in');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await expect(page.locator('.want-notice')).toHaveCount(0);

  await page.getByPlaceholder('Card name').fill('Charizard');
  const notice = page.locator('.want-notice');
  await expect(notice).toContainText('On the want list');
  await expect(notice).toContainText('Jake Doe (up to $250.00)');
  await notice.getByRole('button', { name: 'Pay +10% for it' }).click();
  await expect(notice).toContainText('Paying +10% on this card');
  await expect(page.getByPlaceholder('e.g. +10 or -20')).toHaveValue('10');
});

test('Sorting tags a card on the want list', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      want_requests: [makeWantRow()],
      sorting_queue: [
        { id: 'srt-1', quote_id: null, quote_collection_name: 'Walk-in', name: 'Charizard', game: 'Pokemon', qty: 1, price: 200 },
        { id: 'srt-2', quote_id: null, quote_collection_name: 'Walk-in', name: 'Pikachu', game: 'Pokemon', qty: 1, price: 2 },
      ],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Sorting' }).click();
  await expect(page.locator('.want-tag')).toHaveCount(1);
  await expect(page.locator('.want-tag')).toHaveText('Wanted ×1');
});
