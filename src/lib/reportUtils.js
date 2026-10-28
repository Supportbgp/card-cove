// Pure, testable logic for the Reports tab (Feature A, PR 2 of the sales-
// reporting/price-tracking roadmap — see CLAUDE.md). Deliberately separate
// from quoteUtils.js despite the similar "totals math" shape — sales
// reporting and Quote-tab offer math are unrelated features that happen to
// both sum money, and coupling them would make neither easier to change.

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Revenue/volume, plus cost/profit for whichever sales actually have a
// recorded cost (see CLAUDE.md's "Cost tracking" section — cost-basis was
// explicitly scoped out of the original sales-reporting work, since most
// inbound paths never captured what the shop paid; this is that deferred
// feature). `sales` is whatever dbLoadSales returns: already-normalized
// rows with `qtySold`/`salePrice`/`cost`/`game`. A blank/null salePrice
// contributes 0 to revenue but still counts its qty toward units, since the
// sale genuinely happened even if the price wasn't captured — a blank/null
// `cost` gets the same treatment (contributes 0, still counts toward
// units), but is also separately tallied in `costUnknownCount` so a caller
// can show an honest "N sales have no recorded cost" caveat instead of
// implying `profit` is complete when it isn't. Both `cost` and `salePrice`
// are per-unit figures (same convention as catalog.price/catalog.cost), so
// both get multiplied by qty here to reach a sale's real total.
// Lost/stolen cards (inventory_losses, see CLAUDE.md's "Lost / stolen
// cards"): `losses` are whatever dbLoadLosses returns for the same range.
// Their lossAmount (Cost x qty) is subtracted from Profit, overall and per
// game. A sale whose customer was refunded after a shipping loss
// (`refundedAt` set) is left out of revenue, cost and units entirely; the
// loss row carries that card's cost instead, so it isn't counted twice. It's
// still counted in refundedCount/refundedRevenue for the caption.
export function computeSalesReport(sales, losses = []) {
  let revenue = 0;
  let units = 0;
  let cost = 0;
  let costUnknownCount = 0;
  let refundedCount = 0;
  let refundedRevenue = 0;
  let lossTotal = 0;
  const byGameMap = new Map();
  const entryFor = (game) => {
    const entry = byGameMap.get(game) || { game, units: 0, revenue: 0, cost: 0, losses: 0 };
    byGameMap.set(game, entry);
    return entry;
  };

  for (const s of sales || []) {
    const qty = Number(s.qtySold) || 0;
    const lineRevenue = s.salePrice == null ? 0 : Number(s.salePrice) * qty;
    if (s.refundedAt) {
      refundedCount++;
      refundedRevenue += lineRevenue;
      continue;
    }
    const lineCost = s.cost == null ? 0 : Number(s.cost) * qty;
    if (s.cost == null) costUnknownCount++;
    units += qty;
    revenue += lineRevenue;
    cost += lineCost;

    const entry = entryFor(s.game || 'Unknown');
    entry.units += qty;
    entry.revenue += lineRevenue;
    entry.cost += lineCost;
  }

  for (const l of losses || []) {
    const amount = Number(l.lossAmount) || 0;
    lossTotal += amount;
    entryFor(l.game || 'Unknown').losses += amount;
  }

  const byGame = Array.from(byGameMap.values())
    .map(g => ({
      ...g, revenue: round2(g.revenue), cost: round2(g.cost), losses: round2(g.losses),
      profit: round2(g.revenue - g.cost - g.losses),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.losses - a.losses);

  return {
    revenue: round2(revenue), units, cost: round2(cost), losses: round2(lossTotal),
    profit: round2(revenue - cost - lossTotal),
    costUnknownCount, refundedCount, refundedRevenue: round2(refundedRevenue), byGame,
  };
}

// The reasons "Report lost / stolen" offers, in that order. `key` is what's
// stored (inventory_losses.reason).
export const LOSS_REASONS = [
  { key: 'lost_in_shipment', label: 'Lost in shipment' },
  { key: 'lost_in_store', label: 'Lost in store' },
  { key: 'stolen', label: 'Stolen' },
  { key: 'damaged', label: 'Damaged' },
  { key: 'other', label: 'Other' },
];

export function lossReasonLabel(key) {
  const r = LOSS_REASONS.find(x => x.key === key);
  return r ? r.label : 'Other';
}

// Loss value: the card's Cost (per copy) x how many copies, in cents-exact
// dollars. Null when there's no usable cost, so callers can ask for one.
export function computeLossAmount(costEach, qty) {
  const c = Number(costEach);
  const q = Number(qty);
  if (costEach === null || costEach === undefined || costEach === '' || !Number.isFinite(c) || c < 0) return null;
  if (!Number.isFinite(q) || q <= 0) return null;
  return round2(c * q);
}

// Calendar-month/calendar-year presets, computed from a real Date so this
// is testable without mocking the system clock for every case — callers
// pass `now` only in tests, real usage omits it. Upper bound is exclusive
// (the start of the NEXT period), matching how dbLoadSales's `.lt()` filter
// expects it.
export function presetDateRange(preset, now = new Date()) {
  if (preset === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString(),
      to: new Date(now.getFullYear() + 1, 0, 1).toISOString(),
    };
  }
  // Default: month.
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}

// Converts two <input type="date"> strings ("YYYY-MM-DD") into the
// [from, to) bounds dbLoadSales expects — `to` is bumped one day past the
// picked end date so that date is itself included (a customer reading
// "Jan 1 to Jan 31" expects Jan 31's sales in the report, not excluded by
// an exact-midnight boundary). Returns null if either input is blank,
// so the caller can tell "no custom range chosen yet" apart from a real one.
export function customDateRangeToBounds(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
