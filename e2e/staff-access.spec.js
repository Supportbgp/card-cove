import { test, expect } from '@playwright/test';
import { seedHarness, makeCardRow, catalogSeed } from './fixtures.js';

// Staff-only access (bounties Phase 0): the database only lets logins marked
// as staff in. A login without the flag sees a clear "No staff access"
// screen instead of an app whose tabs just come up empty.

test('a login that isn\'t staff sees "No staff access", not an empty catalog', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([makeCardRow({ sku: 'a', name: 'Charizard' })]), staff: false });
  await page.goto('./');
  await expect(page.getByText('No staff access')).toBeVisible();
  await expect(page.locator('.tab', { hasText: 'Catalog' })).toHaveCount(0);

  // Sign out signs out and reloads (the harness signs back in on reload, so
  // the reload itself is what's checked here).
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Sign out' }).click()]);
});

test('the staff login gets the app as before', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([makeCardRow({ sku: 'a', name: 'Charizard' })]) });
  await page.goto('./');
  await expect(page.getByText('No staff access')).toHaveCount(0);
  await expect(page.locator('.panel.active').getByText('Charizard')).toBeVisible();
});
