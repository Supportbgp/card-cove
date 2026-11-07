import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Hot cards (CLAUDE.md "Hot cards"): a quote row says "Sought after", and
// why, for a card played in tournaments, selling fast, climbing in price,
// or on the staff hot list.

function metaRow(overrides = {}) {
  return {
    source: 'topdeck', game: 'Magic', format: 'EDH', name: 'Sol Ring', name_key: 'sol ring', code: '',
    decks: 700, total_decks: 1000, copies: 700, events: 40, window_days: 30,
    updated_at: '2026-11-06T13:40:00.000Z',
    ...overrides,
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function openNewQuoteRow(page) {
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Quote' }).click();
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Walk-in');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ Add card manually' }).click();
}

test('a card played in tournaments gets a Sought after notice with the source credited', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      meta_cards: [
        metaRow(),
        // Too few decklists behind it to claim anything.
        metaRow({ name: 'Mox Opal', name_key: 'mox opal', format: 'Pioneer', decks: 9, total_decks: 10 }),
      ],
    },
  });
  await openNewQuoteRow(page);
  await expect(page.locator('.hot-notice')).toHaveCount(0);

  await page.getByPlaceholder('Card name').fill('Mox Opal');
  await expect(page.locator('.hot-notice')).toHaveCount(0);

  await page.getByPlaceholder('Card name').fill('Sol Ring (Commander Legends)');
  const notice = page.locator('.hot-notice');
  await expect(notice).toContainText('Sought after');
  await expect(notice).toContainText('In 70% of Magic Commander decks (700 of 1000, last 30 days)');
  await expect(notice.getByRole('link', { name: 'TopDeck.gg' })).toHaveAttribute('href', 'https://topdeck.gg');
});

test('One Piece tournament play is matched by card code, not just the name', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      meta_cards: [metaRow({
        source: 'limitless', game: 'One Piece', format: '', name: 'Nami', name_key: 'nami', code: 'OP13-16',
        decks: 120, total_decks: 400,
      })],
    },
  });
  await openNewQuoteRow(page);
  await page.locator('.scan-row select').first().selectOption('One Piece');
  await page.getByPlaceholder('Card name').fill('Nami');
  await page.locator('.scan-row').getByPlaceholder('Set', { exact: true }).fill('OP09');
  await page.locator('.scan-row').getByPlaceholder('Number', { exact: true }).fill('016');
  await expect(page.locator('.hot-notice')).toHaveCount(0);

  await page.locator('.scan-row').getByPlaceholder('Set', { exact: true }).fill('OP13');
  const notice = page.locator('.hot-notice');
  await expect(notice).toContainText('OP13-16: in 30% of One Piece decks');
  await expect(notice.getByRole('link', { name: 'Limitless' })).toBeVisible();
});

test('our own recent sales and a price climb show up too', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      sales: [
        { id: 's1', sku: 'a', name: 'Charizard ex', game: 'Pokemon', condition: '', qty_sold: 2, sale_price: 40, cost: null, sold_at: daysAgo(5), refunded_at: null },
        { id: 's2', sku: 'b', name: 'Charizard ex', game: 'Pokemon', condition: '', qty_sold: 1, sale_price: 45, cost: null, sold_at: daysAgo(2), refunded_at: null },
        // Refunded: doesn't count.
        { id: 's3', sku: 'c', name: 'Gengar', game: 'Pokemon', condition: '', qty_sold: 3, sale_price: 10, cost: null, sold_at: daysAgo(2), refunded_at: daysAgo(1) },
      ],
      price_movers: [
        { sku: 'a', name: 'Charizard ex', game: 'Pokemon', first_price: 40, last_price: 52, first_at: daysAgo(20), last_at: daysAgo(1), pct_change: 30 },
      ],
    },
  });
  await openNewQuoteRow(page);
  await page.getByPlaceholder('Card name').fill('Charizard ex');
  const notice = page.locator('.hot-notice');
  await expect(notice).toContainText('We sold 3 in the last 30 days, last at $45.00');
  await expect(notice).toContainText('Market price up 30% this month ($40.00 → $52.00)');
  // No tournament data behind these, so nothing to credit.
  await expect(notice.locator('.hot-notice-credit')).toHaveCount(0);

  await page.getByPlaceholder('Card name').fill('Gengar');
  await expect(notice).toHaveCount(0);
});

test('staff add and remove a card on the hot list from the Hot cards window', async ({ page }) => {
  await seedHarness(page, { seed: { ...catalogSeed([]), meta_cards: [metaRow()] } });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Quote' }).click();
  await page.getByRole('button', { name: 'Hot cards…' }).click();

  // What the tournament data says, credited.
  const modal = page.locator('.hot-cards-modal');
  await modal.getByLabel('Game', { exact: true }).nth(1).selectOption('Magic');
  await expect(page.locator('.hot-meta-table')).toContainText('Sol Ring');
  await expect(page.locator('.hot-credit')).toContainText('Data provided by Limitless');

  await modal.getByLabel('Game', { exact: true }).first().selectOption('Lorcana');
  await modal.getByLabel('Card name').fill('Circle of Life');
  await modal.getByLabel('Why').fill('Everyone asks for it');
  await modal.getByLabel('Added by').fill('Shawn');
  await page.getByRole('button', { name: 'Add to hot list' }).click();
  await expect(page.locator('.hot-list li')).toContainText('Circle of Life');
  const saved = await page.evaluate(() => window.__HARNESS_DB__.hot_cards);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ game: 'Lorcana', name: 'Circle of Life', reason: 'Everyone asks for it', added_by: 'Shawn' });
  await page.getByRole('button', { name: 'Close' }).click();

  // A quote row picks it up.
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Walk-in');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await page.getByPlaceholder('Card name').fill('circle of life');
  await expect(page.locator('.hot-notice')).toContainText('Hot list: Everyone asks for it');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Hot cards…' }).click();
  await page.locator('.hot-list li', { hasText: 'Circle of Life' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.hot-list li', { hasText: 'Circle of Life' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__HARNESS_DB__.hot_cards)).toHaveLength(0);
});
