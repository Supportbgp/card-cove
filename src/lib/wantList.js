// Want list (CLAUDE.md "Want list"): cards customers asked the shop to look
// for. Staff add them; each stays open until fulfilled or rejected.

// What a quote suggests paying extra for a wanted card, in percentage
// points on top of the tier (the same "Alter %" a quote row already has).
export const WANTED_PAY_BUMP_PCT = 10;

export const WANT_STATUS_LABELS = { open: 'Open', fulfilled: 'Fulfilled', rejected: 'Rejected' };

export function rowToWant(r) {
  return {
    id: r.id,
    game: r.game || '',
    name: r.name || '',
    set: r.set_name || '',
    number: r.number || '',
    rarity: r.rarity || '',
    printing: r.printing || '',
    condition: r.condition || '',
    imageUrl: r.image_url || '',
    maxPrice: r.max_price == null ? null : Number(r.max_price),
    customerName: r.customer_name || '',
    customerContact: r.customer_contact || '',
    responsible: r.responsible || '',
    notes: r.notes || '',
    // The public view has neither column: everything it lists is open and shown.
    showPublic: r.show_public !== false,
    status: r.status || 'open',
    createdAt: r.created_at || null,
    closedAt: r.closed_at || null,
  };
}

function trimmed(v) {
  return String(v ?? '').trim();
}

// The editable fields, for an insert or update (status/dates are set apart).
export function wantToRow(w) {
  const price = w.maxPrice === '' || w.maxPrice == null ? null : Number(w.maxPrice);
  return {
    game: w.game || '',
    name: trimmed(w.name),
    set_name: trimmed(w.set),
    number: trimmed(w.number),
    rarity: trimmed(w.rarity),
    printing: trimmed(w.printing),
    condition: trimmed(w.condition),
    image_url: w.imageUrl || '',
    max_price: Number.isFinite(price) ? price : null,
    customer_name: trimmed(w.customerName),
    customer_contact: trimmed(w.customerContact),
    responsible: trimmed(w.responsible),
    notes: trimmed(w.notes),
    show_public: w.showPublic !== false,
  };
}

// "Base Set · #4 · Holofoil · Near Mint": what the request was narrowed to.
export function wantDetailLine(w) {
  return [w.set, w.number ? `#${w.number}` : '', w.rarity, w.printing, w.condition].filter(Boolean).join(' · ');
}

export function wantPriceLabel(w) {
  return w.maxPrice == null ? 'No price given' : `Up to $${w.maxPrice.toFixed(2)}`;
}

function sameName(a, b) {
  return trimmed(a).toLowerCase() === trimmed(b).toLowerCase();
}

// In-stock catalog copies that could fill a request: same game and name,
// unsold, not Bulk.
export function wantStockMatches(want, catalog) {
  if (!trimmed(want.name)) return [];
  return (catalog || []).filter(c =>
    c.game === want.game && sameName(c.name, want.name) &&
    !c.sold && c.qty > 0 && c.itemType !== 'bulk'
  );
}

// Open requests a card (a quote line, a Sorting row) could fill: same name,
// and same game when both have one (a fresh quote row may not have a game
// picked yet).
export function wantsForCard(card, requests) {
  if (!card || !trimmed(card.name)) return [];
  return (requests || []).filter(w =>
    w.status === 'open' && sameName(w.name, card.name) &&
    (!card.game || !w.game || w.game === card.game)
  );
}

// "Wanted by Jake (up to $40), Ana": for the quote notice.
export function wantedByLine(wants) {
  return wants.map(w => {
    const who = w.customerName || 'a customer';
    return w.maxPrice == null ? who : `${who} (up to $${w.maxPrice.toFixed(2)})`;
  }).join(', ');
}
