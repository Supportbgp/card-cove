// Price-spike alerts (Feature B, PR 2 — the in-app UI). The alerts
// themselves are written by the daily `price-check` Edge Function; this is
// only the client-side shaping the topbar badge, the alerts modal, the
// Catalog row markers, and EditModal's reference box all share, so they
// can't disagree about which alert belongs to which item.

// Mirrors price_tracking_settings' own column defaults
// (phase13_price_tracking.sql) and price-check's fallback when the row is
// missing — "usable immediately, real settings overwrite once loaded",
// same as DEFAULT_CONDITION_MULTIPLIERS/DEFAULT_QUOTE_TIER_PCTS.
export const DEFAULT_PRICE_TRACKING = { floorPrice: 25, spikePct: 20 };

// One alert per sku. price-check only inserts a new alert for a sku with no
// unacknowledged one already, so normally there's never more than one —
// but if there ever is (e.g. alerts created before that guard, or a race
// between two runs), the most recent is the one worth showing.
export function alertsBySku(alerts) {
  const map = new Map();
  for (const a of alerts || []) {
    const prev = map.get(a.sku);
    if (!prev || String(a.detectedAt) > String(prev.detectedAt)) map.set(a.sku, a);
  }
  return map;
}

export function formatPctChange(pct) {
  if (pct == null || pct === '') return '';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '';
  return `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
}

export function formatMoney(n) {
  return n == null || n === '' || !Number.isFinite(Number(n)) ? '—' : '$' + Number(n).toFixed(2);
}
