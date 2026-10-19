import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabase.js calls createClient() at module load time, which we don't want
// touching a real (or even fake) network in a unit test — replace the whole
// module with a chainable mock that mirrors supabase-js's query builder
// closely enough for db.js's own call patterns (every chain method returns
// the same thenable object, which resolves to whatever result this test
// configured for that table).
const tableResults = {};
function makeQueryBuilder(table) {
  const builder = {
    select: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    single: vi.fn(() => builder),
    // A table's configured result can be a single fixed {data,error} object
    // (returned on every call — the original, simpler shape every existing
    // test here uses) or an ARRAY of them, consumed one per call in order —
    // needed to simulate fetchAllRows' multi-page loop in db.js, where each
    // page requires a genuinely different response than the last.
    then: (resolve, reject) => {
      const result = tableResults[table];
      const payload = Array.isArray(result) ? (result.shift() ?? { data: null, error: null }) : (result ?? { data: null, error: null });
      return Promise.resolve(payload).then(resolve, reject);
    },
  };
  return builder;
}
const fromMock = vi.fn((table) => makeQueryBuilder(table));
vi.mock('./supabase.js', () => ({
  supabaseClient: { from: (...args) => fromMock(...args) },
}));

const {
  rowToCard, rowToTicket, dbUpsertCard, dbInsertTicket,
  dbLoadSettings, dbLoadPublicBinder, dbLoadAll,
  rowToSortingItem, dbInsertSortingItems,
  dbInsertSales, rowToSale, dbLoadSales, dbUpdateSale,
  dbDeleteTickets, dbDeleteSaleForTicket,
  rowToPriceAlert, dbLoadPriceAlerts, dbAcknowledgePriceAlerts,
  dbLoadPriceTrackingSettings, dbSavePriceTrackingSettings,
} = await import('./db.js');

beforeEach(() => {
  fromMock.mockClear();
  for (const key of Object.keys(tableResults)) delete tableResults[key];
});

describe('rowToCard', () => {
  it('maps snake_case DB columns to the camelCase card shape', () => {
    const row = {
      sku: 'sku-1', name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM',
      printing: 'Holo', rarity: 'Special Illustration Rare', qty: 3, price: 45, notes: '',
      image_url: 'https://example.com/a.jpg', image_data: '',
      item_type: 'single', grader: '', grade: '', cert_number: '', sold: false, source_url: '', location: 'Binder A',
      last_updated: '2026-01-01T00:00:00.000Z', pos_synced: true, tcgplayer_synced: false, collectr_synced: false,
      pos_channel: true, tcgplayer_channel: true, collectr_channel: true, base_price: 50,
      photo_url: '', photo_data: '', active_image: 'stock',
    };
    const card = rowToCard(row);
    expect(card.sku).toBe('sku-1');
    expect(card.set).toBe('Base Set');
    expect(card.rarity).toBe('Special Illustration Rare');
    expect(card.imageUrl).toBe('https://example.com/a.jpg');
    expect(card.basePrice).toBe(50);
    expect(card.activeImage).toBe('stock');
    expect(card.lastUpdated).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('maps a data-backed image to the "local" convention', () => {
    const row = { sku: 's', name: 'n', image_url: 'https://ignored.example.com', image_data: 'data:image/jpeg;base64,abc' };
    const card = rowToCard(row);
    expect(card.imageUrl).toBe('local');
    expect(card.imageData).toBe('data:image/jpeg;base64,abc');
  });
});

describe('rowToTicket', () => {
  it('maps snake_case ticket columns to the camelCase ticket shape', () => {
    const row = {
      id: 't1', sku: 'sku-1', name: 'Charizard', set_name: 'Base Set', condition: 'NM', printing: 'Holo',
      price: 45, qty_sold: 1, ts: '2026-01-01T00:00:00.000Z',
      pos_done: true, tcgplayer_done: false, collectr_done: false,
      pos_channel: true, tcgplayer_channel: true, collectr_channel: false,
    };
    const ticket = rowToTicket(row);
    expect(ticket).toMatchObject({
      id: 't1', sku: 'sku-1', set: 'Base Set', qtySold: 1,
      posDone: true, tcgplayerDone: false, collectrDone: false,
      posChannel: true, tcgplayerChannel: true, collectrChannel: false,
    });
    expect(ticket.timestamp).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });
});

describe('dbUpsertCard (cardToRow via the real call)', () => {
  it('sends the correctly-shaped row to catalog.upsert, including the local-image convention', async () => {
    tableResults.catalog = { data: null, error: null };
    const card = {
      sku: 'sku-1', name: 'Charizard', set: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
      rarity: 'Special Illustration Rare',
      qty: 3, price: 45, notes: '', imageUrl: 'local', imageData: 'data:image/jpeg;base64,abc',
      itemType: 'single', grader: '', grade: '', certNumber: '', sold: false, sourceUrl: '', location: 'Binder A',
      lastUpdated: Date.parse('2026-01-01T00:00:00.000Z'),
      posSynced: true, tcgplayerSynced: false, collectrSynced: false,
      posChannel: true, tcgplayerChannel: true, collectrChannel: true, basePrice: 50,
      photoUrl: '', photoData: '', activeImage: 'photo',
    };
    const toast = vi.fn();
    await dbUpsertCard(card, toast);

    const builder = fromMock.mock.results[0].value;
    expect(fromMock).toHaveBeenCalledWith('catalog');
    expect(builder.upsert).toHaveBeenCalledTimes(1);
    const sentRow = builder.upsert.mock.calls[0][0];
    expect(sentRow.image_url).toBe(''); // 'local' never writes a URL
    expect(sentRow.image_data).toBe('data:image/jpeg;base64,abc');
    expect(sentRow.base_price).toBe(50);
    expect(sentRow.active_image).toBe('photo');
    expect(sentRow.rarity).toBe('Special Illustration Rare');
    expect(toast).not.toHaveBeenCalled();
  });

  it('reports a save error to the toast instead of throwing', async () => {
    tableResults.catalog = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    await dbUpsertCard({ sku: 's', name: 'n', lastUpdated: Date.now() }, toast);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });
});

describe('dbInsertTicket (ticketToRow via the real call)', () => {
  it('sends the correctly-shaped row to sync_queue.insert', async () => {
    tableResults.sync_queue = { data: null, error: null };
    const ticket = {
      id: 't1', sku: 'sku-1', name: 'Charizard', set: 'Base Set', condition: 'NM', printing: 'Holo',
      price: 45, qtySold: 1, timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
      posDone: true, tcgplayerDone: false, collectrDone: false,
      posChannel: true, tcgplayerChannel: false, collectrChannel: true,
    };
    await dbInsertTicket(ticket, vi.fn());
    const builder = fromMock.mock.results[0].value;
    const sentRow = builder.insert.mock.calls[0][0];
    expect(sentRow.set_name).toBe('Base Set');
    expect(sentRow.qty_sold).toBe(1);
    expect(sentRow.tcgplayer_channel).toBe(false);
  });
});

describe('dbInsertSales (saleToRow via the real call)', () => {
  it('sends the correctly-shaped row to sales.insert (phase12_sales_history.sql)', async () => {
    tableResults.sales = { data: null, error: null };
    const sale = {
      sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM',
      qtySold: 2, salePrice: 45, soldAt: Date.parse('2026-01-01T00:00:00.000Z'),
    };
    await dbInsertSales([sale], vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(fromMock).toHaveBeenCalledWith('sales');
    const sentRows = builder.insert.mock.calls[0][0];
    expect(sentRows[0]).toMatchObject({
      sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM',
      qty_sold: 2, sale_price: 45,
    });
    expect(sentRows[0].sold_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is a no-op for an empty array — no insert call at all', async () => {
    await dbInsertSales([], vi.fn());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('reports an insert error to the toast instead of throwing', async () => {
    tableResults.sales = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    await dbInsertSales([{ sku: 's', name: 'n', soldAt: Date.now() }], toast);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });
});

describe('undo a sale: dbDeleteTickets / dbDeleteSaleForTicket', () => {
  it('deletes tickets by id', async () => {
    tableResults.sync_queue = { data: null, error: null };
    await dbDeleteTickets(['t1', 't2'], vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(fromMock).toHaveBeenCalledWith('sync_queue');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.in).toHaveBeenCalledWith('id', ['t1', 't2']);
  });

  it('is a no-op for no tickets', async () => {
    await dbDeleteTickets([], vi.fn());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("finds the ticket's sales row by sku + the shared sale timestamp, and returns how many it removed", async () => {
    tableResults.sales = { data: [{ id: 's1' }], error: null };
    const removed = await dbDeleteSaleForTicket({ sku: 'sku-1', timestamp: Date.parse('2026-10-18T15:30:00.000Z') }, vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(fromMock).toHaveBeenCalledWith('sales');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('sku', 'sku-1');
    expect(builder.eq).toHaveBeenCalledWith('sold_at', '2026-10-18T15:30:00.000Z');
    expect(removed).toBe(1);
  });

  it('returns 0 and toasts on error', async () => {
    tableResults.sales = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    const removed = await dbDeleteSaleForTicket({ sku: 's', timestamp: Date.now() }, toast);
    expect(removed).toBe(0);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });
});

describe('dbUpdateSale', () => {
  it('sends the corrected row to sales.update, matched by id (Reports tab Edit Sale)', async () => {
    tableResults.sales = { data: null, error: null };
    const sale = {
      id: 's1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'LP',
      qtySold: 1, salePrice: 50, cost: 20, soldAt: Date.parse('2026-01-02T00:00:00.000Z'),
    };
    await dbUpdateSale(sale, vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(fromMock).toHaveBeenCalledWith('sales');
    const sentRow = builder.update.mock.calls[0][0];
    expect(sentRow).toMatchObject({
      sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'LP',
      qty_sold: 1, sale_price: 50, cost: 20,
    });
    expect(sentRow.sold_at).toBe('2026-01-02T00:00:00.000Z');
    expect(builder.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('reports an update error to the toast instead of throwing', async () => {
    tableResults.sales = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    await dbUpdateSale({ id: 's1', sku: 's', name: 'n', soldAt: Date.now() }, toast);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });
});

describe('rowToSale', () => {
  it('maps snake_case sale columns to the camelCase shape', () => {
    const row = {
      id: 's1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM',
      qty_sold: 2, sale_price: 45, sold_at: '2026-01-01T00:00:00.000Z',
    };
    expect(rowToSale(row)).toMatchObject({
      id: 's1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM',
      qtySold: 2, salePrice: 45,
    });
    expect(rowToSale(row).soldAt).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });
});

describe('dbLoadSales', () => {
  it('filters by the given [from, to) range via gte/lt on sold_at', async () => {
    tableResults.sales = { data: [], error: null };
    await dbLoadSales('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(builder.gte).toHaveBeenCalledWith('sold_at', '2026-01-01T00:00:00.000Z');
    expect(builder.lt).toHaveBeenCalledWith('sold_at', '2026-02-01T00:00:00.000Z');
  });

  it('maps returned rows through rowToSale', async () => {
    tableResults.sales = {
      data: [{ id: 's1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon', condition: 'NM', qty_sold: 1, sale_price: 10, sold_at: '2026-01-05T00:00:00.000Z' }],
      error: null,
    };
    const sales = await dbLoadSales('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', vi.fn());
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ sku: 'sku-1', qtySold: 1, salePrice: 10 });
  });

  it('pages past 1000 rows the same way dbLoadAll does', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, sku: `sku-${i}`, name: 'n', game: 'Pokemon', condition: 'NM', qty_sold: 1, sale_price: 1, sold_at: '2026-01-01T00:00:00.000Z' }));
    const page2 = [{ id: 's1000', sku: 'sku-1000', name: 'n', game: 'Pokemon', condition: 'NM', qty_sold: 1, sale_price: 1, sold_at: '2026-01-01T00:00:00.000Z' }];
    tableResults.sales = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];
    const sales = await dbLoadSales('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', vi.fn());
    expect(sales).toHaveLength(1001);
  });

  it('reports a load error to the toast and returns an empty array rather than throwing', async () => {
    tableResults.sales = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    const sales = await dbLoadSales('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', toast);
    expect(sales).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });
});

describe('sourceUrl on sorting_queue rows (sortingItemToRow/rowToSortingItem via the real call)', () => {
  it('sends source_url on insert (phase11_quote_source_url.sql) so a quote item\'s Source link survives the trip through Sorting', async () => {
    tableResults.sorting_queue = { data: [], error: null };
    const item = { name: 'Charizard', qty: 1, sourceUrl: 'https://tcg/real-listing' };
    await dbInsertSortingItems([item], vi.fn());
    const builder = fromMock.mock.results[0].value;
    const sentRows = builder.insert.mock.calls[0][0];
    expect(sentRows[0].source_url).toBe('https://tcg/real-listing');
  });

  it('maps a blank source_url column back to an empty string, not null/undefined', () => {
    const row = { id: 's1', name: 'Charizard', source_url: '' };
    expect(rowToSortingItem(row).sourceUrl).toBe('');
  });

  it('round-trips a real source_url column back into sourceUrl', () => {
    const row = { id: 's1', name: 'Charizard', source_url: 'https://tcg/real-listing' };
    expect(rowToSortingItem(row).sourceUrl).toBe('https://tcg/real-listing');
  });
});

describe('dbLoadSettings', () => {
  it('returns the mapped multiplier row when one exists', async () => {
    tableResults.store_settings = { data: { lp_pct: 80, mp_pct: 60, hp_pct: 40, dmg_pct: 20 }, error: null };
    const result = await dbLoadSettings(vi.fn());
    expect(result).toEqual({ LP: 80, MP: 60, HP: 40, DMG: 20 });
  });
  it('falls back to defaults when the row is missing', async () => {
    tableResults.store_settings = { data: null, error: null };
    const result = await dbLoadSettings(vi.fn());
    expect(result).toEqual({ NM: 100, LP: 85, MP: 65, HP: 45, DMG: 25 });
  });
  it('falls back to defaults and toasts on a load error, without throwing', async () => {
    tableResults.store_settings = { data: null, error: { message: 'down' } };
    const toast = vi.fn();
    const result = await dbLoadSettings(toast);
    expect(result).toEqual({ NM: 100, LP: 85, MP: 65, HP: 45, DMG: 25 });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('down'), true);
  });
});

describe('dbLoadPublicBinder', () => {
  it('maps public-view rows the same way rowToCard does for images', async () => {
    tableResults.catalog_public_view = {
      data: [
        { name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
          item_type: 'single', grader: '', grade: '', qty: 3, price: 45,
          image_url: 'https://example.com/a.jpg', image_data: '',
          photo_url: '', photo_data: 'data:image/jpeg;base64,abc', active_image: 'photo' },
      ],
      error: null,
    };
    const items = await dbLoadPublicBinder('Binder A');
    expect(items).toHaveLength(1);
    expect(items[0].imageUrl).toBe('https://example.com/a.jpg');
    expect(items[0].photoUrl).toBe('local');
    expect(items[0].photoData).toBe('data:image/jpeg;base64,abc');
  });

  it('throws on a load error rather than silently returning nothing', async () => {
    tableResults.catalog_public_view = { data: null, error: { message: 'nope' } };
    await expect(dbLoadPublicBinder('Binder A')).rejects.toBeTruthy();
  });
});

function makeCatalogRow(sku) {
  return {
    sku, name: `Card ${sku}`, set_name: '', game: 'Pokemon', condition: '', printing: '',
    rarity: '', qty: 1, price: null, notes: '', image_url: '', image_data: '',
    item_type: 'single', grader: '', grade: '', cert_number: '', sold: false, source_url: '', location: '',
    last_updated: null, pos_synced: false, tcgplayer_synced: false, collectr_synced: false,
    pos_channel: true, tcgplayer_channel: true, collectr_channel: true, base_price: null,
    photo_url: '', photo_data: '', active_image: 'photo',
  };
}

describe('dbLoadAll (fetchAllRows pagination)', () => {
  // Real regression coverage for a real production bug: Supabase/PostgREST
  // caps a bare .select() at the project's configured Max Rows (1000 by
  // default) with no error — a catalog crossing that size looked like
  // deletions were being silently undone (the visible count stayed pinned
  // at 1000) and like unrelated items were "reappearing" (no ORDER BY
  // meant a different arbitrary 1000-row slice could come back on any
  // given load). fetchAllRows in db.js pages through with .range() until
  // a page comes back short of a full page — this simulates a table with
  // just over 1000 real rows (a full 1000-row first page, plus one more on
  // a second page) and asserts every row makes it into the final result,
  // not just the first 1000.
  it('pages past a 1000-row response instead of silently truncating there', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => makeCatalogRow(`sku-${i}`));
    const page2 = [makeCatalogRow('sku-1000')];
    tableResults.catalog = [
      { data: page1, error: null },
      { data: page2, error: null },
    ];
    tableResults.sync_queue = { data: [], error: null };

    const { catalog } = await dbLoadAll(vi.fn());
    expect(catalog).toHaveLength(1001);
    expect(catalog.map(c => c.sku)).toContain('sku-1000');
  });

  it('stops after one page when the table has fewer rows than the page size', async () => {
    tableResults.catalog = { data: [makeCatalogRow('sku-1')], error: null };
    tableResults.sync_queue = { data: [], error: null };

    const { catalog } = await dbLoadAll(vi.fn());
    expect(catalog).toHaveLength(1);
  });

  it('stops paging and surfaces the toast on an error mid-fetch', async () => {
    tableResults.catalog = { data: null, error: { message: 'connection reset' } };
    tableResults.sync_queue = { data: [], error: null };
    const toast = vi.fn();

    const { catalog } = await dbLoadAll(toast);
    expect(catalog).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('connection reset'), true);
  });
});

describe('price alerts', () => {
  const alertRow = {
    id: 'a1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon',
    previous_price: '250', new_price: '417.78', pct_change: '67.1',
    detected_at: '2026-10-14T13:07:00.000Z', acknowledged: false,
  };

  it('maps a price_alerts row to the camelCase shape, with numeric prices', () => {
    expect(rowToPriceAlert(alertRow)).toEqual({
      id: 'a1', sku: 'sku-1', name: 'Charizard', game: 'Pokemon',
      previousPrice: 250, newPrice: 417.78, pctChange: 67.1,
      detectedAt: '2026-10-14T13:07:00.000Z', acknowledged: false,
      condition: null, marketNmPrice: null, // raised before condition-aware checking
      match: null, // raised before matched-card recording existed
    });
  });

  it('maps the condition tier and the raw NM price behind a condition-adjusted alert', () => {
    const a = rowToPriceAlert({ ...alertRow, condition: 'DMG', market_nm_price: '223.38', new_price: '55.85' });
    expect(a).toMatchObject({ condition: 'DMG', marketNmPrice: 223.38, newPrice: 55.85 });
  });

  it('maps the matched card the price check compared against', () => {
    const a = rowToPriceAlert({
      ...alertRow, matched_name: 'Mew', matched_set: 'Southern Islands', matched_number: '1',
      matched_image: 'https://img/mew', matched_url: 'https://www.tcgplayer.com/product/46466', match_basis: 'set',
    });
    expect(a.match).toEqual({
      name: 'Mew', set: 'Southern Islands', number: '1',
      image: 'https://img/mew', url: 'https://www.tcgplayer.com/product/46466', basis: 'set',
    });
  });

  it('loads only unacknowledged alerts, newest first', async () => {
    tableResults.price_alerts = { data: [alertRow], error: null };
    const alerts = await dbLoadPriceAlerts(vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith('acknowledged', false);
    expect(builder.order).toHaveBeenCalledWith('detected_at', { ascending: false });
    expect(alerts.map(a => a.id)).toEqual(['a1']);
  });

  it('returns [] and toasts on a load error', async () => {
    tableResults.price_alerts = { data: null, error: { message: 'boom' } };
    const toast = vi.fn();
    expect(await dbLoadPriceAlerts(toast)).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
  });

  it('acknowledges alerts by id — never deletes them', async () => {
    tableResults.price_alerts = { data: null, error: null };
    await dbAcknowledgePriceAlerts(['a1', 'a2'], vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ acknowledged: true });
    expect(builder.in).toHaveBeenCalledWith('id', ['a1', 'a2']);
    expect(builder.delete).not.toHaveBeenCalled();
  });

  it('does nothing for an empty id list', async () => {
    await dbAcknowledgePriceAlerts([], vi.fn());
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('price tracking settings', () => {
  it('loads floor/spike from the singleton row', async () => {
    tableResults.price_tracking_settings = { data: { id: 1, floor_price: '40', spike_pct: '15' }, error: null };
    expect(await dbLoadPriceTrackingSettings(vi.fn())).toEqual({ floorPrice: 40, spikePct: 15 });
  });

  it('falls back to the $25 / 20% defaults when the row is missing', async () => {
    tableResults.price_tracking_settings = { data: null, error: null };
    expect(await dbLoadPriceTrackingSettings(vi.fn())).toEqual({ floorPrice: 25, spikePct: 20 });
  });

  it('saves both thresholds to row id 1', async () => {
    tableResults.price_tracking_settings = { data: null, error: null };
    await dbSavePriceTrackingSettings({ floorPrice: 30, spikePct: 25 }, vi.fn());
    const builder = fromMock.mock.results[0].value;
    expect(builder.update.mock.calls[0][0]).toMatchObject({ floor_price: 30, spike_pct: 25 });
    expect(builder.eq).toHaveBeenCalledWith('id', 1);
  });
});
