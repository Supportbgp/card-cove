import { test, expect } from '@playwright/test';
import { seedHarness } from './fixtures.js';

const stock = {
  catalog_public_view: [{ name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
    item_type: 'single', grader: '', grade: '', qty: 1, price: 45, image_url: '', image_data: '', photo_url: '',
    photo_data: '', active_image: 'photo', location: 'Binder A' }],
  public_binder_list: [{ location: 'Binder A' }],
};

function discordSession(appMeta = {}, extra = {}) {
  return {
    access_token: 'jwt',
    user: {
      id: 'u1',
      app_metadata: { provider: 'discord', providers: ['discord'], ...appMeta },
      user_metadata: { full_name: 'Jake#Discord' },
    },
    ...extra,
  };
}

test('signed out: the stock page offers Discord sign-in with the server-check scope', async ({ page }) => {
  await seedHarness(page, { signedIn: false, seed: stock });
  await page.goto('./?shop=1');
  await page.getByRole('button', { name: 'Sign in with Discord' }).click();
  const oauth = await page.evaluate(() => window.__HARNESS_OAUTH__);
  expect(oauth.provider).toBe('discord');
  expect(oauth.options.scopes).toContain('guilds.members.read');
  expect(oauth.options.redirectTo).toContain('?shop=1');
});

test('right after a Discord sign-in the membership is checked and shown', async ({ page }) => {
  await seedHarness(page, {
    seed: stock,
    session: discordSession({}, { provider_token: 'discord-token' }),
    refreshedSession: discordSession({ member: true, discord_name: 'Jake' }),
    verify: { member: true, name: 'Jake', inviteUrl: null },
  });
  await page.goto('./?shop=1');
  await expect(page.getByText('BGP Discord member')).toBeVisible();
  await expect(page.locator('.member-bar strong', { hasText: 'Jake' })).toBeVisible();
  expect(await page.evaluate(() => window.__HARNESS_VERIFY_BODY__)).toEqual({ providerToken: 'discord-token' });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toBeVisible();
});

test('a Discord account outside the server is told to join, with the invite link', async ({ page }) => {
  await seedHarness(page, {
    seed: stock,
    session: discordSession({}, { provider_token: 'discord-token' }),
    refreshedSession: discordSession({ member: false, discord_name: 'Stranger' }),
    verify: { member: false, name: 'Stranger', inviteUrl: 'https://discord.gg/example' },
  });
  await page.goto('./?shop=1');
  await expect(page.getByText("isn't in the BGP Discord server")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join the server' })).toHaveAttribute('href', 'https://discord.gg/example');
  await expect(page.getByRole('button', { name: 'Sign in again' })).toBeVisible();
});

test('a staff login on the stock page is left alone (no Discord button, no check)', async ({ page }) => {
  await seedHarness(page, { seed: stock });
  await page.goto('./?shop=1');
  await expect(page.getByText('Signed in as staff.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__HARNESS_VERIFY_BODY__)).toBeUndefined();
});

test('a Discord member opening the staff app gets No staff access, with a link to the stock page', async ({ page }) => {
  await seedHarness(page, { seed: stock, session: discordSession({ member: true }) });
  await page.goto('./');
  await expect(page.getByText('No staff access')).toBeVisible();
  await expect(page.getByRole('link', { name: 'public stock page' })).toBeVisible();
});
