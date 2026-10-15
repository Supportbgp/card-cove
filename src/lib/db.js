import { supabaseClient } from './supabase.js';
import { normalizeCard, DEFAULT_CONDITION_MULTIPLIERS } from './cardUtils.js';
import { DEFAULT_QUOTE_TIER_PCTS } from './quoteUtils.js';
import { DEFAULT_PRICE_TRACKING } from './priceAlertUtils.js';

// Supabase/PostgREST caps a bare `.select()` at the project's configured
// Max Rows (1000 by default) — past that point a table's real total is
// silently truncated to that cap, with no error surfaced anywhere. Worse:
// without an explicit ORDER BY, which specific rows land inside that
// truncated window isn't guaranteed stable between requests, so a
// different arbitrary subset can come back next load even with nothing
// changed — looking exactly like a just-deleted row "reappearing," when
// it's really a different, previously-unfetched row now inside the
// window (this actually happened once the real catalog crossed 1000 rows
// — deletions looked like they were being undone because the visible
// count was pinned at the 1000-row cap, not because anything was
// un-deleted). Every full-table read in this file goes through this
// helper instead of trusting one bare `.select()` to have returned
// everything: it pages through with a stable ORDER BY (on a real,
// ideally-unique column) until a page comes back short of a full page.
const FETCH_PAGE_SIZE = 1000;

async function fetchAllRows(table, orderColumn, { ascending = true, filter } = {}) {
  const rows = [];
  let from = 0;
  for (;;) {
    let query = supabaseClient.from(table).select('*').order(orderColumn, { ascending });
    if (filter) query = filter(query);
    const { data, error } = await query.range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return { data: rows, error: null };
}

export function rowToCard(r) {
  return normalizeCard({
    sku: r.sku, name: r.name, set: r.set_name, game: r.game, condition: r.condition,
    printing: r.printing, rarity: r.rarity, qty: r.qty, price: r.price, notes: r.notes,
    imageUrl: r.image_data ? "local" : (r.image_url || ""),
    imageData: r.image_data || "",
    itemType: r.item_type, grader: r.grader, grade: r.grade, certNumber: r.cert_number,
    sold: r.sold, sourceUrl: r.source_url, location: r.location,
    lastUpdated: r.last_updated ? new Date(r.last_updated).getTime() : Date.now(),
    posSynced: r.pos_synced, tcgplayerSynced: r.tcgplayer_synced, collectrSynced: r.collectr_synced,
    posChannel: r.pos_channel, tcgplayerChannel: r.tcgplayer_channel, collectrChannel: r.collectr_channel,
    basePrice: r.base_price,
    cost: r.cost,
    photoUrl: r.photo_data ? "local" : (r.photo_url || ""),
    photoData: r.photo_data || "",
    activeImage: r.active_image,
  });
}

function cardToRow(c) {
  return {
    sku: c.sku, name: c.name, set_name: c.set, game: c.game, condition: c.condition,
    printing: c.printing, rarity: c.rarity, qty: c.qty, price: c.price, notes: c.notes,
    image_url: (c.imageUrl && c.imageUrl.startsWith('http')) ? c.imageUrl : '',
    image_data: c.imageUrl === 'local' ? (c.imageData || '') : '',
    item_type: c.itemType, grader: c.grader, grade: c.grade, cert_number: c.certNumber,
    sold: c.sold, source_url: c.sourceUrl, location: c.location,
    last_updated: new Date(c.lastUpdated).toISOString(),
    pos_synced: !!c.posSynced, tcgplayer_synced: !!c.tcgplayerSynced, collectr_synced: !!c.collectrSynced,
    pos_channel: c.posChannel !== false, tcgplayer_channel: c.tcgplayerChannel !== false, collectr_channel: c.collectrChannel !== false,
    base_price: c.basePrice ?? null,
    cost: c.cost ?? null,
    photo_url: (c.photoUrl && c.photoUrl.startsWith('http')) ? c.photoUrl : '',
    photo_data: c.photoUrl === 'local' ? (c.photoData || '') : '',
    active_image: c.activeImage === 'stock' ? 'stock' : 'photo',
  };
}

export function rowToTicket(r) {
  return {
    id: r.id, sku: r.sku, name: r.name, set: r.set_name, condition: r.condition, printing: r.printing,
    price: r.price, qtySold: r.qty_sold, timestamp: new Date(r.ts).getTime(),
    posDone: r.pos_done, tcgplayerDone: r.tcgplayer_done, collectrDone: r.collectr_done,
    posChannel: r.pos_channel, tcgplayerChannel: r.tcgplayer_channel, collectrChannel: r.collectr_channel,
  };
}

function ticketToRow(t) {
  return {
    id: t.id, sku: t.sku, name: t.name, set_name: t.set, condition: t.condition, printing: t.printing,
    price: t.price, qty_sold: t.qtySold, ts: new Date(t.timestamp).toISOString(),
    pos_done: t.posDone, tcgplayer_done: t.tcgplayerDone, collectr_done: t.collectrDone,
    pos_channel: t.posChannel !== false, tcgplayer_channel: t.tcgplayerChannel !== false, collectr_channel: t.collectrChannel !== false,
  };
}

export async function dbLoadAll(toast) {
  const { data: catRows, error: catErr } = await fetchAllRows('catalog', 'sku');
  let catalog = [];
  if (catErr) toast('Failed to load catalog: ' + catErr.message, true);
  else catalog = (catRows || []).map(rowToCard);

  const { data: qRows, error: qErr } = await fetchAllRows('sync_queue', 'id');
  let queue = [];
  if (qErr) toast('Failed to load sync queue: ' + qErr.message, true);
  else queue = (qRows || []).map(rowToTicket);

  return { catalog, queue };
}

export async function dbUpsertCard(card, toast) {
  const { error } = await supabaseClient.from('catalog').upsert(cardToRow(card));
  if (error) toast('Save failed: ' + error.message, true);
}

export async function dbUpsertCards(cards, toast) {
  if (!cards.length) return;
  const { error } = await supabaseClient.from('catalog').upsert(cards.map(cardToRow));
  if (error) toast('Bulk save failed: ' + error.message, true);
}

export async function dbDeleteCard(sku, toast) {
  const { error } = await supabaseClient.from('catalog').delete().eq('sku', sku);
  if (error) toast('Delete failed: ' + error.message, true);
}

export async function dbDeleteCards(skus, toast) {
  const list = Array.from(skus);
  if (!list.length) return;
  const { error } = await supabaseClient.from('catalog').delete().in('sku', list);
  if (error) toast('Delete failed: ' + error.message, true);
}

export async function dbClearCatalog(toast) {
  const { error } = await supabaseClient.from('catalog').delete().neq('sku', '__never__');
  if (error) toast('Clear failed: ' + error.message, true);
}

export async function dbInsertTicket(ticket, toast) {
  const { error } = await supabaseClient.from('sync_queue').insert(ticketToRow(ticket));
  if (error) toast('Sync ticket failed: ' + error.message, true);
}

export async function dbInsertTickets(tickets, toast) {
  if (!tickets.length) return;
  const { error } = await supabaseClient.from('sync_queue').insert(tickets.map(ticketToRow));
  if (error) toast('Sync tickets failed: ' + error.message, true);
}

// One row per Mark Sold event (see phase12_sales_history.sql) — written
// alongside the sync_queue ticket, not instead of it; the two tables track
// different things (in-flight cross-platform cleanup vs. a durable sales
// record) and have different lifetimes (a ticket gets deleted once every
// platform's synced; a sale row never does).
function saleToRow(s) {
  return {
    sku: s.sku, name: s.name, game: s.game, condition: s.condition,
    qty_sold: s.qtySold, sale_price: s.salePrice, cost: s.cost ?? null,
    sold_at: new Date(s.soldAt).toISOString(),
  };
}

export async function dbInsertSales(sales, toast) {
  if (!sales.length) return;
  const { error } = await supabaseClient.from('sales').insert(sales.map(saleToRow));
  if (error) toast('Sales record failed: ' + error.message, true);
}

// Corrects a past sale (a typo'd Name/Condition/Qty, a wrong Price/Cost, a
// misrecorded Sold date) from the Reports tab's own drill-down — the Edit
// Sale action. `sales` is deliberately described elsewhere in this app
// (phase12_sales_history.sql's own header comment) as "append-only, never
// updated or deleted"; that was about the app never silently rewriting a
// sale on its own (e.g. when the source catalog row later changes), not a
// hard rule against a staff member fixing a mistake they typed in by hand —
// the table's own RLS policy already grants `authenticated` full update
// access, so this needed no migration. Reuses `saleToRow` so an edit is
// mapped onto the same columns an insert already uses.
export async function dbUpdateSale(sale, toast) {
  const { error } = await supabaseClient.from('sales').update(saleToRow(sale)).eq('id', sale.id);
  if (error) toast('Failed to update sale: ' + error.message, true);
}

export function rowToSale(r) {
  return {
    id: r.id, sku: r.sku, name: r.name, game: r.game, condition: r.condition,
    qtySold: r.qty_sold, salePrice: r.sale_price, cost: r.cost,
    soldAt: r.sold_at ? new Date(r.sold_at).getTime() : Date.now(),
  };
}

// Deliberately NOT part of dbLoadAll's eager, always-on-sign-in load —
// unlike catalog/sync_queue/quotes/sorting_queue, `sales` only ever grows
// (every Mark Sold event adds a row, forever) with no natural cap the way
// an in-flight queue has, so pulling the whole table into memory on every
// app load doesn't scale the way it does for those. The Reports tab fetches
// just the date range it's actually showing, on demand. Still goes through
// fetchAllRows so a wide range (e.g. "this year") pages past 1000 rows
// correctly instead of silently truncating (see CLAUDE.md's "Known
// constraints" section on the original full-table-read bug this app
// already hit once).
export async function dbLoadSales(fromISO, toISO, toast) {
  const { data, error } = await fetchAllRows('sales', 'sold_at', {
    filter: (q) => q.gte('sold_at', fromISO).lt('sold_at', toISO),
  });
  if (error) { toast('Failed to load sales: ' + error.message, true); return []; }
  return (data || []).map(rowToSale);
}

const TICKET_STAMP_COLUMNS = { posDone: 'pos_done', tcgplayerDone: 'tcgplayer_done', collectrDone: 'collectr_done' };

export async function dbUpdateTicketStamp(id, field, value, toast) {
  const col = TICKET_STAMP_COLUMNS[field];
  const { error } = await supabaseClient.from('sync_queue').update({ [col]: value }).eq('id', id);
  if (error) toast('Update failed: ' + error.message, true);
}

const PLATFORM_STATUS_COLUMNS = { posSynced: 'pos_synced', tcgplayerSynced: 'tcgplayer_synced', collectrSynced: 'collectr_synced' };

export async function dbUpdatePlatformStatus(sku, field, value, toast) {
  const col = PLATFORM_STATUS_COLUMNS[field];
  const { error } = await supabaseClient.from('catalog').update({ [col]: value }).eq('sku', sku);
  if (error) toast('Update failed: ' + error.message, true);
}

export async function dbClearQueue(toast) {
  const { error } = await supabaseClient.from('sync_queue').delete().neq('id', '__never__');
  if (error) toast('Clear failed: ' + error.message, true);
}

// Condition-multiplier settings — a singleton row (id=1), created by the
// migration. Falls back to the app's own defaults if the row is somehow
// missing rather than failing the whole settings load.
export async function dbLoadSettings(toast) {
  const { data, error } = await supabaseClient.from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    toast('Failed to load settings: ' + error.message, true);
    return { ...DEFAULT_CONDITION_MULTIPLIERS };
  }
  if (!data) return { ...DEFAULT_CONDITION_MULTIPLIERS };
  return { LP: data.lp_pct, MP: data.mp_pct, HP: data.hp_pct, DMG: data.dmg_pct };
}

export async function dbSaveSettings(multipliers, toast) {
  const { error } = await supabaseClient.from('store_settings').update({
    lp_pct: multipliers.LP, mp_pct: multipliers.MP, hp_pct: multipliers.HP, dmg_pct: multipliers.DMG,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) toast('Failed to save settings: ' + error.message, true);
}

// Price-spike alerts — written by the daily price-check Edge Function, read
// and acknowledged here (see priceAlertUtils.js). Only unacknowledged alerts
// are loaded: a dismissed alert is kept in the table as history (never
// deleted), but nothing in the app shows it anymore.
export function rowToPriceAlert(r) {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name || '',
    game: r.game || '',
    previousPrice: r.previous_price != null ? Number(r.previous_price) : null,
    newPrice: r.new_price != null ? Number(r.new_price) : null,
    pctChange: r.pct_change != null ? Number(r.pct_change) : null,
    detectedAt: r.detected_at,
    acknowledged: !!r.acknowledged,
    // Which card the check compared against (phase15_price_alert_match.sql)
    // — null for an alert raised before those columns existed.
    match: r.matched_name
      ? {
        name: r.matched_name, set: r.matched_set || '', number: r.matched_number || '',
        image: r.matched_image || '', url: r.matched_url || '', basis: r.match_basis || '',
      }
      : null,
  };
}

export async function dbLoadPriceAlerts(toast) {
  const { data, error } = await fetchAllRows('price_alerts', 'detected_at', {
    ascending: false,
    filter: (q) => q.eq('acknowledged', false),
  });
  if (error) {
    toast('Failed to load price alerts: ' + error.message, true);
    return [];
  }
  return data.map(rowToPriceAlert);
}

export async function dbAcknowledgePriceAlerts(ids, toast) {
  if (!ids || !ids.length) return;
  const { error } = await supabaseClient.from('price_alerts').update({ acknowledged: true }).in('id', ids);
  if (error) toast('Failed to dismiss price alert: ' + error.message, true);
}

// price_tracking_settings — a singleton row (id=1), same pattern as
// store_settings/quote_settings. The daily price-check reads these same two
// columns, so a change here applies from its next run onward.
export async function dbLoadPriceTrackingSettings(toast) {
  const { data, error } = await supabaseClient.from('price_tracking_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    toast('Failed to load price-alert settings: ' + error.message, true);
    return { ...DEFAULT_PRICE_TRACKING };
  }
  if (!data) return { ...DEFAULT_PRICE_TRACKING };
  return { floorPrice: Number(data.floor_price), spikePct: Number(data.spike_pct) };
}

export async function dbSavePriceTrackingSettings(settings, toast) {
  const { error } = await supabaseClient.from('price_tracking_settings').update({
    floor_price: settings.floorPrice, spike_pct: settings.spikePct,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) toast('Failed to save price-alert settings: ' + error.message, true);
}

// Quote tab — one row is both a "collection" (in-progress) and, once
// offer_status is set, the finalized transaction record. items is a jsonb
// array, passed straight through untouched (supabase-js encodes/decodes
// jsonb columns transparently, same as any other column).
export function rowToQuote(r) {
  return {
    id: r.id,
    quoteNumber: r.quote_number,
    collectionName: r.collection_name,
    customerName: r.customer_name || '',
    customerId: r.customer_id || '',
    phone: r.phone || '',
    // Release Form intake fields (phase9_quote_intake_release.sql) —
    // hasExpectedPrice stays a real tri-state (null = not asked yet), not
    // coerced to false, since the paper form's Yes/No is genuinely unset
    // until staff actually asks the customer.
    customerEmail: r.customer_email || '',
    hasExpectedPrice: r.has_expected_price,
    expectedPriceAmount: r.expected_price_amount || '',
    intakeNotes: r.intake_notes || '',
    dateQuoted: r.date_quoted,
    employee: r.employee || '',
    timeTaken: r.time_taken || '',
    items: Array.isArray(r.items) ? r.items : [],
    offerStatus: r.offer_status || null,
    payoutAmount: r.payout_amount,
    paidOut: !!r.paid_out,
    // Guards against re-moving an already-accepted quote's items into
    // sorting_queue if it's saved again — the column is still named
    // converted_to_catalog in the DB (unchanged from before the Sorting
    // stage existed, to avoid an unnecessary migration on an already-run
    // one), but its real meaning today is "moved to Sorting", not "in
    // Catalog" — items land in sorting_queue at accept time now, not
    // Catalog directly. Renamed here at the JS boundary to match.
    movedToSorting: !!r.converted_to_catalog,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function quoteToRow(q) {
  // id/quote_number are DB-generated (gen_random_uuid()/bigserial) — only
  // included when already assigned (an existing quote being updated), same
  // "don't guess a server-generated value" discipline as everywhere else
  // in this file.
  const row = {
    collection_name: q.collectionName,
    customer_name: q.customerName || null,
    customer_id: q.customerId || null,
    phone: q.phone || null,
    customer_email: q.customerEmail || null,
    has_expected_price: q.hasExpectedPrice ?? null,
    expected_price_amount: q.expectedPriceAmount || null,
    intake_notes: q.intakeNotes || null,
    employee: q.employee || null,
    time_taken: q.timeTaken || null,
    items: q.items || [],
    offer_status: q.offerStatus || null,
    payout_amount: q.payoutAmount ?? null,
    paid_out: !!q.paidOut,
    converted_to_catalog: !!q.movedToSorting,
    updated_at: new Date().toISOString(),
  };
  if (q.id) row.id = q.id;
  if (q.dateQuoted) row.date_quoted = q.dateQuoted;
  return row;
}

export async function dbLoadQuotes(toast) {
  const { data, error } = await fetchAllRows('quotes', 'created_at', { ascending: false });
  if (error) {
    toast('Failed to load quotes: ' + error.message, true);
    return [];
  }
  return (data || []).map(rowToQuote);
}

// Returns the saved quote (via .select().single()) rather than void, since
// a brand-new quote needs its DB-generated id/quote_number back to keep
// working with it — every other dbUpsert* in this file writes a
// client-assigned key, so this is the one exception to the usual shape.
export async function dbUpsertQuote(quote, toast) {
  const { data, error } = await supabaseClient.from('quotes').upsert(quoteToRow(quote)).select().single();
  if (error) {
    toast('Save failed: ' + error.message, true);
    return null;
  }
  return rowToQuote(data);
}

export async function dbDeleteQuote(id, toast) {
  const { error } = await supabaseClient.from('quotes').delete().eq('id', id);
  if (error) toast('Delete failed: ' + error.message, true);
}

// Quote tier-percentage settings — same singleton-row pattern as
// dbLoadSettings/dbSaveSettings above, kept in its own quote_settings row
// rather than bolted onto store_settings (a different concern: quoting, not
// Catalog condition pricing).
export async function dbLoadQuoteSettings(toast) {
  const { data, error } = await supabaseClient.from('quote_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    toast('Failed to load quote settings: ' + error.message, true);
    return { ...DEFAULT_QUOTE_TIER_PCTS };
  }
  if (!data) return { ...DEFAULT_QUOTE_TIER_PCTS };
  return { tier1: data.tier1_pct, tier2: data.tier2_pct, tier3: data.tier3_pct };
}

export async function dbSaveQuoteSettings(tiers, toast) {
  const { error } = await supabaseClient.from('quote_settings').update({
    tier1_pct: tiers.tier1, tier2_pct: tiers.tier2, tier3_pct: tiers.tier3,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) toast('Failed to save quote settings: ' + error.message, true);
}

// Sorting stage — items land here the moment a quote is Accepted, before
// staff pick a final destination (a real binder/case, or Bulk). One row
// per quote line item (its own qty carries over as one unit of work);
// deleted once sorted — the resulting Catalog row (or the incremented
// Bulk row) is the durable record, not this table. See
// phase10_sorting_bulk.sql.
export function rowToSortingItem(r) {
  return {
    id: r.id,
    quoteId: r.quote_id,
    quoteCollectionName: r.quote_collection_name || '',
    name: r.name || '',
    game: r.game || '',
    set: r.set || '',
    number: r.number || '',
    rarity: r.rarity || '',
    printing: r.printing || '',
    condition: r.condition || '',
    price: r.price,
    basePrice: r.base_price,
    cost: r.cost,
    qty: r.qty || 1,
    notes: r.notes || '',
    imageUrl: r.image_data ? 'local' : (r.image_url || ''),
    imageData: r.image_data || '',
    photoUrl: r.photo_data ? 'local' : (r.photo_url || ''),
    photoData: r.photo_data || '',
    activeImage: r.active_image === 'stock' ? 'stock' : 'photo',
    sourceUrl: r.source_url || '',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}

function sortingItemToRow(s) {
  return {
    quote_id: s.quoteId || null,
    quote_collection_name: s.quoteCollectionName || '',
    name: s.name,
    game: s.game || null,
    set: s.set || null,
    number: s.number || null,
    rarity: s.rarity || null,
    printing: s.printing || null,
    condition: s.condition || null,
    price: s.price ?? null,
    base_price: s.basePrice ?? null,
    cost: s.cost ?? null,
    qty: s.qty || 1,
    notes: s.notes || null,
    image_url: (s.imageUrl && s.imageUrl.startsWith('http')) ? s.imageUrl : '',
    image_data: s.imageUrl === 'local' ? (s.imageData || '') : '',
    photo_url: (s.photoUrl && s.photoUrl.startsWith('http')) ? s.photoUrl : '',
    photo_data: s.photoUrl === 'local' ? (s.photoData || '') : '',
    active_image: s.activeImage === 'stock' ? 'stock' : 'photo',
    source_url: s.sourceUrl || '',
  };
}

export async function dbLoadSortingQueue(toast) {
  const { data, error } = await fetchAllRows('sorting_queue', 'created_at');
  if (error) {
    toast('Failed to load sorting queue: ' + error.message, true);
    return [];
  }
  return (data || []).map(rowToSortingItem);
}

// Returns the inserted rows (via .select()) so the caller gets their
// DB-generated ids back immediately — same reasoning as dbUpsertQuote's
// .select().single(), just for a batch insert instead of one row.
export async function dbInsertSortingItems(items, toast) {
  if (!items.length) return [];
  const { data, error } = await supabaseClient.from('sorting_queue').insert(items.map(sortingItemToRow)).select();
  if (error) {
    toast('Failed to move items to sorting: ' + error.message, true);
    return [];
  }
  return (data || []).map(rowToSortingItem);
}

export async function dbDeleteSortingItem(id, toast) {
  const { error } = await supabaseClient.from('sorting_queue').delete().eq('id', id);
  if (error) toast('Delete failed: ' + error.message, true);
}

// Public binder lookup (QR-code page) — reads from catalog_public_view, a
// restricted view exposing only browsing-relevant columns for unauthenticated
// access. No session/login involved; see supabase/migrations for the view
// definition and its anon grant.
export async function dbLoadPublicBinder(location) {
  // catalog_public_view has no primary key column exposed (see
  // phase10_sorting_bulk.sql's column list) — `name` isn't unique, but is
  // good enough for stable-in-practice pagination here, and a single
  // physical binder crossing 1000 distinct rows is a defensive case, not
  // the actual reported bug (see fetchAllRows above for the real story).
  const { data, error } = await fetchAllRows('catalog_public_view', 'name', {
    filter: (q) => q.eq('location', location),
  });
  if (error) throw error;
  return (data || []).map(r => ({
    name: r.name, set: r.set_name, game: r.game, condition: r.condition, printing: r.printing,
    itemType: r.item_type, grader: r.grader, grade: r.grade,
    qty: r.qty, price: r.price,
    imageUrl: r.image_data ? "local" : (r.image_url || ""),
    imageData: r.image_data || "",
    photoUrl: r.photo_data ? "local" : (r.photo_url || ""),
    photoData: r.photo_data || "",
    activeImage: r.active_image,
  }));
}
