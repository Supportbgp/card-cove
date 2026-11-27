import { canonicalizeCondition, marketValueForCondition } from './cardUtils.js';

// Soft price warnings shown when an item is saved (moved out of App.jsx).

const CONDITION_RANK = { NM: 0, LP: 1, MP: 2, HP: 3, DMG: 4 };

// Soft nudge, not a hard rule — a worse-condition copy of the same card in
// the same case shouldn't be priced above a better-condition copy. Flags it
// so staff can double-check, doesn't block the save either way.
export function priceOrderingWarning(catalog, record) {
  const tier = canonicalizeCondition(record.condition);
  if (!tier || record.price == null) return null;
  const siblings = catalog.filter(c =>
    c.sku !== record.sku && c.name === record.name && c.game === record.game &&
    c.location === record.location && c.price != null && !c.sold
  );
  for (const s of siblings) {
    const sTier = canonicalizeCondition(s.condition);
    if (!sTier) continue;
    if (CONDITION_RANK[tier] < CONDITION_RANK[sTier] && record.price < s.price) {
      return `${record.name} (${tier}) is priced below the ${sTier} copy in this case — worth double-checking.`;
    }
    if (CONDITION_RANK[tier] > CONDITION_RANK[sTier] && record.price > s.price) {
      return `${record.name} (${tier}) is priced above the ${sTier} copy in this case — worth double-checking.`;
    }
  }
  return null;
}

// A different kind of soft nudge than priceOrderingWarning above: this one
// compares Our Price against THIS card's own computed Market Value, not
// against another physical copy. The flat condition multiplier can be
// materially wrong for a specific card (a real example landed ~18% off —
// see CLAUDE.md), so a meaningful gap is worth a second look — but it's
// still just a nudge; deliberate pricing decisions (the whole reason Our
// Price is separate from Market Value) are expected and not an error.
const MARKET_VALUE_DEVIATION_THRESHOLD = 0.15;

export function priceVsMarketValueWarning(record, multipliers) {
  if (record.basePrice == null || record.price == null || !multipliers) return null;
  const mv = marketValueForCondition(record.basePrice, record.condition, multipliers);
  if (mv == null || mv <= 0) return null;
  const diff = Math.abs(record.price - mv) / mv;
  if (diff < MARKET_VALUE_DEVIATION_THRESHOLD) return null;
  const dir = record.price < mv ? 'below' : 'above';
  return `${record.name}'s price ($${record.price.toFixed(2)}) is ${dir} its estimated market value ($${mv.toFixed(2)}).`;
}
