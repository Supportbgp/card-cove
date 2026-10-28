import { test, expect } from '@playwright/test';
import { seedHarness, makeCardRow, catalogSeed } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await seedHarness(page, {
    seed: catalogSeed([
      makeCardRow({ sku: 'sku-1', name: 'Charizard', game: 'Pokemon', set_name: 'Base Set', base_price: 50 }),
    ]),
  });
  await page.goto('./');
  await page.locator('.tab', { hasText: 'Quote' }).click();
});

test('create from scratch, add cards via the catalog typeahead and freeform, accept, and see them land in Sorting', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Jake binder proposal');
  await page.getByRole('button', { name: 'Create' }).click();

  // A new quote is never persisted until the first real Save — the detail
  // view opens as "New quote" with no number yet.
  await expect(page.locator('.modal-head .name', { hasText: 'New quote — Jake binder proposal' })).toBeVisible();

  // Row 1: typeahead match against the seeded catalog item.
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  const nameInputs = page.getByPlaceholder('Card name');
  await nameInputs.first().fill('Charizard');
  await page.locator('.catalog-item-picker-option', { hasText: 'Charizard' }).click();

  const rows = page.locator('.scan-row');
  await expect(rows.first().locator('select').first()).toHaveValue('Pokemon');
  await rows.first().locator('input[placeholder="Price"]').fill('40');

  // Row 2: a freeform name with no catalog match — still a valid row.
  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await nameInputs.last().fill('Unlisted Promo Card');
  await rows.last().locator('select').first().selectOption('Pokemon');
  await rows.last().locator('input[placeholder="Price"]').fill('10');

  await expect(page.getByText('Total quoted value')).toBeVisible();
  await expect(page.getByText('$50.00')).toBeVisible(); // 40 + 10

  await page.locator('.field-group', { hasText: 'Offer status' }).locator('select').selectOption('accepted_cash');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  // Accepting no longer writes straight to Catalog — both items move to
  // the Sorting queue to be placed individually (see the Sorting stage in
  // CLAUDE.md); Catalog stays untouched until that happens. (Charizard
  // already exists in Catalog from this file's own seed — used above for
  // the typeahead match — so "Unlisted Promo Card" is the one that proves
  // this: it has no other way to end up in Catalog.)
  await page.locator('.tab', { hasText: 'Catalog' }).click();
  await expect(page.locator('.panel.active').getByText('Unlisted Promo Card')).toHaveCount(0);

  await page.locator('.tab', { hasText: 'Sorting' }).click();
  const sortingPanel = page.locator('.panel.active');
  await expect(sortingPanel.getByText('Charizard')).toBeVisible();
  await expect(sortingPanel.getByText('Unlisted Promo Card')).toBeVisible();

  await page.locator('.tab', { hasText: 'Quote' }).click();
  // Saving is what actually creates the row — it should now show up in the
  // list (identified by collection name, not a gapped quote number — see
  // CLAUDE.md) with the Accepted Cash status/green tint.
  const quoteRow = page.locator('table tbody tr', { hasText: 'Jake binder proposal' });
  await expect(quoteRow).toBeVisible();
  await expect(quoteRow).toContainText('Accepted Cash');
  await expect(quoteRow).toHaveClass(/quote-row-accepted/);

  // The quote number still shows inside its own detail view, just not in
  // the list — reopening it should read "Quote #1", not "New quote".
  await quoteRow.click();
  await expect(page.locator('.modal-head .name', { hasText: 'Quote #1' })).toBeVisible();
});

test('misc. add-on items are excluded from the tier total but can be added to the payout, and never reach Sorting', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Add-on test');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  const rows = page.locator('.scan-row');
  await page.getByPlaceholder('Card name').fill('Charizard');
  await rows.first().locator('select').first().selectOption('Pokemon');
  await rows.first().locator('input[placeholder="Price"]').fill('40');

  // A flat $5 add-on (e.g. two binders the shop wants to buy) — distinct
  // from a card row: no Game/Set/Rarity, just Name/Description/Price.
  await page.getByRole('button', { name: '+ Add misc. item' }).click();
  const addOnRow = page.locator('.scan-row').last();
  await addOnRow.getByPlaceholder('e.g. Binder, playmat, bulk V/ex lot').fill('Binder');
  await addOnRow.getByPlaceholder('Price').fill('5');

  // Total quoted value (what the 50/60/70% tiers are computed from) only
  // reflects the $40 card — the add-on's $5 shows separately. Scoped to the
  // Add-ons total stat specifically — the Bulk total stat right next to it
  // renders its own (disabled, since this quote has no bulk items) "Add to
  // payout" button too, so an unscoped button query would match both.
  await expect(page.getByText('Total quoted value').locator('..')).toContainText('$40.00');
  const addOnsStat = page.getByText('Add-ons total').locator('..');
  await expect(addOnsStat).toContainText('$5.00');

  // "Add to payout" adds the add-on's raw $5 straight into Payout amount —
  // not scaled by any tier percentage.
  await addOnsStat.getByRole('button', { name: 'Add to payout' }).click();
  const payoutInput = page.locator('.field-group', { hasText: 'Payout amount' }).locator('input');
  await expect(payoutInput).toHaveValue('5');

  // The button flips to "Remove from payout" instead of staying a
  // repeatable "Add" that would stack the same $5 in again and again.
  await expect(addOnsStat.getByRole('button', { name: 'Add to payout' })).toHaveCount(0);
  await addOnsStat.getByRole('button', { name: 'Remove from payout' }).click();
  await expect(payoutInput).toHaveValue('0');
  await expect(addOnsStat.getByRole('button', { name: 'Remove from payout' })).toHaveCount(0);

  // Re-apply it before accepting, so the rest of this test proceeds as before.
  await addOnsStat.getByRole('button', { name: 'Add to payout' }).click();
  await expect(payoutInput).toHaveValue('5');

  await page.locator('.field-group', { hasText: 'Offer status' }).locator('select').selectOption('accepted_cash');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  // The card moves to Sorting to be placed; the add-on never does — it was
  // pricing-only, confirmed never to become real inventory.
  await page.locator('.tab', { hasText: 'Sorting' }).click();
  const sortingPanel = page.locator('.panel.active');
  await expect(sortingPanel.getByText('Charizard')).toBeVisible();
  await expect(sortingPanel.getByText('Binder', { exact: true })).toHaveCount(0);
});

test('Bulk items live in their own section, are excluded from the tier total, and still reach Sorting on accept', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Bulk test');
  await page.getByRole('button', { name: 'Create' }).click();

  // "+ Add card as Bulk" lives in its own "Bulk items" section, separate
  // from the Cards list — a light row with Qty/Game/Lot name/Description/
  // Price. This quote has no other items, so the one resulting .scan-row
  // is this Bulk row.
  await expect(page.getByText('Bulk items (0)')).toBeVisible();
  await page.getByRole('button', { name: '+ Add card as Bulk' }).click();
  await expect(page.getByText('Bulk items (1)')).toBeVisible();
  const bulkRow = page.locator('.scan-row');
  await expect(bulkRow).toHaveCount(1);
  await bulkRow.locator('input[placeholder="Qty"]').fill('20');
  await bulkRow.locator('select').selectOption('Pokemon');
  await bulkRow.locator('input[placeholder="e.g. Pokemon surge bulk"]').fill('Pokemon surge bulk');
  await bulkRow.locator('input[placeholder="e.g. all Pikachus in different conditions"]').fill('all pikachus in different conditions');
  await bulkRow.locator('input[placeholder="Price"]').fill('5');

  // A Bulk lot's flat $5 is excluded from Total quoted value (stays $0,
  // there are no other cards on this quote) and instead shows under its
  // own "Bulk total" stat — not scaled by Qty (20) into $100.
  await expect(page.getByText('Total quoted value').locator('..')).toContainText('$0.00');
  await expect(page.getByText('Bulk total').locator('..')).toContainText('$5.00');

  // "Add to payout" / "Remove from payout" toggles independently of the
  // misc. add-ons' own (disabled, since this quote has no add-ons) toggle —
  // scoped to the Bulk total stat specifically to avoid matching both.
  const payoutInput = page.locator('.field-group', { hasText: 'Payout amount' }).locator('input');
  const bulkStat = page.getByText('Bulk total').locator('..');
  await bulkStat.getByRole('button', { name: 'Add to payout' }).click();
  await expect(payoutInput).toHaveValue('5');
  await bulkStat.getByRole('button', { name: 'Remove from payout' }).click();
  await expect(payoutInput).toHaveValue('0');
  await bulkStat.getByRole('button', { name: 'Add to payout' }).click();
  await expect(payoutInput).toHaveValue('5');

  await page.locator('.field-group', { hasText: 'Offer status' }).locator('select').selectOption('accepted_cash');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal-head .name')).toHaveCount(0);

  // Unlike a misc. add-on, a Bulk item still flows to Sorting like any
  // other card — it's placed into Bulk there, same as always.
  await page.locator('.tab', { hasText: 'Sorting' }).click();
  const sortingPanel = page.locator('.panel.active');
  await expect(sortingPanel.getByText('Pokemon surge bulk')).toBeVisible();
});

test('a Bulk lot can opt into a payout percentage instead of its full entered value', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Bulk % test');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: '+ Add card as Bulk' }).click();
  const bulkRow = page.locator('.scan-row');
  await bulkRow.locator('input[placeholder="Qty"]').fill('20');
  await bulkRow.locator('select').selectOption('Pokemon');
  await bulkRow.locator('input[placeholder="Price"]').fill('5');

  // Before opting in, the full entered $5 counts toward Bulk total.
  await expect(page.getByText('Bulk total').locator('..')).toContainText('$5.00');

  // Checking "Apply a %?" and picking 60% drops it to $3.00 — not $5 (no
  // percentage) or $100 (qty wrongly used as a multiplier).
  await bulkRow.getByLabel('Apply a %?').check();
  await bulkRow.locator('input[placeholder="e.g. 60"]').fill('60');
  await expect(page.getByText('Bulk total').locator('..')).toContainText('$3.00');
});

test('a card\'s Alter % shifts its own contribution relative to whichever tier is shown, for every tier', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Alter % test');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  const rows = page.locator('.scan-row');
  const nameInputs = page.getByPlaceholder('Card name');
  await nameInputs.first().fill('Charizard');
  await rows.first().locator('input[placeholder="Price"]').fill('100');

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await nameInputs.last().fill('Heavily Played Lugia');
  await rows.last().locator('input[placeholder="Price"]').fill('100');

  // Pay this specific card 20 points less than whichever tier ends up used
  // — e.g. a worse condition than the rest of the collection.
  await rows.last().getByLabel('Alter %?').check();
  await rows.last().locator('input[placeholder="e.g. +10 or -20"]').fill('-20');

  // 60% tier: unaltered Charizard pays 100×60%=$60; altered Lugia pays
  // 100×(60-20)%=$40. Total $100 — not $120 if the delta were ignored.
  await expect(page.getByText('60% offer').locator('..')).toContainText('$100.00');
});

test('quote detail sections collapse and expand independently', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Collapsible sections test');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.modal-head .name', { hasText: 'New quote' })).toBeVisible();

  // All four sections start expanded.
  await expect(page.getByText('Customer name')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add card manually' })).toBeVisible();

  // Collapsing "Quote details" hides its fields but leaves the others alone.
  const detailsHeader = page.locator('.section-label', { hasText: 'Quote details' });
  await detailsHeader.click();
  await expect(page.getByText('Customer name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Add card manually' })).toBeVisible();

  // Collapsing "Cards" independently hides the add-card buttons.
  const cardsHeader = page.locator('.section-label', { hasText: 'Cards (' });
  await cardsHeader.click();
  await expect(page.getByRole('button', { name: '+ Add card manually' })).toHaveCount(0);

  // Re-expanding "Quote details" brings its fields back.
  await detailsHeader.click();
  await expect(page.getByText('Customer name')).toBeVisible();
});

test('cancelling a never-saved new quote leaves no trace — nothing to resume, no quote created', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Abandoned attempt');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.modal-head .name', { hasText: 'New quote' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  await page.getByPlaceholder('Card name').fill('Should not be saved');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.locator('.modal-head .name')).toHaveCount(0);
  await expect(page.getByText('No quotes yet')).toBeVisible();

  // Nothing was ever persisted, so "+ New Quote" has nothing to resume.
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await expect(page.getByText('Resume a collection')).toHaveCount(0);
});

test('quote line item gets Source link and Add image fields, matching the main view', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Quote' }).click();
  await page.getByPlaceholder('e.g. Jake binder proposal').fill('Source link test');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: '+ Add card manually' }).click();
  const row = page.locator('.scan-row').first();
  await row.getByPlaceholder('Card name').fill('Charizard');

  // Before a Source link is set, the reference-prices row falls back to a
  // manual TCGPlayer search, same as a catalog item with no sourceUrl.
  await expect(row.getByText('TCGPlayer ↗', { exact: true })).toBeVisible();

  await row.getByPlaceholder('e.g. TCGplayer product page link').fill('https://tcg/real-listing');
  await expect(row.getByText('Check live TCGPlayer listing ↗')).toBeVisible();
  await expect(row.getByRole('link', { name: 'open ↗' })).toHaveAttribute('href', 'https://tcg/real-listing');

  // Paste image URL — collapsed by default to keep the row condensed;
  // clicking it reveals the input, which renders straight into the row's
  // own thumbnail once filled, same "paste a stock image URL" escape
  // hatch EditModal offers alongside its real-photo upload.
  await expect(row.getByPlaceholder('Paste a stock image URL')).toHaveCount(0);
  await row.getByRole('button', { name: 'Paste image URL' }).click();
  await row.getByPlaceholder('Paste a stock image URL').fill('https://example.com/card.jpg');
  await expect(row.locator('.scan-row-thumb img')).toHaveAttribute('src', 'https://example.com/card.jpg');
});
