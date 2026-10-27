import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUOTE_TIER_PCTS, normalizeQuoteItem, computeQuoteTotals, computeOfferTiers, flatItemAmount,
  itemsFromCatalogRows, buildCatalogItemsFromQuoteItems, buildSortingItemsFromQuoteItems, computeQuoteItemCosts,
} from './quoteUtils.js';

describe('normalizeQuoteItem', () => {
  it('defaults qty to 1 when blank/missing, but never defaults condition', () => {
    const item = normalizeQuoteItem({ name: 'Charizard' });
    expect(item.qty).toBe(1);
    expect(item.condition).toBe('');
  });

  it('preserves an explicit condition and never substitutes Near Mint', () => {
    const item = normalizeQuoteItem({ name: 'Charizard', condition: 'Lightly Played' });
    expect(item.condition).toBe('Lightly Played');
  });

  it('gives every item a stable id, generating one if none was provided', () => {
    const a = normalizeQuoteItem({ name: 'A' });
    const b = normalizeQuoteItem({ name: 'B' });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    const withId = normalizeQuoteItem({ id: 'keep-me', name: 'C' });
    expect(withId.id).toBe('keep-me');
  });

  it('parses price/basePrice through parseMoney (blank -> null, not 0)', () => {
    const item = normalizeQuoteItem({ name: 'X', price: '', basePrice: undefined });
    expect(item.price).toBeNull();
    expect(item.basePrice).toBeNull();
  });

  it('carries the same dual-image fields a catalog row has, defaulting activeImage to photo', () => {
    const item = normalizeQuoteItem({ name: 'X', imageUrl: 'https://x/stock.jpg', photoData: 'data:img' });
    expect(item.imageUrl).toBe('https://x/stock.jpg');
    expect(item.photoData).toBe('data:img');
    expect(item.activeImage).toBe('photo');
    expect(normalizeQuoteItem({ name: 'Y', activeImage: 'stock' }).activeImage).toBe('stock');
  });

  it('defaults sourceUrl to an empty string, but preserves an explicit one', () => {
    expect(normalizeQuoteItem({ name: 'X' }).sourceUrl).toBe('');
    expect(normalizeQuoteItem({ name: 'X', sourceUrl: 'https://tcg/real-listing' }).sourceUrl).toBe('https://tcg/real-listing');
  });

  it('defaults isAddOn to false, but preserves an explicit true', () => {
    expect(normalizeQuoteItem({ name: 'X' }).isAddOn).toBe(false);
    expect(normalizeQuoteItem({ name: 'Binder', isAddOn: true }).isAddOn).toBe(true);
  });

  it('defaults isBulk to false, but preserves an explicit true', () => {
    expect(normalizeQuoteItem({ name: 'X' }).isBulk).toBe(false);
    expect(normalizeQuoteItem({ game: 'Pokemon', isBulk: true }).isBulk).toBe(true);
  });

  it('defaults pctEnabled to false and pctValue to null, but preserves explicit values', () => {
    const blank = normalizeQuoteItem({ name: 'Binder', isAddOn: true });
    expect(blank.pctEnabled).toBe(false);
    expect(blank.pctValue).toBeNull();
    const set = normalizeQuoteItem({ name: 'Binder', isAddOn: true, pctEnabled: true, pctValue: 60 });
    expect(set.pctEnabled).toBe(true);
    expect(set.pctValue).toBe(60);
  });

  it('defaults pctAltered to false and pctDelta to null, but preserves an explicit negative delta', () => {
    const blank = normalizeQuoteItem({ name: 'Charizard' });
    expect(blank.pctAltered).toBe(false);
    expect(blank.pctDelta).toBeNull();
    const altered = normalizeQuoteItem({ name: 'Charizard', pctAltered: true, pctDelta: -20 });
    expect(altered.pctAltered).toBe(true);
    expect(altered.pctDelta).toBe(-20);
  });
});

describe('flatItemAmount', () => {
  it('returns the raw price when pctEnabled is off', () => {
    const item = normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true });
    expect(flatItemAmount(item)).toBe(5);
  });

  it('applies pctValue as a percentage of the raw price when pctEnabled is on', () => {
    const item = normalizeQuoteItem({ name: 'Bulk lot', price: 5, isBulk: true, pctEnabled: true, pctValue: 60 });
    expect(flatItemAmount(item)).toBe(3);
  });

  it('is not locked to 50/60/70 — any percentage, including 100, works', () => {
    const item = normalizeQuoteItem({ name: 'Bulk lot', price: 5, isBulk: true, pctEnabled: true, pctValue: 100 });
    expect(flatItemAmount(item)).toBe(5);
  });

  it('returns null for a blank price regardless of pctEnabled', () => {
    const item = normalizeQuoteItem({ name: 'Binder', price: null, isAddOn: true, pctEnabled: true, pctValue: 60 });
    expect(flatItemAmount(item)).toBeNull();
  });

  it('ignores pctEnabled when pctValue itself is blank, falling back to the raw price', () => {
    const item = normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true, pctEnabled: true, pctValue: null });
    expect(flatItemAmount(item)).toBe(5);
  });
});

describe('computeQuoteTotals', () => {
  it('sums price × qty across items', () => {
    const items = [
      normalizeQuoteItem({ name: 'A', price: 10, qty: 2 }),
      normalizeQuoteItem({ name: 'B', price: 5, qty: 1 }),
    ];
    const { qty, total } = computeQuoteTotals(items);
    expect(qty).toBe(3);
    expect(total).toBe(25);
  });

  it('treats a blank qty as 1, matching the source sheet\'s own line-total rule', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 10, qty: '' })];
    const { total } = computeQuoteTotals(items);
    expect(total).toBe(10);
  });

  it('excludes a blank-price row from the total entirely', () => {
    const items = [
      normalizeQuoteItem({ name: 'A', price: 10, qty: 1 }),
      normalizeQuoteItem({ name: 'B', price: null, qty: 5 }),
    ];
    const { total } = computeQuoteTotals(items);
    expect(total).toBe(10);
  });

  it('returns zero for an empty item list', () => {
    expect(computeQuoteTotals([])).toEqual({ qty: 0, total: 0, addOnsTotal: 0, bulkTotal: 0 });
  });

  it('excludes add-on items from qty/total entirely, summing them into addOnsTotal instead', () => {
    const items = [
      normalizeQuoteItem({ name: 'Charizard', price: 40, qty: 1 }),
      normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true }),
      normalizeQuoteItem({ name: '3x Bulk V/ex', price: 1, isAddOn: true }),
    ];
    const { qty, total, addOnsTotal } = computeQuoteTotals(items);
    expect(qty).toBe(1);
    expect(total).toBe(40);
    expect(addOnsTotal).toBe(6);
  });

  it('excludes a blank-price add-on from addOnsTotal, same as a blank-price card is excluded from total', () => {
    const items = [normalizeQuoteItem({ name: 'Binder', price: null, isAddOn: true })];
    expect(computeQuoteTotals(items).addOnsTotal).toBe(0);
  });

  it('never multiplies an add-on\'s qty into addOnsTotal — qty is a record only', () => {
    const items = [normalizeQuoteItem({ name: '3x Bulk V/ex', price: 5, qty: 3, isAddOn: true })];
    expect(computeQuoteTotals(items).addOnsTotal).toBe(5);
  });

  it('excludes isBulk items from qty/total entirely, summing their flat price into bulkTotal instead', () => {
    const items = [
      normalizeQuoteItem({ game: 'Pokemon', name: 'Pokemon surge bulk', price: 5, qty: 20, isBulk: true }),
      normalizeQuoteItem({ name: 'Charizard', price: 40, qty: 1 }),
    ];
    const { qty, total, addOnsTotal, bulkTotal } = computeQuoteTotals(items);
    expect(qty).toBe(1);
    expect(total).toBe(40);
    expect(addOnsTotal).toBe(0);
    expect(bulkTotal).toBe(5);
  });

  it('never multiplies a bulk lot\'s qty into bulkTotal — a $5 lot of 20 cards stays $5, not $100', () => {
    const items = [normalizeQuoteItem({ game: 'Pokemon', price: 5, qty: 20, isBulk: true })];
    expect(computeQuoteTotals(items).bulkTotal).toBe(5);
  });

  it('excludes a blank-price bulk lot from bulkTotal, same as a blank-price add-on is excluded from addOnsTotal', () => {
    const items = [normalizeQuoteItem({ game: 'Pokemon', price: null, qty: 20, isBulk: true })];
    expect(computeQuoteTotals(items).bulkTotal).toBe(0);
  });

  it('sums addOnsTotal and bulkTotal independently when both are present', () => {
    const items = [
      normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true }),
      normalizeQuoteItem({ game: 'Pokemon', price: 8, qty: 20, isBulk: true }),
    ];
    const { addOnsTotal, bulkTotal } = computeQuoteTotals(items);
    expect(addOnsTotal).toBe(5);
    expect(bulkTotal).toBe(8);
  });

  it('applies an add-on\'s own opted-in percentage to addOnsTotal instead of the raw price', () => {
    const items = [normalizeQuoteItem({ name: '5x $1-5 cards', price: 10, isAddOn: true, pctEnabled: true, pctValue: 60 })];
    expect(computeQuoteTotals(items).addOnsTotal).toBe(6);
  });

  it('applies a bulk lot\'s own opted-in percentage to bulkTotal instead of the raw price', () => {
    const items = [normalizeQuoteItem({ game: 'Pokemon', price: 5, qty: 20, isBulk: true, pctEnabled: true, pctValue: 70 })];
    expect(computeQuoteTotals(items).bulkTotal).toBe(3.5);
  });
});

describe('computeOfferTiers', () => {
  it('computes the three tiers from custom store settings, not just the 50/60/70 default', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 100, qty: 1 })];
    const tiers = computeOfferTiers(items, { tier1: 40, tier2: 55, tier3: 75 });
    expect(tiers).toEqual({ tier1: 40, tier2: 55, tier3: 75 });
  });

  it('falls back to DEFAULT_QUOTE_TIER_PCTS when no settings are given', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 200, qty: 1 })];
    const tiers = computeOfferTiers(items, null);
    expect(tiers).toEqual({
      tier1: 200 * DEFAULT_QUOTE_TIER_PCTS.tier1 / 100,
      tier2: 200 * DEFAULT_QUOTE_TIER_PCTS.tier2 / 100,
      tier3: 200 * DEFAULT_QUOTE_TIER_PCTS.tier3 / 100,
    });
  });

  it('sums qty × price across several unaltered cards, same as the old total × pct math', () => {
    const items = [
      normalizeQuoteItem({ name: 'A', price: 10, qty: 2 }),
      normalizeQuoteItem({ name: 'B', price: 5, qty: 1 }),
    ];
    const tiers = computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 });
    // total = 25; 50% = 12.50, 60% = 15, 70% = 17.50
    expect(tiers).toEqual({ tier1: 12.5, tier2: 15, tier3: 17.5 });
  });

  it('pays an altered card at tierPct + pctDelta instead of the blanket tierPct, for every tier', () => {
    const items = [
      normalizeQuoteItem({ name: 'Unaltered', price: 100, qty: 1 }),
      normalizeQuoteItem({ name: 'Altered +10', price: 100, qty: 1, pctAltered: true, pctDelta: 10 }),
    ];
    const tiers = computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 });
    // Unaltered: 100 × tierPct. Altered: 100 × (tierPct + 10).
    expect(tiers.tier1).toBe(100 * 0.5 + 100 * 0.6);
    expect(tiers.tier2).toBe(100 * 0.6 + 100 * 0.7);
    expect(tiers.tier3).toBe(100 * 0.7 + 100 * 0.8);
  });

  it('clamps an altered card\'s effective percentage to 0-100%, never negative or over full price', () => {
    const items = [normalizeQuoteItem({ name: 'Deep discount', price: 100, qty: 1, pctAltered: true, pctDelta: -90 })];
    // 50 - 90 would be -40%, clamped to 0.
    expect(computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 }).tier1).toBe(0);
    const overshoot = [normalizeQuoteItem({ name: 'Big bonus', price: 100, qty: 1, pctAltered: true, pctDelta: 50 })];
    // 70 + 50 would be 120%, clamped to 100.
    expect(computeOfferTiers(overshoot, { tier1: 50, tier2: 60, tier3: 70 }).tier3).toBe(100);
  });

  it('ignores pctDelta when pctAltered is checked but no delta was typed yet', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 100, qty: 1, pctAltered: true, pctDelta: null })];
    expect(computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 }).tier1).toBe(50);
  });

  it('skips isAddOn/isBulk items entirely — their payout comes from flatItemAmount/pctEnabled instead', () => {
    const items = [
      normalizeQuoteItem({ name: 'Binder', price: 1000, isAddOn: true }),
      normalizeQuoteItem({ game: 'Pokemon', price: 1000, isBulk: true }),
    ];
    expect(computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 })).toEqual({ tier1: 0, tier2: 0, tier3: 0 });
  });

  it('excludes a blank-price card from every tier, same as computeQuoteTotals\' own total', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: null, qty: 5 })];
    expect(computeOfferTiers(items, { tier1: 50, tier2: 60, tier3: 70 })).toEqual({ tier1: 0, tier2: 0, tier3: 0 });
  });
});

describe('itemsFromCatalogRows', () => {
  it('reshapes a normalizeCard-style object into a quote item and drops its sku', () => {
    const cards = [{
      sku: 'scan-123-0', name: 'Charizard', game: 'Pokemon', set: 'Base Set',
      rarity: 'Rare Holo', printing: 'Holo', condition: 'Near Mint',
      basePrice: 50, price: 42.5, qty: 1, notes: 'from scan',
    }];
    const items = itemsFromCatalogRows(cards);
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('sku');
    expect(items[0]).toMatchObject({
      name: 'Charizard', game: 'Pokemon', set: 'Base Set', rarity: 'Rare Holo',
      printing: 'Holo', condition: 'Near Mint', basePrice: 50, price: 42.5, qty: 1, notes: 'from scan',
    });
    expect(items[0].id).toBeTruthy();
  });

  it('leaves number blank — normalizeCard never carries a persisted collector number to adapt from', () => {
    const items = itemsFromCatalogRows([{ name: 'X', game: 'Magic' }]);
    expect(items[0].number).toBe('');
  });

  it('handles an empty/undefined card list', () => {
    expect(itemsFromCatalogRows([])).toEqual([]);
    expect(itemsFromCatalogRows(undefined)).toEqual([]);
  });

  it('carries image fields over from a scanned/picked card', () => {
    const items = itemsFromCatalogRows([{
      name: 'X', game: 'Pokemon', imageUrl: 'https://x/stock.jpg', photoData: 'data:crop', activeImage: 'stock',
    }]);
    expect(items[0].imageUrl).toBe('https://x/stock.jpg');
    expect(items[0].photoData).toBe('data:crop');
    expect(items[0].activeImage).toBe('stock');
  });

  it('carries sourceUrl over from a scanned/picked card', () => {
    const items = itemsFromCatalogRows([{ name: 'X', game: 'Pokemon', sourceUrl: 'https://tcg/real-listing' }]);
    expect(items[0].sourceUrl).toBe('https://tcg/real-listing');
  });
});

describe('computeQuoteItemCosts', () => {
  it('leaves cost null for every non-add-on item when there is no payout amount to allocate', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 10, qty: 1 })];
    expect(computeQuoteItemCosts(items, null, DEFAULT_QUOTE_TIER_PCTS)[0].cost).toBeNull();
    expect(computeQuoteItemCosts(items, 0, DEFAULT_QUOTE_TIER_PCTS)[0].cost).toBeNull();
  });

  it('allocates payoutAmount proportionally to each item\'s value at the closest-matching tier', () => {
    const items = [
      normalizeQuoteItem({ name: 'A', price: 100, qty: 1 }),
      normalizeQuoteItem({ name: 'B', price: 50, qty: 1 }),
    ];
    // tier1 (50%) totals 75, tier2 (60%) totals 90, tier3 (70%) totals 105 —
    // a real payout of exactly 90 should pick tier2.
    const result = computeQuoteItemCosts(items, 90, DEFAULT_QUOTE_TIER_PCTS);
    expect(result[0].cost).toBe(60);
    expect(result[1].cost).toBe(30);
  });

  it('returns isAddOn items completely unchanged, since cost has no meaning for them', () => {
    const items = [normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true })];
    const result = computeQuoteItemCosts(items, 5, DEFAULT_QUOTE_TIER_PCTS);
    expect(result[0]).toEqual(items[0]);
  });

  it('allocates a bulk item using its flat lot value as weight, then divides by its own qty for a per-unit cost', () => {
    const items = [normalizeQuoteItem({ name: 'Bulk lot', price: 20, isBulk: true, game: 'Pokemon', qty: 10 })];
    const result = computeQuoteItemCosts(items, 20, DEFAULT_QUOTE_TIER_PCTS);
    expect(result[0].cost).toBe(2);
  });

  it('gives an Alter %?-adjusted card a proportionally bigger slice than the blanket tier rate', () => {
    const items = [
      normalizeQuoteItem({ name: 'A', price: 100, qty: 1 }),
      normalizeQuoteItem({ name: 'B', price: 100, qty: 1, pctAltered: true, pctDelta: 10 }),
    ];
    const result = computeQuoteItemCosts(items, 110, DEFAULT_QUOTE_TIER_PCTS);
    expect(result[0].cost).toBe(50);
    expect(result[1].cost).toBe(60);
  });

  it('divides a multi-qty card\'s allocated line cost by its qty for a per-unit figure', () => {
    const items = [normalizeQuoteItem({ name: 'A', price: 10, qty: 4 })];
    // Only item, so it gets the whole payout as its line's cost (40), / 4 qty = 10/unit.
    const result = computeQuoteItemCosts(items, 40, DEFAULT_QUOTE_TIER_PCTS);
    expect(result[0].cost).toBe(10);
  });
});

describe('buildCatalogItemsFromQuoteItems', () => {
  it('produces valid normalizeCard-shaped objects with a generated sku', () => {
    const items = [normalizeQuoteItem({
      name: 'Charizard', game: 'Pokemon', set: 'Base Set', condition: 'Lightly Played',
      printing: 'Holo', rarity: 'Rare Holo', qty: 2, price: 40, basePrice: 50, notes: 'from quote',
    })];
    const cards = buildCatalogItemsFromQuoteItems(items);
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.sku).toBeTruthy();
    expect(c.name).toBe('Charizard');
    expect(c.game).toBe('Pokemon');
    expect(c.condition).toBe('Lightly Played');
    expect(c.qty).toBe(2);
    expect(c.price).toBe(40);
    expect(c.basePrice).toBe(50);
    expect(c.notes).toBe('from quote');
  });

  it('gives each converted item a distinct sku', () => {
    const items = [normalizeQuoteItem({ name: 'A' }), normalizeQuoteItem({ name: 'B' })];
    const cards = buildCatalogItemsFromQuoteItems(items);
    expect(cards[0].sku).not.toBe(cards[1].sku);
  });

  it('handles an empty item list', () => {
    expect(buildCatalogItemsFromQuoteItems([])).toEqual([]);
  });

  it("keeps the quote a Sorting row came from as the new item's sourceQuoteId", () => {
    const fromSorting = [{ ...normalizeQuoteItem({ name: 'A' }), quoteId: 'quote-uuid-1' }];
    expect(buildCatalogItemsFromQuoteItems(fromSorting)[0].sourceQuoteId).toBe('quote-uuid-1');
    expect(buildCatalogItemsFromQuoteItems([normalizeQuoteItem({ name: 'B' })])[0].sourceQuoteId).toBe(null);
  });

  it('carries the quote item\'s image over onto the new catalog row', () => {
    const items = [normalizeQuoteItem({ name: 'A', imageUrl: 'https://x/stock.jpg', activeImage: 'stock' })];
    const cards = buildCatalogItemsFromQuoteItems(items);
    expect(cards[0].imageUrl).toBe('https://x/stock.jpg');
    expect(cards[0].activeImage).toBe('stock');
  });

  it('carries the quote item\'s sourceUrl over onto the new catalog row', () => {
    const items = [normalizeQuoteItem({ name: 'A', sourceUrl: 'https://tcg/real-listing' })];
    const cards = buildCatalogItemsFromQuoteItems(items);
    expect(cards[0].sourceUrl).toBe('https://tcg/real-listing');
  });

  it('applies a per-item destination (location + channels) rather than a whole-quote one', () => {
    const items = [normalizeQuoteItem({ name: 'A' })];
    const cards = buildCatalogItemsFromQuoteItems(items, {
      location: 'Red binder', posChannel: true, tcgplayerChannel: false, collectrChannel: false,
    });
    expect(cards[0].location).toBe('Red binder');
    expect(cards[0].posChannel).toBe(true);
    expect(cards[0].tcgplayerChannel).toBe(false);
    expect(cards[0].collectrChannel).toBe(false);
  });

  it('falls back to normalizeCard\'s own defaults (blank location, every channel on) when no destination is given', () => {
    const items = [normalizeQuoteItem({ name: 'A' })];
    const cards = buildCatalogItemsFromQuoteItems(items);
    expect(cards[0].location).toBe('');
    expect(cards[0].posChannel).toBe(true);
    expect(cards[0].tcgplayerChannel).toBe(true);
    expect(cards[0].collectrChannel).toBe(true);
  });
});

describe('buildSortingItemsFromQuoteItems', () => {
  it('reshapes every quote item into a sorting-queue row, snapshotting the quote id + collection name', () => {
    const items = [
      normalizeQuoteItem({ name: 'Charizard', game: 'Pokemon', set: 'Base Set', condition: 'Lightly Played', qty: 2, price: 40, basePrice: 50 }),
      normalizeQuoteItem({ name: 'Unlisted Promo Card', qty: 1, price: 5 }),
    ];
    const rows = buildSortingItemsFromQuoteItems(items, 'quote-id-1', 'Jake binder proposal');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      quoteId: 'quote-id-1', quoteCollectionName: 'Jake binder proposal',
      name: 'Charizard', game: 'Pokemon', set: 'Base Set', condition: 'Lightly Played',
      qty: 2, price: 40, basePrice: 50,
    });
    expect(rows[1]).toMatchObject({ quoteId: 'quote-id-1', quoteCollectionName: 'Jake binder proposal', name: 'Unlisted Promo Card' });
  });

  it('never assigns a sku — sorting-queue rows are not yet Catalog items', () => {
    const rows = buildSortingItemsFromQuoteItems([normalizeQuoteItem({ name: 'A' })], 'q1', 'Test');
    expect(rows[0]).not.toHaveProperty('sku');
  });

  it('carries image fields over so the Sorting tab can show a thumbnail', () => {
    const items = [normalizeQuoteItem({ name: 'A', imageUrl: 'https://x/stock.jpg', activeImage: 'stock' })];
    const rows = buildSortingItemsFromQuoteItems(items, 'q1', 'Test');
    expect(rows[0].imageUrl).toBe('https://x/stock.jpg');
    expect(rows[0].activeImage).toBe('stock');
  });

  it('carries sourceUrl over so it survives the trip to the eventual Catalog row', () => {
    const items = [normalizeQuoteItem({ name: 'A', sourceUrl: 'https://tcg/real-listing' })];
    const rows = buildSortingItemsFromQuoteItems(items, 'q1', 'Test');
    expect(rows[0].sourceUrl).toBe('https://tcg/real-listing');
  });

  it('handles an empty item list', () => {
    expect(buildSortingItemsFromQuoteItems([], 'q1', 'Test')).toEqual([]);
  });

  it('drops add-on items entirely — they are pricing-only and never become real inventory', () => {
    const items = [
      normalizeQuoteItem({ name: 'Charizard', price: 40 }),
      normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true }),
    ];
    const rows = buildSortingItemsFromQuoteItems(items, 'q1', 'Test');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Charizard');
  });

  it('keeps isBulk items — unlike add-ons, they flow to Sorting like any real card', () => {
    const items = [
      normalizeQuoteItem({ game: 'Pokemon', price: 0.10, qty: 50, isBulk: true }),
      normalizeQuoteItem({ name: 'Binder', price: 5, isAddOn: true }),
    ];
    const rows = buildSortingItemsFromQuoteItems(items, 'q1', 'Test');
    expect(rows).toHaveLength(1);
    expect(rows[0].game).toBe('Pokemon');
    expect(rows[0].qty).toBe(50);
  });

  it('defaults quoteCollectionName to an empty string when not given', () => {
    const rows = buildSortingItemsFromQuoteItems([normalizeQuoteItem({ name: 'A' })], 'q1');
    expect(rows[0].quoteCollectionName).toBe('');
  });
});
