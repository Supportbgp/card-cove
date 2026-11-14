import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

// CLAUDE.md "Change history and safer saves": a device with an old copy of
// a card can't move it back, a save that can't reach the database waits on
// the device and goes through later, and every change can be looked up.

const kangaskhan = makeCardRow({
  sku: 'k1', name: 'Kangaskhan EX', set_name: 'Flashfire', qty: 1, price: 25, location: 'Card Show Binder',
});

async function selectKangaskhan(page, testInfo) {
  if (testInfo.project.name === 'Mobile') {
    await page.locator('.catalog-card-head').filter({ hasText: 'Kangaskhan EX' }).locator('input[type="checkbox"]').check();
  } else {
    await page.locator('table tbody tr').filter({ hasText: 'Kangaskhan EX' }).getByText('Kangaskhan EX').click();
  }
}

async function openEdit(page, testInfo) {
  if (testInfo.project.name === 'Mobile') {
    await page.locator('.catalog-card-head').filter({ hasText: 'Kangaskhan EX' }).locator('.catalog-card-main').click();
    await page.locator('.catalog-card-details').getByRole('button', { name: 'Edit' }).click();
  } else {
    await page.locator('table tbody tr').filter({ hasText: 'Kangaskhan EX' }).getByRole('button', { name: 'Edit' }).click();
  }
  await expect(page.getByText('Edit item')).toBeVisible();
}

// Another device moves the card; this page doesn't hear about it (the
// harness has no live updates), like a tab that was asleep.
async function movedElsewhere(page) {
  await page.evaluate(() => {
    const row = window.__HARNESS_DB__.catalog.find(r => r.sku === 'k1');
    row.location = 'Power Packs';
  });
}

const dbRow = (page) => page.evaluate(() => window.__HARNESS_DB__.catalog.find(r => r.sku === 'k1'));

test('selling from an out-of-date copy keeps the move made on another device', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([kangaskhan]) });
  await page.goto('./');
  await movedElsewhere(page);

  await selectKangaskhan(page, testInfo);
  await page.getByRole('button', { name: 'Mark sold' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => (await dbRow(page)).sold).toBe(true);
  expect(await dbRow(page)).toMatchObject({ location: 'Power Packs', qty: 0, sold: true });
});

test('an edit only saves what was changed', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([kangaskhan]) });
  await page.goto('./');
  await movedElsewhere(page);

  await openEdit(page, testInfo);
  await page.locator('.field-group').filter({ hasText: 'Our price ($)' }).locator('input').fill('30');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => Number((await dbRow(page)).price)).toBe(30);
  expect((await dbRow(page)).location).toBe('Power Packs');
});

test('a save that fails with no connection waits on the device and goes through later', async ({ page }, testInfo) => {
  await seedHarness(page, { seed: catalogSeed([kangaskhan]) });
  await page.goto('./');
  // Connection down until the test brings it back.
  await page.evaluate(() => { window.__HARNESS_FAIL_WRITES__ = 1000; });

  await selectKangaskhan(page, testInfo);
  await page.getByRole('button', { name: 'Mark sold' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // The card change, its Sync Queue ticket and its sales record all wait,
  // in order, behind the one that failed.
  const badge = page.locator('.waiting-saves-badge');
  await expect(badge).toHaveText('3 changes waiting to save');
  expect((await dbRow(page)).sold).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('card-cove-write-queue')).length)).toBe(3);

  await page.evaluate(() => { window.__HARNESS_FAIL_WRITES__ = 0; });
  await badge.click();
  await expect(badge).toHaveCount(0);
  expect(await dbRow(page)).toMatchObject({ sold: true, qty: 0 });
  const db = await page.evaluate(() => window.__HARNESS_DB__);
  expect(db.sync_queue).toHaveLength(1);
  expect(db.sales).toHaveLength(1);
});

test('the change history shows moves and deletes, searchable by binder', async ({ page }, testInfo) => {
  const at = (d) => `2026-11-${d}T15:00:00.000Z`;
  await seedHarness(page, {
    seed: {
      ...catalogSeed([kangaskhan]),
      catalog_history: [
        { id: 1, sku: 'k1', name: 'Kangaskhan EX', action: 'insert', changes: { sku: 'k1', name: 'Kangaskhan EX', location: 'Card Show Binder', qty: 1 }, changed_by: 'shop', changed_at: at('01') },
        { id: 2, sku: 'k1', name: 'Kangaskhan EX', action: 'update', changes: { location: { from: 'Card Show Binder', to: 'Power Packs' } }, changed_by: 'shop', changed_at: at('10') },
        { id: 3, sku: 'r1', name: 'Rayquaza V', action: 'delete', changes: { sku: 'r1', name: 'Rayquaza V', location: 'Power Packs', qty: 1, price: 25 }, changed_by: 'shop', changed_at: at('11') },
        { id: 4, sku: 'p1', name: 'Pikachu', action: 'update', changes: { price: { from: 2, to: 3 } }, changed_by: 'shop', changed_at: at('12') },
      ],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Import / Export' }).click();
  await page.getByRole('button', { name: 'Change history…' }).click();
  const list = page.locator('.history-modal .history-entry');
  await expect(list).toHaveCount(4);
  await expect(list.first()).toContainText('Pikachu');

  await page.getByLabel('Card name, SKU or binder').fill('power packs');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(list).toHaveCount(2);
  await expect(list.nth(0)).toContainText('Deleted (in Power Packs, qty 1, $25.00)');
  await expect(list.nth(1)).toContainText('Binder / case: Card Show Binder → Power Packs');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.locator('.tab', { hasText: 'Catalog' }).click();
  await openEdit(page, testInfo);
  await page.getByRole('button', { name: 'Show change history' }).click();
  const cardList = page.locator('.history-section .history-entry');
  await expect(cardList).toHaveCount(2);
  await expect(cardList.first()).toContainText('Card Show Binder → Power Packs');
});
