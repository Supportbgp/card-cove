// Shared helpers for seeding src/test/harness/mockSupabaseClient.js before a
// page loads. Playwright's addInitScript runs before any page script, so the
// harness's getSession()/getDb() calls see this state from their very first
// invocation.

export async function seedHarness(page, { signedIn = true, seed, staff = true } = {}) {
  await page.addInitScript(
    ({ signedIn, seed, staff }) => {
      window.__HARNESS_SIGNED_IN__ = signedIn;
      window.__HARNESS_STAFF__ = staff;
      if (seed) window.__HARNESS_SEED__ = seed;
    },
    { signedIn, seed, staff }
  );
}

export function makeCardRow(overrides = {}) {
  return {
    sku: 'sku-1', name: 'Charizard', set_name: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
    qty: 3, price: 45, notes: '', image_url: '', image_data: '',
    item_type: 'single', grader: '', grade: '', cert_number: '', sold: false, source_url: '', location: 'Binder A',
    last_updated: '2026-01-01T00:00:00.000Z', pos_synced: true, tcgplayer_synced: false, collectr_synced: false,
    pos_channel: true, tcgplayer_channel: true, collectr_channel: true, base_price: null,
    photo_url: '', photo_data: '', active_image: 'photo',
    ...overrides,
  };
}

export function catalogSeed(rows) {
  return {
    catalog: rows,
    sync_queue: [],
    store_settings: [{ id: 1, lp_pct: 85, mp_pct: 65, hp_pct: 45, dmg_pct: 25 }],
    catalog_public_view: [],
    quotes: [],
    quote_settings: [{ id: 1, tier1_pct: 50, tier2_pct: 60, tier3_pct: 70 }],
    sorting_queue: [],
    sales: [],
    price_alerts: [],
    price_tracking_settings: [{ id: 1, floor_price: 25, spike_pct: 20 }],
  };
}
