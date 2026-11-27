import { parseMoney } from './cardUtils.js';
import { normalizeQuoteItem, buildSortingItemsFromQuoteItems, round2 } from './quoteUtils.js';

// Openings tab (CLAUDE.md "Openings"): sealed product the store opens
// itself. An opening's pulls use the quote line-item shape
// (normalizeQuoteItem), so the Quote tab's rows, Scan and Import all work
// on them unchanged. Only two kinds of item are used here: singles, valued
// per card (price × qty), and bulk lots (isBulk), one flat price for the
// lot. There are no misc. add-ons and no payout percentages.

export const OPENING_REASONS = [
  'Singles for online sales',
  'Bulk for sale',
  'In-store promo / event',
  'Damaged packaging',
  'Other',
];

export function normalizeOpening(o) {
  const src = o || {};
  return {
    id: src.id || null,
    openingNumber: src.openingNumber ?? null,
    openedAt: src.openedAt || new Date().toISOString(),
    productName: src.productName || '',
    productQty: Number(src.productQty) > 0 ? Math.floor(Number(src.productQty)) : 1,
    game: src.game || '',
    employee: src.employee || '',
    reason: src.reason || '',
    sealedValue: parseMoney(src.sealedValue),
    expectedValue: parseMoney(src.expectedValue),
    differenceReason: src.differenceReason || '',
    notes: src.notes || '',
    items: (src.items || []).map(normalizeQuoteItem),
    status: src.status === 'done' ? 'done' : 'open',
    movedToSorting: !!src.movedToSorting,
    createdAt: src.createdAt ?? null,
  };
}

// A bulk lot's value is its flat price, not price × qty (same as a quote's
// bulk lot: Qty is a record of how many cards, never a multiplier).
function itemValue(item) {
  const price = parseMoney(item.price);
  if (price == null) return null;
  if (item.isBulk) return price;
  return price * (Number(item.qty) || 1);
}

// Actual value of the opened singles, value of the bulk, and how far their
// sum landed from Expected. `difference` is null until Expected is filled
// in. A row with no price yet is left out of the sums and counted in
// `unpriced`, so the screen can say the total isn't complete.
export function computeOpeningTotals(items, expectedValue) {
  let singlesValue = 0;
  let bulkValue = 0;
  let singlesCount = 0;
  let bulkCount = 0;
  let unpriced = 0;
  for (const item of (items || [])) {
    if (item.isAddOn) continue;
    const q = Number(item.qty) || 1;
    if (item.isBulk) bulkCount += q; else singlesCount += q;
    const v = itemValue(item);
    if (v == null) { unpriced += 1; continue; }
    if (item.isBulk) bulkValue += v; else singlesValue += v;
  }
  singlesValue = round2(singlesValue);
  bulkValue = round2(bulkValue);
  const actualTotal = round2(singlesValue + bulkValue);
  const expected = parseMoney(expectedValue);
  const difference = expected == null ? null : round2(actualTotal - expected);
  const differencePct = expected == null || expected <= 0 ? null : round2((difference / expected) * 100);
  return { singlesValue, bulkValue, actualTotal, singlesCount, bulkCount, unpriced, difference, differencePct };
}

// Each pull's Cost: the sealed product's value split across the pulls in
// proportion to their value (a $40 single gets twice the share of a $20
// one), so the shares add up to exactly the sealed value. Per card, like a
// catalog row's cost: a line's share is divided by its qty (a bulk lot's
// by its card count). Rows with no price get no cost; with no sealed value
// (or nothing priced) nothing gets a cost.
export function computeOpeningItemCosts(items, sealedValue) {
  const list = items || [];
  const amount = parseMoney(sealedValue);
  const weights = list.map(item => (item.isAddOn ? 0 : (itemValue(item) || 0)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return list.map((item, i) => {
    if (item.isAddOn) return item;
    if (amount == null || amount <= 0 || totalWeight <= 0 || weights[i] <= 0) return { ...item, cost: null };
    const lineCost = amount * (weights[i] / totalWeight);
    return { ...item, cost: round2(lineCost / (Number(item.qty) || 1)) };
  });
}

export function openingLabel(opening) {
  const name = opening.productName || 'Sealed product';
  const qty = Number(opening.productQty) > 1 ? `${opening.productQty}× ` : '';
  return opening.openingNumber != null ? `Opening #${opening.openingNumber}: ${qty}${name}` : `${qty}${name}`;
}

// Done-time move: every pull becomes a sorting_queue row (singles and bulk
// lots alike, same as an accepted quote), with its Cost filled in and the
// opening it came from.
//
// A bulk lot's value is for the whole lot, but a sorting row's price is per
// card (placing it individually would otherwise make a row worth qty × the
// lot value), so a lot goes to Sorting at its value per card.
export function buildSortingItemsFromOpening(opening) {
  const withCost = computeOpeningItemCosts(opening.items, opening.sealedValue).map(item => {
    if (!item.isBulk) return item;
    const value = parseMoney(item.price);
    return { ...item, price: value == null ? null : round2(value / (Number(item.qty) || 1)) };
  });
  return buildSortingItemsFromQuoteItems(withCost, null, openingLabel(opening))
    .map(row => ({ ...row, openingId: opening.id }));
}

// Pulls missing a Game can't go to Sorting (they'd land in Catalog as
// "Other", same rule as accepting a quote). A pull with no game of its own
// takes the opening's Game when it has one, so staff only pick it once.
export function fillGameFromOpening(items, game) {
  if (!game) return items;
  return items.map(i => ((i.game || '').trim() ? i : { ...i, game }));
}

export function formatSigned(n) {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(2);
  return n > 0 ? `+$${abs}` : n < 0 ? `-$${abs}` : '$0.00';
}
