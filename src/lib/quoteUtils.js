import { normalizeCard, parseMoney } from './cardUtils.js';

// The source spreadsheet hardcoded 50/60/70% everywhere — these are just
// the fallback before quote_settings loads (see db.js's dbLoadQuoteSettings),
// same "store-configurable, not hardcoded" pattern as
// DEFAULT_CONDITION_MULTIPLIERS in cardUtils.js.
export const DEFAULT_QUOTE_TIER_PCTS = { tier1: 50, tier2: 60, tier3: 70 };

// A quote line item — mirrors normalizeCard's defaulting discipline, with
// one deliberate difference: `condition` is NEVER defaulted (not even to
// "Near Mint"). Staff make a real, on-the-spot physical assessment of a
// card they're buying, and a silent default would stand in for that
// judgment call instead of forcing it.
export function normalizeQuoteItem(item) {
  const src = item || {};
  return {
    id: src.id || `qi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: src.name || '',
    game: src.game || '',
    set: src.set || '',
    number: src.number || '',
    rarity: src.rarity || '',
    printing: src.printing || '',
    condition: src.condition || '',
    basePrice: parseMoney(src.basePrice),
    price: parseMoney(src.price),
    qty: src.qty === '' || src.qty == null ? 1 : (Number(src.qty) || 1),
    notes: src.notes || '',
    // Same dual-image model as a catalog row (see cardUtils.js's
    // resolveActiveImage/activeImageSrc, reused as-is for a quote item's
    // thumbnail) — a picked catalog reference or a scan/import carries its
    // image straight over; a manually-typed row with no match just has none.
    imageUrl: src.imageUrl || '',
    imageData: src.imageData || '',
    photoUrl: src.photoUrl || '',
    photoData: src.photoData || '',
    activeImage: src.activeImage === 'stock' ? 'stock' : 'photo',
    // Same role as a catalog row's own sourceUrl (EditModal's "Source /
    // product URL") — a direct link to the real listing/product page this
    // item came from, entered by hand or carried over from a picked
    // catalog/search reference. See phase11_quote_source_url.sql for why
    // this needed a real migration (unlike every other field on this
    // object, which just lives in `quotes.items`' jsonb).
    sourceUrl: src.sourceUrl || '',
    // A flat, non-card add-on (a binder, a playmat, "$1 for 3 bulk V/ex") —
    // rendered via AddOnLineItemRow instead of the full card form, excluded
    // from computeQuoteTotals' tier-relevant total/qty (see below), and
    // dropped entirely by buildSortingItemsFromQuoteItems — it's a
    // pricing-only convenience, deliberately never becomes a real Sorting/
    // Catalog row. `name`/`notes` (used here as "description")/`price`/
    // `qty` (informational only — never multiplied into price, see
    // computeQuoteTotals) are the only fields this item type actually uses.
    isAddOn: !!src.isAddOn,
    // A real card destined for Bulk (no per-print identity needed) —
    // rendered via BulkLineItemRow in its own "Bulk items" section instead
    // of the Cards list. Priced exactly like a misc. add-on (a single flat
    // amount for the whole lot, e.g. "$5 for 20 bulk commons" — `qty` is
    // informational only, never multiplied into price) and excluded from
    // computeQuoteTotals' tier-relevant total/qty the same way — staff
    // explicitly don't want a bulk lot's flat price shaved by a tier %.
    // Unlike isAddOn, it DOES still flow through
    // buildSortingItemsFromQuoteItems to Sorting on accept, since it's a
    // real card destined for real inventory — staff place it into Bulk
    // there, same as the Sorting tab's existing "Add to Bulk" option
    // already does for any item regardless of origin (which is also why
    // `game` is still a real field here, unlike a misc. add-on — Bulk
    // placement is keyed on (location, game)).
    isBulk: !!src.isBulk,
    // Real staff ask: instead of pre-calculating "60% of this $5 lot" by
    // hand, check a box and type the percentage — flatItemAmount below does
    // the math. Applies to isAddOn/isBulk items only (a real card's own
    // percentage story is the quote-wide tier math, or its own pctAltered
    // delta below); never set/read for a regular card. `pctValue` is a
    // plain percentage of the entered price (60 means 60%, not a delta),
    // deliberately NOT locked to the three configured tiers — "100%, etc."
    // was explicitly part of the ask, so any number is valid.
    pctEnabled: !!src.pctEnabled,
    pctValue: src.pctValue === '' || src.pctValue == null ? null : Number(src.pctValue),
    // A regular card's own payout percentage normally comes straight from
    // whichever tier the quote is bought at (see computeOfferTiers below) —
    // pctAltered/pctDelta lets ONE card deviate from that blanket rate
    // (different condition/rarity/ease of sale) without staff hand-editing
    // its price and leaving themselves a note to remember the "real" price.
    // pctDelta is a signed delta in PERCENTAGE POINTS relative to whichever
    // tier ends up used (+10 on a 60% tier pays this card at 70%, -20 pays
    // it at 40%) — never an absolute override, matching how Noah described
    // the old manual workaround ("change the asking price by the percent
    // off/on I wanted"). Never set/read for an isAddOn/isBulk item — those
    // have their own independent pctEnabled/pctValue mechanism above.
    pctAltered: !!src.pctAltered,
    pctDelta: src.pctDelta === '' || src.pctDelta == null ? null : Number(src.pctDelta),
  };
}

// A flat item's (isAddOn/isBulk) actual contribution to its running total —
// the raw price, or price × pctValue/100 once staff check "Apply a %?" and
// type a value. Returns null when price itself is blank, same as every
// other blank-price-excludes-the-row rule in this file, so callers don't
// need a separate check. Exported so AddOnLineItemRow/BulkLineItemRow can
// show the computed dollar amount next to the raw value, and so
// QuotePrintViews' printed record matches what's shown on screen.
export function flatItemAmount(item) {
  const price = parseMoney(item.price);
  if (price == null) return null;
  if (item.pctEnabled && item.pctValue != null) {
    return price * (item.pctValue / 100);
  }
  return price;
}

// Keeps a tier-plus-delta percentage inside a sane 0-100% range — an
// altered card still pays somewhere between "nothing" and "full price,"
// same as every other percentage in this app.
function clampPct(pct) {
  return Math.min(100, Math.max(0, pct));
}

// Exported for QuoteDetail's own "Add to payout" button (addOnsTotal and
// an existing Payout amount are both already cent-rounded individually,
// but adding two floats back together can still reintroduce the exact
// floating-point noise this function exists to clean up elsewhere).
export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Total quoted value across every real card line item — same rule as the
// sheet's own line-total formula (price × qty, or just price with qty
// treated as 1), just applied to already-normalized items where qty is
// never blank. A blank price excludes that row from the total entirely,
// same as the sheet leaving that row's own line-total cell blank.
//
// Flat items — isAddOn (a binder, a playmat) and isBulk (a whole bulk lot,
// e.g. "$5 for 20 commons") — are both deliberately excluded from `qty`/
// `total` — staff explicitly don't want either scaled by the 50/60/70%
// tier math below, just added to the final payout at face value (or at
// their own opted-in percentage — see flatItemAmount above) if they choose
// to. Each is summed separately (`addOnsTotal`/`bulkTotal`) via
// flatItemAmount, deliberately NOT multiplied by `qty` even though both
// item types now carry a Qty field — qty there is informational
// record-keeping ("this lot was 20 cards"), never a price multiplier.
export function computeQuoteTotals(items) {
  let qty = 0;
  let total = 0;
  let addOnsTotal = 0;
  let bulkTotal = 0;
  for (const item of (items || [])) {
    if (item.isAddOn) {
      const amount = flatItemAmount(item);
      if (amount != null) addOnsTotal += amount;
      continue;
    }
    if (item.isBulk) {
      const amount = flatItemAmount(item);
      if (amount != null) bulkTotal += amount;
      continue;
    }
    const price = parseMoney(item.price);
    const q = Number(item.qty) || 1;
    qty += q;
    if (price != null) total += price * q;
  }
  return { qty, total: round2(total), addOnsTotal: round2(addOnsTotal), bulkTotal: round2(bulkTotal) };
}

// The three offer amounts shown alongside the total, computed PER CARD
// (not total × pct in one shot) so a card with its own Alter %
// (pctAltered/pctDelta) contributes at (tierPct + pctDelta) instead of the
// blanket tierPct for every tier — an unaltered card is just tierPct, the
// same math as before this feature existed. Computed for all three tiers
// at once (not just whichever one staff eventually pick) so every number
// shown is already correct regardless of which "Use" button gets clicked.
// Flat items (isAddOn/isBulk) are skipped entirely — their own payout
// contribution is the separate, independent flatItemAmount/pctEnabled
// mechanism above, never touched by the quote's tier percentages.
export function computeOfferTiers(items, tierSettings) {
  const s = tierSettings || DEFAULT_QUOTE_TIER_PCTS;
  const basePcts = {
    tier1: s.tier1 ?? DEFAULT_QUOTE_TIER_PCTS.tier1,
    tier2: s.tier2 ?? DEFAULT_QUOTE_TIER_PCTS.tier2,
    tier3: s.tier3 ?? DEFAULT_QUOTE_TIER_PCTS.tier3,
  };
  const sums = { tier1: 0, tier2: 0, tier3: 0 };
  for (const item of (items || [])) {
    if (item.isAddOn || item.isBulk) continue;
    const price = parseMoney(item.price);
    if (price == null) continue;
    const lineValue = price * (Number(item.qty) || 1);
    for (const key of Object.keys(basePcts)) {
      const pct = (item.pctAltered && item.pctDelta != null)
        ? clampPct(basePcts[key] + item.pctDelta)
        : basePcts[key];
      sums[key] += lineValue * pct / 100;
    }
  }
  return { tier1: round2(sums.tier1), tier2: round2(sums.tier2), tier3: round2(sums.tier3) };
}

// Cost-basis allocation at quote-accept time (for the Cost-tracking Reports
// feature — see CLAUDE.md). A quote's own `payoutAmount` is the one real
// number for "what we actually paid," but it's a single lump sum with no
// per-item "selected tier" ever persisted — QuoteDetail's own
// addOnsApplied/bulkApplied toggles are local UI state only, reset every
// time the modal reopens, never saved onto the quote row — so there's no
// reliable way to back out exactly how much of payoutAmount came from
// add-ons vs. real cards. Rather than guess at a field that doesn't exist,
// this instead:
//   1. Picks whichever of the three configured tiers' live totals
//      (computeOfferTiers) is numerically closest to the real
//      payoutAmount — the tier staff most likely actually used, possibly
//      with a small manual adjustment.
//   2. Allocates the real payoutAmount proportionally across every
//      non-add-on item, weighted by that item's own value AT THAT TIER (so
//      a card with its own Alter % delta gets a proportionally bigger/
//      smaller slice, same as it already does in the live tier display) —
//      scaled so the per-item amounts always sum to exactly payoutAmount
//      regardless of manual rounding or a hand-typed payout.
//   3. Divides each item's allocated share by its own qty, since `cost`
//      (like `price`) is a per-unit figure, not a per-line total.
// Deliberately does NOT try to exclude whatever portion of payoutAmount
// came from add-ons — that amount isn't separately recoverable once folded
// in, so a quote with add-ons applied will slightly overstate real cards'
// cost. A known, accepted imprecision, documented here rather than silently
// assumed away. Returns a NEW items array; isAddOn items are returned
// unchanged (they never reach Sorting/Catalog, so cost has no meaning for
// them).
export function computeQuoteItemCosts(items, payoutAmount, tierSettings) {
  const list = items || [];
  const amount = parseMoney(payoutAmount);
  if (amount == null || amount <= 0) {
    return list.map(item => (item.isAddOn ? item : { ...item, cost: null }));
  }

  const tiers = computeOfferTiers(list, tierSettings);
  const tierKeys = ['tier1', 'tier2', 'tier3'];
  const closestKey = tierKeys.reduce((best, key) =>
    Math.abs(tiers[key] - amount) < Math.abs(tiers[best] - amount) ? key : best, tierKeys[0]);

  const s = tierSettings || DEFAULT_QUOTE_TIER_PCTS;
  const basePct = s[closestKey] ?? DEFAULT_QUOTE_TIER_PCTS[closestKey];

  const weights = list.map(item => {
    if (item.isAddOn) return 0;
    if (item.isBulk) return flatItemAmount(item) || 0;
    const price = parseMoney(item.price);
    if (price == null) return 0;
    const pct = (item.pctAltered && item.pctDelta != null) ? clampPct(basePct + item.pctDelta) : basePct;
    return price * (Number(item.qty) || 1) * pct / 100;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return list.map((item, i) => {
    if (item.isAddOn) return item;
    if (totalWeight <= 0 || weights[i] <= 0) return { ...item, cost: null };
    const lineCost = amount * (weights[i] / totalWeight);
    return { ...item, cost: round2(lineCost / (Number(item.qty) || 1)) };
  });
}

// Adapter for the Scan/Import add-card methods: both ScannerPanel and
// ImportPanel already produce fully-formed normalizeCard(...)-shaped
// objects before calling their onImport callback (the same objects they'd
// otherwise write straight to Catalog) — this reshapes each one into a
// quote item instead, dropping the generated `sku` (quote items don't need
// one) and giving each a fresh client-side id.
//
// `number` (collector number) is left blank here — it isn't part of
// normalizeCard's saved shape at all (Scanner/Import already discard it as
// a transient, never-saved search-only hint before calling onImport, the
// same as when they write straight to Catalog), so there's nothing to
// carry over. Staff can still type it in by hand afterward.
export function itemsFromCatalogRows(cards) {
  return (cards || []).map(c => normalizeQuoteItem({
    name: c.name,
    game: c.game,
    set: c.set,
    rarity: c.rarity,
    printing: c.printing,
    condition: c.condition,
    basePrice: c.basePrice,
    price: c.price,
    qty: c.qty,
    notes: c.notes,
    imageUrl: c.imageUrl,
    imageData: c.imageData,
    photoUrl: c.photoUrl,
    photoData: c.photoData,
    activeImage: c.activeImage,
    sourceUrl: c.sourceUrl,
  }));
}

// Sort-time conversion: turns one or more sorting-queue items (see
// phase10_sorting_bulk.sql) into new Catalog rows via the exact same
// normalizeCard(...) shape EditModal/ScannerPanel already build before
// calling dbUpsertCard(s) — no new catalog-write primitive needed.
// basePrice carries over so Market Value keeps working on each new row
// going forward; price/condition/qty/notes carry over as entered on the
// quote. Called from App.jsx's handleSortItems — every item passed shares
// this one destination decision (a single sorting-queue row via the per-row
// "Sort" button, or several batch-selected rows headed to the same binder/
// case at once — see the Sorting stage in CLAUDE.md).
//
// `destination` — { location, posChannel, tcgplayerChannel, collectrChannel }
// — is staff's answer to "where are these cards going?".
// Omitting it (e.g. existing callers/tests) falls back to normalizeCard's
// own defaults — blank location, channels defaulting to "everywhere".
export function buildCatalogItemsFromQuoteItems(items, destination) {
  const dest = destination || {};
  return (items || []).map((item, i) => normalizeCard({
    sku: `quote-${Date.now()}-${i}`,
    name: item.name,
    game: item.game,
    set: item.set,
    condition: item.condition,
    printing: item.printing,
    rarity: item.rarity,
    qty: item.qty,
    price: item.price,
    basePrice: item.basePrice,
    cost: item.cost,
    notes: item.notes,
    imageUrl: item.imageUrl,
    imageData: item.imageData,
    photoUrl: item.photoUrl,
    photoData: item.photoData,
    activeImage: item.activeImage,
    sourceUrl: item.sourceUrl,
    // A sorting_queue row carries the quote it came from (quoteId); the
    // catalog row keeps it so its edit screen can link back to the quote.
    sourceQuoteId: item.quoteId || item.sourceQuoteId || null,
    location: dest.location || '',
    posChannel: dest.posChannel,
    tcgplayerChannel: dest.tcgplayerChannel,
    collectrChannel: dest.collectrChannel,
  }));
}

// Accept-time move: turns every real card line item of a newly-accepted
// quote into a sorting_queue row instead of a Catalog row — accepting no
// longer asks "where are these going" itself; that question moves entirely
// to the Sorting tab, one card at a time (see CLAUDE.md's "Sorting stage"
// section). quoteId/quoteCollectionName are snapshotted onto every row so
// the Sorting tab can show which quote a pending item came from without a
// join, and so the row still reads sensibly if the quote is later deleted.
//
// Flat add-on items (item.isAddOn) are filtered out entirely — confirmed
// with the user as pricing-only, never real inventory, so a binder or a
// flat bulk-lot offer never becomes a Sorting row to place.
export function buildSortingItemsFromQuoteItems(items, quoteId, quoteCollectionName) {
  return (items || []).filter(item => !item.isAddOn).map(item => ({
    quoteId,
    quoteCollectionName: quoteCollectionName || '',
    name: item.name,
    game: item.game,
    set: item.set,
    number: item.number,
    rarity: item.rarity,
    printing: item.printing,
    condition: item.condition,
    price: item.price,
    basePrice: item.basePrice,
    cost: item.cost,
    qty: item.qty,
    notes: item.notes,
    imageUrl: item.imageUrl,
    imageData: item.imageData,
    photoUrl: item.photoUrl,
    photoData: item.photoData,
    activeImage: item.activeImage,
    sourceUrl: item.sourceUrl,
  }));
}
