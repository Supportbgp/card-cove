import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Hot cards (CLAUDE.md "Hot cards"): a quote row says "Sought after", and
// why, for a card played in tournaments, selling fast, climbing in price,
// or on the staff hot list.

function metaRow(overrides = {}) {
  return {
    source: 'topdeck', game: 'Magic', format: 'EDH', name: 'Sol Ring', name_key: 'sol ring', code: '',
    decks: 700, total_decks: 1000, copies: 700, events: 40, window_days: 30,
    updated_at: new Date().toISOString(),
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

test("a TCGplayer market climb shows once the row's number says which print it is", async ({ page }) => {
  const row = (o) => ({
    product_id: 1, sub_type: 'Holofoil', game: 'Pokemon', name: 'Charizard ex - 199/165', name_key: 'charizard ex',
    set_name: 'SV: Scarlet & Violet 151', number: '199/165', old_price: 100, new_price: 134, pct_change: 34,
    url: 'https://www.tcgplayer.com/product/1', window_days: 30, updated_at: new Date().toISOString(), ...o,
  });
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      market_movers: [row(), row({ product_id: 2, sub_type: 'Normal', name: 'Charizard ex - 006/165', number: '006/165', pct_change: 60, old_price: 5, new_price: 8 })],
    },
  });
  await openNewQuoteRow(page);
  await page.locator('.scan-row select').first().selectOption('Pokemon');
  await page.getByPlaceholder('Card name').fill('Charizard ex');
  // No number or set yet: several prints share the name, so nothing shows.
  await expect(page.locator('.hot-notice')).toHaveCount(0);

  await page.locator('.scan-row').getByPlaceholder('Number', { exact: true }).fill('199/165');
  const notice = page.locator('.hot-notice');
  await expect(notice).toContainText('TCGplayer market up 34% in 30 days ($100.00 → $134.00)');
  await expect(notice.getByRole('link', { name: 'TCGCSV (TCGplayer prices)' })).toHaveAttribute('href', 'https://tcgcsv.com');
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
  await expect(notice).toContainText('We sold 3 of this card in the last 30 days, last at $45.00');
  await expect(notice).toContainText('Market price up 30% this month ($40.00 → $52.00)');
  // No tournament data behind these, so nothing to credit.
  await expect(notice.locator('.hot-notice-credit')).toHaveCount(0);

  await page.getByPlaceholder('Card name').fill('Gengar');
  await expect(notice).toHaveCount(0);
});

test('the Hot cards tab shows tournament play by game and format, with the sources credited', async ({ page }) => {
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      meta_cards: [
        metaRow(),
        metaRow({ source: 'mtgo', format: 'Modern', name: 'Orcish Bowmasters', name_key: 'orcish bowmasters', decks: 500, total_decks: 2000 }),
        metaRow({ source: 'limitless', game: 'Pokemon', format: 'STANDARD', name: 'Ultra Ball', name_key: 'ultra ball', decks: 840, total_decks: 1000 }),
      ],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Hot cards' }).click();
  const chart = page.locator('.panel.active .bar-list');

  // Magic has the most data, so it opens first, with both formats.
  await page.locator('.hot-chip', { hasText: 'Magic' }).click();
  await expect(page.locator('.panel.active .hot-stat')).toHaveCount(2);
  await expect(chart.locator('.bar-row')).toHaveCount(2);
  await expect(chart.locator('.bar-row').first()).toContainText('Sol Ring');
  await expect(chart.locator('.bar-row').first()).toContainText('70%');

  await page.getByRole('group', { name: 'Format' }).getByRole('button', { name: 'Modern' }).click();
  await expect(chart.locator('.bar-row')).toHaveCount(1);
  await expect(chart).toContainText('Orcish Bowmasters');
  await expect(chart).toContainText('25%');

  await page.locator('.hot-chip', { hasText: 'Pokemon' }).click();
  await expect(chart).toContainText('Ultra Ball');
  await expect(page.locator('.panel.active .hot-credit')).toContainText('Data provided by Limitless');
  await expect(page.locator('.panel.active .hot-credit').getByRole('link', { name: 'TopDeck.gg' })).toHaveAttribute('href', 'https://topdeck.gg');
});

test('the Hot cards tab charts market climbs, sortable by $ gain or % rise', async ({ page }) => {
  const row = (o) => ({
    product_id: 1, sub_type: 'Holofoil', game: 'Pokemon', name: 'Umbreon ex', name_key: 'umbreon ex',
    set_name: 'Prismatic Evolutions', number: '161/131', old_price: 900, new_price: 1210, pct_change: 34.4,
    url: 'https://www.tcgplayer.com/product/1', window_days: 30, updated_at: new Date().toISOString(), ...o,
  });
  await seedHarness(page, {
    seed: {
      ...catalogSeed([]),
      market_movers: [row(), row({ product_id: 2, name: 'Mew ex', name_key: 'mew ex', old_price: 12, new_price: 30, pct_change: 150 })],
    },
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Hot cards' }).click();
  await page.getByRole('tab', { name: /^Market climbing/ }).click();
  const rows = page.locator('.panel.active .bar-row');
  await expect(rows.first()).toContainText('Umbreon ex');
  await expect(rows.first()).toContainText('+$310.00');
  await expect(rows.first()).toContainText('$900.00 → $1,210.00');
  await expect(rows.first().getByRole('link', { name: 'Umbreon ex' })).toHaveAttribute('href', 'https://www.tcgplayer.com/product/1');

  await page.getByRole('button', { name: 'Biggest % rise' }).click();
  await expect(rows.first()).toContainText('Mew ex');
  await expect(rows.first()).toContainText('+150%');
  await expect(page.locator('.panel.active .hot-credit').getByRole('link', { name: 'TCGCSV (TCGplayer prices)' })).toBeVisible();
});

test('staff add and remove a card on the hot list from the Hot cards tab', async ({ page }) => {
  await seedHarness(page, { seed: { ...catalogSeed([]), meta_cards: [metaRow()] } });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Hot cards' }).click();
  await page.getByRole('tab', { name: /^Hot list/ }).click();

  const panel = page.locator('.panel.active');
  await panel.getByLabel('Game', { exact: true }).selectOption('Lorcana');
  await panel.getByLabel('Card name').fill('Circle of Life');
  await panel.getByLabel('Why').fill('Everyone asks for it');
  await panel.getByLabel('Added by').fill('Shawn');
  await page.getByRole('button', { name: 'Add to hot list' }).click();
  await expect(page.locator('.hot-list li')).toContainText('Circle of Life');
  const saved = await page.evaluate(() => window.__HARNESS_DB__.hot_cards);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ game: 'Lorcana', name: 'Circle of Life', reason: 'Everyone asks for it', added_by: 'Shawn' });
  await expect(page.getByRole('tab', { name: /^Hot list/ })).toContainText('1');

  // A quote row picks it up.
  await page.locator('.tab', { hasText: 'Quote' }).click();
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Walk-in');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await page.getByPlaceholder('Card name').fill('circle of life');
  await expect(page.locator('.hot-notice')).toContainText('Hot list: Everyone asks for it');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // The old window's button is gone from the Quote tab.
  await expect(page.getByRole('button', { name: 'Hot cards…' })).toHaveCount(0);

  await page.locator('.tab', { hasText: 'Hot cards' }).click();
  await page.locator('.hot-list li', { hasText: 'Circle of Life' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.hot-list li', { hasText: 'Circle of Life' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__HARNESS_DB__.hot_cards)).toHaveLength(0);
});
