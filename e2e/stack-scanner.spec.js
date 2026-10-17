import { test, expect } from '@playwright/test';
import { seedHarness, catalogSeed } from './fixtures.js';

// Stack scanner (Scan Binder tab → "Stack" mode). Headless Chromium has no
// camera, so cards go in through the "Upload photos" fallback — the same
// addCapture → background recognition → review path the live camera uses.
// The harness's scan-binder-page mock returns one scripted result per call
// (window.__HARNESS_SCAN_QUEUE__); "Sports Singles" is used because it has no
// external card-search provider, so nothing leaves the harness.

// Chromium's built-in fake camera (a moving test pattern), auto-granted —
// lets the live-camera path (Start camera → tap to capture) run headless.
// Applies to the whole file; the upload-based tests don't touch the camera.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

// A real 1×1 PNG — enough for the client-side resize to load and re-encode.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const photo = (name) => ({ name, mimeType: 'image/png', buffer: PNG_1PX });

async function seedScanQueue(page, queue) {
  await page.addInitScript((q) => { window.__HARNESS_SCAN_QUEUE__ = q; }, queue);
}

async function openStackMode(page) {
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Scan Binder' }).click();
  await page.getByRole('button', { name: 'Stack', exact: true }).click();
}

const trout = { name: 'Mike Trout', game: 'Sports Singles', set: 'Topps', number: '27', confidence: 'high' };
const griffey = { name: 'Ken Griffey Jr.', game: 'Sports Singles', set: 'Upper Deck', number: '1', confidence: 'high' };

test('scanned cards land in the stack, a repeat card bumps its quantity, and the stack is added to the catalog in one go', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await seedScanQueue(page, [[trout], [griffey], [trout]]);
  await openStackMode(page);

  // Session default, applied to every card scanned after it's set.
  await page.getByLabel('Condition', { exact: true }).selectOption('Near Mint');
  await page.getByLabel('Upload card photos').setInputFiles([photo('a.png'), photo('b.png'), photo('c.png')]);

  const nameInputs = page.locator('.scan-row input[placeholder="Card name"]');
  await expect(nameInputs).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Add 2 item\(s\) to catalog/ })).toBeEnabled();
  const names = await nameInputs.evaluateAll(els => els.map(e => e.value).sort());
  expect(names).toEqual(['Ken Griffey Jr.', 'Mike Trout']);
  const troutRow = page.locator('.scan-row').filter({ has: page.locator('input[value="Mike Trout"]') });
  await expect(troutRow.locator('input[placeholder="Qty"]')).toHaveValue('2');

  await page.getByRole('button', { name: /Add 2 item\(s\) to catalog/ }).click();
  await expect(nameInputs).toHaveCount(0);
  const catalog = await page.evaluate(() => window.__HARNESS_DB__.catalog);
  const byName = Object.fromEntries(catalog.map(r => [r.name, r]));
  expect(byName['Mike Trout'].qty).toBe(2);
  expect(byName['Mike Trout'].condition).toBe('Near Mint');
  expect(byName['Ken Griffey Jr.'].qty).toBe(1);
});

test('a card the scan can\'t read becomes a blank row to fill in, with Retry', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await seedScanQueue(page, [[], [griffey]]);
  await openStackMode(page);

  await page.getByLabel('Upload card photos').setInputFiles([photo('blurry.png')]);
  await expect(page.locator('.stack-failed-note')).toContainText("Couldn't recognize this card.");
  await expect(page.locator('.scan-row input[placeholder="Card name"]')).toHaveValue('');

  await page.locator('.stack-failed-note').getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.stack-failed-note')).toHaveCount(0);
  await expect(page.locator('.scan-row input[placeholder="Card name"]')).toHaveValue('Ken Griffey Jr.');
});

test('the stack is kept on this device across a reload until it\'s added', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await seedScanQueue(page, [[griffey]]);
  await openStackMode(page);
  await page.getByLabel('Upload card photos').setInputFiles([photo('a.png')]);
  await expect(page.locator('.scan-row input[placeholder="Card name"]')).toHaveValue('Ken Griffey Jr.');
  // Saves are debounced slightly — give it a moment to land in IndexedDB.
  await page.waitForTimeout(800);

  await page.reload();
  await page.locator('.tab', { hasText: 'Scan Binder' }).click();
  await page.getByRole('button', { name: 'Stack', exact: true }).click();
  await expect(page.locator('.scan-row input[placeholder="Card name"]')).toHaveValue('Ken Griffey Jr.');
});

test('live camera: tapping the preview captures the card inside the guide into the stack', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await seedScanQueue(page, [[griffey]]);
  await openStackMode(page);

  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('.stack-counter')).toHaveText('0 in stack');
  await page.locator('.stack-camera').click({ position: { x: 40, y: 80 } });

  await expect(page.locator('.scan-row input[placeholder="Card name"]')).toHaveValue('Ken Griffey Jr.');
  await expect(page.locator('.stack-counter')).toHaveText('1 in stack');
  // The captured photo becomes the row's "real photo".
  await expect(page.locator('.scan-row .scan-row-thumb img')).toHaveAttribute('src', /^data:image\/jpeg/);

  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
});

test('"+1 same card" bumps the last card\'s quantity with no new AI call, even while it\'s still being recognized', async ({ page }) => {
  await seedHarness(page, { seed: catalogSeed([]) });
  await seedScanQueue(page, [[griffey]]);
  await openStackMode(page);

  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('.stack-counter')).toHaveText('0 in stack');
  await page.locator('.stack-camera').click({ position: { x: 40, y: 80 } });
  // Tapped twice right away — the card may still be recognizing; both
  // copies must survive recognition finishing.
  await page.getByRole('button', { name: '+1 same card' }).click();
  await page.getByRole('button', { name: '+1 same card' }).click();

  const griffeyRow = page.locator('.scan-row').filter({ has: page.locator('input[value="Ken Griffey Jr."]') });
  await expect(griffeyRow.locator('input[placeholder="Qty"]')).toHaveValue('3');
  expect(await page.evaluate(() => window.__HARNESS_SCAN_CALLS__)).toBe(1);
});
