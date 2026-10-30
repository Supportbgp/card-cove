import { test, expect } from '@playwright/test';

// No seedHarness call needed — this page never touches the database, and is
// reachable with no session at all (see main.jsx's ?help=1 branch).

test('shows only the first section by default, with no hash', async ({ page }) => {
  await page.goto('./?help=1');
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catalog' })).toHaveCount(0);
  // Public/no-auth page never shows authenticated-app chrome.
  await expect(page.getByRole('button', { name: '+ Add item' })).toHaveCount(0);
});

test('a direct link to a hash shows only that section', async ({ page }) => {
  await page.goto('./?help=1#known-quirks');
  await expect(page.getByRole('heading', { name: 'Known quirks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Getting started' })).toHaveCount(0);
});

test('the nav highlights the current section and switches sections on click', async ({ page }) => {
  await page.goto('./?help=1');
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav.getByRole('link', { name: 'Getting started' })).toHaveClass(/active/);

  await nav.getByRole('link', { name: 'Sync Queue' }).click();
  await expect(page).toHaveURL(/#sync-queue$/);
  await expect(page.getByRole('heading', { name: 'Sync Queue' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Getting started' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Sync Queue' })).toHaveClass(/active/);
});

test('the Next stepper walks through every section in order, and wraps at the end', async ({ page }) => {
  await page.goto('./?help=1');
  const titles = [
    'Getting started', 'Catalog', 'Editing an item', 'Selling an item',
    'Sync Queue', 'Import / Export', 'Scan Binder', 'Quote',
    'Sorting', 'Pricing settings',
    'The public binder page', 'Bounties', 'Concepts & glossary', 'Known quirks',
  ];

  for (let i = 0; i < titles.length - 1; i++) {
    await expect(page.getByRole('heading', { name: titles[i], exact: true })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`^Next: ${titles[i + 1]}`) }).click();
  }
  await expect(page.getByRole('heading', { name: 'Known quirks' })).toBeVisible();

  // Last section's stepper loops back to the first instead of a dead end.
  await page.getByRole('link', { name: /^Back to Getting started/ }).click();
  await expect(page).toHaveURL(/#getting-started$/);
  await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
});

test('cross-reference links inside a section jump straight to the referenced section', async ({ page }) => {
  await page.goto('./?help=1#catalog');
  await page.locator('#catalog').getByRole('link', { name: 'Selling an item' }).click();
  await expect(page).toHaveURL(/#selling-an-item$/);
  await expect(page.getByRole('heading', { name: 'Selling an item' })).toBeVisible();
});

test('the Quote section links straight to Sorting, and back', async ({ page }) => {
  await page.goto('./?help=1#quote');
  await expect(page.getByRole('heading', { name: 'Quote', exact: true })).toBeVisible();
  await page.locator('#quote').getByRole('link', { name: 'Sorting' }).click();
  await expect(page).toHaveURL(/#sorting$/);
  await expect(page.getByRole('heading', { name: 'Sorting', exact: true })).toBeVisible();

  await page.goto('./?help=1#glossary');
  await page.locator('#glossary').getByRole('link', { name: 'Sorting' }).click();
  await expect(page).toHaveURL(/#sorting$/);
});
