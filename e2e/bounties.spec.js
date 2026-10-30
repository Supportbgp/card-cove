import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed, makeCardRow } from './fixtures.js';

const DAY = 24 * 60 * 60 * 1000;

function bountyRow(over = {}) {
  return {
    id: 'b1', user_id: 'someone-else', discord_id: '111', discord_name: 'SecretJake',
    game: 'Pokemon', name: 'Mew', set_name: '151', number: '151', rarity: '', printing: '', condition: 'Near Mint',
    image_url: '', max_price: 40, notes: '', status: 'open',
    created_at: new Date(Date.now() - DAY).toISOString(),
    expires_at: new Date(Date.now() + 30 * DAY).toISOString(), closed_at: null,
    ...over,
  };
}

function memberSession() {
  return {
    access_token: 'jwt',
    user: {
      id: 'member-1',
      app_metadata: { provider: 'discord', providers: ['discord'], member: true, discord_id: '222', discord_name: 'Ava' },
      user_metadata: { full_name: 'Ava' },
    },
  };
}

function seedWith(bounties, catalog = []) {
  return { ...catalogSeed(catalog), bounties };
}

test('visitors see open bounties without who asked', async ({ page }) => {
  await seedHarness(page, {
    signedIn: false,
    seed: seedWith([
      bountyRow(),
      bountyRow({ id: 'b2', name: 'Old Request', expires_at: new Date(Date.now() - DAY).toISOString() }),
      bountyRow({ id: 'b3', name: 'Done Request', status: 'fulfilled' }),
    ]),
  });
  await page.goto('./?shop=1&view=wanted');
  await expect(page.locator('.bounty-card')).toHaveCount(1);
  await expect(page.locator('.bounty-card')).toContainText('Mew');
  await expect(page.locator('.bounty-card')).toContainText('Up to $40.00');
  await expect(page.getByText('SecretJake')).toHaveCount(0);
  await expect(page.getByText('BGP Discord members can post a bounty')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Post a bounty' })).toHaveCount(0);
});

test('a member posts a bounty, sees it in their list and on the page, and can cancel it', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedHarness(page, { seed: seedWith([]), session: memberSession() });
  await page.goto('./?shop=1');
  await page.getByRole('button', { name: 'Wanted' }).click();
  await expect(page.getByText('0 of 10 open')).toBeVisible();

  await page.getByRole('button', { name: '+ Post a bounty' }).click();
  await page.getByLabel('Game').selectOption('Sports Singles');
  await page.getByLabel('Card name').fill('Ken Griffey Jr. Rookie');
  await page.getByRole('button', { name: 'Search for the card' }).click();
  await expect(page.getByText("Card search isn't available for this game")).toBeVisible();
  await page.getByLabel('Condition').selectOption('Lightly Played');
  await page.getByLabel('Max price ($, optional)').fill('25');
  await page.getByRole('button', { name: 'Post bounty' }).click();

  await expect(page.getByText('Bounty posted, and shared in the BGP Discord.')).toBeVisible();
  await expect(page.getByText('1 of 10 open')).toBeVisible();
  await expect(page.locator('.my-bounty')).toContainText('Ken Griffey Jr. Rookie');
  await expect(page.locator('.bounty-card')).toContainText('Up to $25.00');

  const db = await page.evaluate(() => ({ rows: window.__HARNESS_DB__.bounties, posts: window.__HARNESS_BOUNTY_POSTS__ }));
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0]).toMatchObject({ user_id: 'member-1', discord_id: '222', discord_name: 'Ava', condition: 'Lightly Played', max_price: 25 });
  expect(db.posts).toEqual([expect.objectContaining({ kind: 'created' })]);

  await page.locator('.my-bounty').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Cancelled your bounty for Ken Griffey Jr. Rookie.')).toBeVisible();
  await expect(page.locator('.bounty-card')).toHaveCount(0);
  await expect(page.getByText('0 of 10 open')).toBeVisible();
});

test('a member can renew an expired bounty, and is stopped at 10 open', async ({ page }) => {
  const mine = Array.from({ length: 10 }, (_, i) => bountyRow({ id: `m${i}`, user_id: 'member-1', name: `Card ${i}` }));
  mine.push(bountyRow({ id: 'old', user_id: 'member-1', name: 'Expired One', expires_at: new Date(Date.now() - DAY).toISOString() }));
  await seedHarness(page, { seed: seedWith(mine), session: memberSession() });
  await page.goto('./?shop=1&view=wanted');
  await expect(page.getByText('10 of 10 open')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Post a bounty' })).toBeDisabled();

  // Renewing would make 11 open: refused with the reason.
  const expired = page.locator('.my-bounty', { hasText: 'Expired One' });
  await expired.getByRole('button', { name: 'Renew' }).click();
  await expect(page.getByText('You already have 10 open bounties. Cancel one to renew this one.')).toBeVisible();
});

test('renewing an expired bounty puts it back up', async ({ page }) => {
  await seedHarness(page, {
    seed: seedWith([bountyRow({ id: 'old', user_id: 'member-1', name: 'Expired One', expires_at: new Date(Date.now() - DAY).toISOString() })]),
    session: memberSession(),
  });
  await page.goto('./?shop=1&view=wanted');
  await expect(page.locator('.my-bounty')).toContainText('Expired');
  await expect(page.locator('.bounty-card')).toHaveCount(0);
  await page.locator('.my-bounty').getByRole('button', { name: 'Renew' }).click();
  await expect(page.getByText('Renewed your bounty for Expired One for another 60 days.')).toBeVisible();
  await expect(page.locator('.bounty-card')).toContainText('Expired One');
  await expect(page.locator('.my-bounty')).toContainText('59 days left');
});

test('staff see who asked, whether it is in stock, and mark it fulfilled', async ({ page }) => {
  await seedHarness(page, {
    seed: seedWith(
      [bountyRow(), bountyRow({ id: 'b2', name: 'Lugia', discord_name: 'Sam' })],
      [makeCardRow({ sku: 'mew-1', name: 'Mew', qty: 2, location: 'Binder B' })],
    ),
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Bounties' }).click();
  const mewRow = page.locator('.bounties-table tbody tr', { hasText: 'Mew' });
  await expect(mewRow).toContainText('SecretJake');
  await expect(mewRow).toContainText('2 in stock');
  await expect(page.locator('.bounties-table tbody tr', { hasText: 'Lugia' })).not.toContainText('in stock');

  await mewRow.getByRole('button', { name: 'Mark fulfilled' }).click();
  await page.locator('.modal-foot').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Marked Mew fulfilled, SecretJake was pinged in Discord')).toBeVisible();
  // Leaves the Open list; shows under Fulfilled.
  await expect(page.locator('.bounties-table tbody tr', { hasText: 'Mew' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Fulfilled/ }).click();
  await expect(page.locator('.bounties-table tbody tr', { hasText: 'Mew' })).toContainText('Fulfilled');

  const db = await page.evaluate(() => ({ rows: window.__HARNESS_DB__.bounties, posts: window.__HARNESS_BOUNTY_POSTS__ }));
  expect(db.rows.find(b => b.id === 'b1').status).toBe('fulfilled');
  expect(db.posts).toEqual([expect.objectContaining({ kind: 'fulfilled' })]);
});

test('staff can remove a bounty without posting it', async ({ page }) => {
  await seedHarness(page, { seed: seedWith([bountyRow()]) });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Bounties' }).click();
  await page.locator('.bounties-table tbody tr', { hasText: 'Mew' }).getByRole('button', { name: 'Remove' }).click();
  await page.locator('.modal-foot').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Removed the bounty for Mew')).toBeVisible();
  const db = await page.evaluate(() => ({ rows: window.__HARNESS_DB__.bounties, posts: window.__HARNESS_BOUNTY_POSTS__ }));
  expect(db.rows[0].status).toBe('removed');
  expect(db.posts || []).toHaveLength(0);
});
