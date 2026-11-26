// Market climbs (CLAUDE.md "Hot cards: market price climbs from TCGCSV"):
// the pure parts of the daily job, tested by lib.test.js. run.js does the
// downloading and writing.
//
// TCGCSV (tcgcsv.com) republishes TCGplayer's prices for every game once a
// day, with a daily archive going back to 2024-02. Its FAQ: "Permission is
// implicit"; it asks for a clear User-Agent and a short pause between
// requests. An archive unpacks to <date>/<categoryId>/<groupId>/prices,
// each { results: [{ productId, marketPrice, subTypeName, ... }] }.

import { hotNameKey } from '../../src/lib/hotCards.js';

// TCGplayer category id -> the app's game name (ids checked against
// tcgcsv.com/tcgplayer/categories). Pokemon Japan (85) is left out: its
// names would match English cards in our catalog.
export const GAME_BY_CATEGORY = {
  1: 'Magic',
  2: 'Yugioh',
  3: 'Pokemon',
  68: 'One Piece',
  71: 'Lorcana',
  79: 'SWU',
  86: 'Gundam',
  89: 'Riftbound',
};

export const WINDOW_DAYS = 30;
// A climb worth a heads-up: worth at least MIN_NEW_PRICE now, at least
// MIN_OLD_PRICE before (a $0.05 -> $0.10 card "doubling" is noise), and up
// MIN_PCT or more (the same bar as the app's own tracked price climbs).
export const MIN_NEW_PRICE = 3;
export const MIN_OLD_PRICE = 0.5;
export const MIN_PCT = 20;
// Over this in a month is almost always one odd sale on a thinly traded
// listing (seen on a real run: a $0.75 card "to" $440), not a real move.
export const MAX_PCT = 400;
// Kept per game, biggest dollar gain first (a $20 -> $30 card matters more
// on a trade-in than a $3 card doubling), so the app's sign-in load stays
// small.
export const MAX_PER_GAME = 600;

// One group's prices file -> Map("productId|subType" -> market price).
export function parsePrices(json) {
  const out = new Map();
  for (const r of Array.isArray(json?.results) ? json.results : []) {
    const price = Number(r?.marketPrice);
    if (!r?.productId || !Number.isFinite(price) || price <= 0) continue;
    out.set(`${r.productId}|${r.subTypeName || ''}`, price);
  }
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Products whose market price climbed between the two days, biggest
// dollar gain first.
export function findClimbers(oldPrices, newPrices, {
  minNew = MIN_NEW_PRICE, minOld = MIN_OLD_PRICE, minPct = MIN_PCT, maxPct = MAX_PCT,
} = {}) {
  const out = [];
  for (const [key, newPrice] of newPrices) {
    const oldPrice = oldPrices.get(key);
    if (oldPrice == null || oldPrice < minOld || newPrice < minNew) continue;
    const pct = ((newPrice - oldPrice) / oldPrice) * 100;
    if (pct < minPct || pct > maxPct) continue;
    const bar = key.indexOf('|');
    out.push({
      productId: Number(key.slice(0, bar)), subType: key.slice(bar + 1),
      oldPrice: round2(oldPrice), newPrice: round2(newPrice), pct: Math.round(pct * 10) / 10,
    });
  }
  return out.sort((a, b) => (b.newPrice - b.oldPrice) - (a.newPrice - a.oldPrice));
}

// The card's printed number from a product's extendedData. Sealed products
// (boxes, packs) have none, which is how they're left out.
export function productNumber(product) {
  const ext = Array.isArray(product?.extendedData) ? product.extendedData : [];
  const n = ext.find(e => e?.name === 'Number');
  return n ? String(n.value ?? '').trim() : '';
}

// A climber plus its product and group, as a market_movers row; null for
// anything that isn't a single card.
export function moverRow(climber, product, groupName, game, updatedAt) {
  const number = productNumber(product);
  const name = String(product?.name ?? '').trim();
  if (!number || !name) return null;
  return {
    product_id: climber.productId,
    sub_type: climber.subType,
    game,
    name,
    name_key: hotNameKey(name),
    set_name: String(groupName ?? ''),
    number,
    old_price: climber.oldPrice,
    new_price: climber.newPrice,
    pct_change: climber.pct,
    url: typeof product?.url === 'string' && product.url.startsWith('https://www.tcgplayer.com/') ? product.url : '',
    window_days: WINDOW_DAYS,
    updated_at: updatedAt,
  };
}

// "YYYY-MM-DD", n days before the given one.
export function dayBefore(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
