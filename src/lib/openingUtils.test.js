import { describe, it, expect } from 'vitest';
import {
  normalizeOpening, computeOpeningTotals, computeOpeningItemCosts, buildSortingItemsFromOpening,
  fillGameFromOpening, openingLabel, formatSigned,
} from './openingUtils.js';
import { rowToOpening, openingToRow } from './openingsDb.js';

const single = (price, qty = 1, extra = {}) => ({ id: `s${price}-${qty}`, name: `Card ${price}`, price, qty, ...extra });
const bulk = (price, qty = 1, extra = {}) => ({ id: `b${price}-${qty}`, name: 'Bulk', price, qty, isBulk: true, ...extra });

describe('normalizeOpening', () => {
  it('fills defaults', () => {
    const o = normalizeOpening({});
    expect(o.id).toBeNull();
    expect(o.productQty).toBe(1);
    expect(o.status).toBe('open');
    expect(o.items).toEqual([]);
    expect(o.sealedValue).toBeNull();
    expect(typeof o.openedAt).toBe('string');
  });
  it('parses money and keeps a bad quantity at 1', () => {
    const o = normalizeOpening({ sealedValue: '$120.50', expectedValue: '100', productQty: '0', status: 'done' });
    expect(o.sealedValue).toBe(120.5);
    expect(o.expectedValue).toBe(100);
    expect(o.productQty).toBe(1);
    expect(o.status).toBe('done');
  });
});

describe('computeOpeningTotals', () => {
  it('values singles per card and bulk as a flat lot', () => {
    const t = computeOpeningTotals([single(10, 2), single(5.5), bulk(4, 30)], 40);
    expect(t.singlesValue).toBe(25.5);
    expect(t.bulkValue).toBe(4);
    expect(t.actualTotal).toBe(29.5);
    expect(t.singlesCount).toBe(3);
    expect(t.bulkCount).toBe(30);
    expect(t.difference).toBe(-10.5);
    expect(t.differencePct).toBe(-26.25);
  });
  it('has no difference until Expected is set', () => {
    const t = computeOpeningTotals([single(10)], null);
    expect(t.difference).toBeNull();
    expect(t.differencePct).toBeNull();
  });
  it('is positive when pulls beat expected, and skips unpriced rows', () => {
    const t = computeOpeningTotals([single(80), single(null)], 50);
    expect(t.difference).toBe(30);
    expect(t.differencePct).toBe(60);
    expect(t.unpriced).toBe(1);
  });
  it('ignores a bulk lot\'s payout % (openings have none)', () => {
    const t = computeOpeningTotals([bulk(10, 5, { pctEnabled: true, pctValue: 50 })], 0);
    expect(t.bulkValue).toBe(10);
    expect(t.differencePct).toBeNull();
  });
});

describe('computeOpeningItemCosts', () => {
  it('splits the sealed value by each pull\'s value, per card', () => {
    const items = [single(30), single(10, 2), bulk(40, 100)];
    const out = computeOpeningItemCosts(items, 50);
    // weights 30, 20, 40 of 90
    expect(out[0].cost).toBe(16.67);
    expect(out[1].cost).toBe(5.56); // 11.11 for the line / 2
    expect(out[2].cost).toBe(0.22); // 22.22 for the lot / 100 cards
    const total = out[0].cost * 1 + out[1].cost * 2 + out[2].cost * 100;
    expect(Math.abs(total - 50)).toBeLessThan(0.5);
  });
  it('gives no cost without a sealed value, or to unpriced pulls', () => {
    expect(computeOpeningItemCosts([single(10)], null)[0].cost).toBeNull();
    const out = computeOpeningItemCosts([single(10), single(null)], 20);
    expect(out[0].cost).toBe(20);
    expect(out[1].cost).toBeNull();
  });
});

describe('buildSortingItemsFromOpening', () => {
  it('makes a sorting row per pull with cost, label and opening id', () => {
    const rows = buildSortingItemsFromOpening({
      id: 'op-1', openingNumber: 3, productName: 'Surging Sparks Booster Box', productQty: 2,
      sealedValue: 30, items: [single(20, 1, { game: 'Pokemon' }), bulk(10, 50, { game: 'Pokemon' })],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ openingId: 'op-1', quoteId: null, quoteCollectionName: 'Opening #3: 2× Surging Sparks Booster Box', cost: 20, game: 'Pokemon' });
    expect(rows[1]).toMatchObject({ openingId: 'op-1', cost: 0.2, qty: 50, price: 0.2 });
  });
});

describe('helpers', () => {
  it('fills a missing game from the opening, keeps an existing one', () => {
    const out = fillGameFromOpening([{ game: '' }, { game: 'Magic' }], 'Pokemon');
    expect(out.map(i => i.game)).toEqual(['Pokemon', 'Magic']);
    expect(fillGameFromOpening([{ game: '' }], '')[0].game).toBe('');
  });
  it('labels and signs', () => {
    expect(openingLabel({ productName: 'Box', productQty: 1, openingNumber: 7 })).toBe('Opening #7: Box');
    expect(openingLabel({ productName: '', productQty: 1, openingNumber: null })).toBe('Sealed product');
    expect(formatSigned(12.5)).toBe('+$12.50');
    expect(formatSigned(-3)).toBe('-$3.00');
    expect(formatSigned(null)).toBe('—');
  });
});

describe('opening row mapping', () => {
  it('round-trips and leaves out a missing id', () => {
    const row = openingToRow(normalizeOpening({ productName: 'Box', sealedValue: 100, items: [single(5)] }));
    expect(row.id).toBeUndefined();
    expect(row.opening_number).toBeUndefined();
    expect(row.sealed_value).toBe(100);
    const back = rowToOpening({ ...row, id: 'x', opening_number: 4 });
    expect(back).toMatchObject({ id: 'x', openingNumber: 4, productName: 'Box', sealedValue: 100, status: 'open', movedToSorting: false });
  });
});

describe('sorting row link to the opening', () => {
  it('reads opening_id from a sorting_queue row', async () => {
    const { rowToSortingItem } = await import('./db.js');
    expect(rowToSortingItem({ id: '1', name: 'X', opening_id: 'op-9' }).openingId).toBe('op-9');
    expect(rowToSortingItem({ id: '1', name: 'X' }).openingId).toBeNull();
  });
});
