// Stands in for src/lib/supabase.js during the Playwright E2E suite only —
// swapped in by vite.config.js's alias, active exclusively under
// `vite --mode harness` (which only playwright.config.js's webServer ever
// invokes). The real app (main.jsx/App.jsx/BinderView.jsx/Login.jsx) runs
// completely unmodified against this; nothing here is imported by production
// code, so it can't ship. See CLAUDE.md's testing section.
//
// State lives on `window.__HARNESS_DB__` / `window.__HARNESS_SIGNED_IN__` so
// a Playwright spec can seed/inspect it via `page.addInitScript` before
// navigation, or `page.evaluate` afterward, without needing a bundler-level
// per-test config.

const PRIMARY_KEY = {
  catalog: 'sku',
  sync_queue: 'id',
  store_settings: 'id',
  catalog_public_view: 'sku',
  quotes: 'id',
  quote_settings: 'id',
  sorting_queue: 'id',
  sales: 'id',
  price_alerts: 'id',
  price_tracking_settings: 'id',
  inventory_losses: 'id',
  public_binders: 'location',
  public_binder_list: 'location',
  bounties: 'id',
  public_bounties: 'id',
};

function defaultSeed() {
  return {
    catalog: [],
    sync_queue: [],
    store_settings: [{ id: 1, lp_pct: 85, mp_pct: 65, hp_pct: 45, dmg_pct: 25 }],
    catalog_public_view: [],
    quotes: [],
    quote_settings: [{ id: 1, tier1_pct: 50, tier2_pct: 60, tier3_pct: 70 }],
    sorting_queue: [],
    sales: [],
    price_alerts: [],
    price_tracking_settings: [{ id: 1, floor_price: 25, spike_pct: 20 }],
    inventory_losses: [],
    public_binders: [],
    public_binder_list: [],
    bounties: [],
  };
}

function getDb() {
  if (!window.__HARNESS_DB__) {
    window.__HARNESS_DB__ = window.__HARNESS_SEED__
      ? JSON.parse(JSON.stringify(window.__HARNESS_SEED__))
      : defaultSeed();
  }
  return window.__HARNESS_DB__;
}

function matchesFilters(row, filters) {
  return filters.every(([type, field, value]) => {
    if (type === 'eq') return row[field] === value;
    if (type === 'neq') return row[field] !== value;
    if (type === 'in') return value.includes(row[field]);
    // String comparison is enough here — every real caller compares ISO
    // timestamp strings (see db.js's dbLoadSales), which sort correctly as
    // plain strings the same way Postgres compares them as timestamps.
    if (type === 'gte') return row[field] >= value;
    if (type === 'lt') return row[field] < value;
    return true;
  });
}

let harnessQuoteNumberCounter = 0;

// public_bounties is a view in the real database (phase20_bounties.sql):
// open, unexpired bounties without who asked. Derived from `bounties` here
// the same way, so a bounty posted in a test shows up in it.
function publicBounties(db) {
  const now = new Date().toISOString();
  return (db.bounties || [])
    .filter((b) => b.status === 'open' && b.expires_at > now)
    .map(({ id, game, name, set_name, number, rarity, printing, condition, image_url, max_price, created_at, expires_at }) =>
      ({ id, game, name, set_name, number, rarity, printing, condition, image_url, max_price, created_at, expires_at }));
}

function execute(table, op, filters, single, order, range) {
  const db = getDb();
  const key = PRIMARY_KEY[table];
  const rows = table === 'public_bounties' ? publicBounties(db) : (db[table] || (db[table] = []));

  if (op.type === 'select') {
    let matched = rows.filter((r) => matchesFilters(r, filters));
    if (order) {
      matched = matched.slice().sort((a, b) => {
        const av = a[order.field], bv = b[order.field];
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (order.ascending ? 1 : -1);
      });
    }
    // Mirrors real Supabase's .range(from, to) — inclusive of both bounds,
    // applied after filtering/sorting. db.js's fetchAllRows (see its
    // comment there) depends on this to page through a table larger than
    // one fetch's page size, same as it must against real Supabase.
    if (range) matched = matched.slice(range.from, range.to + 1);
    return { data: single ? matched[0] ?? null : matched, error: null };
  }
  if (op.type === 'upsert' || op.type === 'insert') {
    const payload = Array.isArray(op.payload) ? op.payload : [op.payload];
    const affected = [];
    for (const item of payload) {
      // Fake the DB-generated primary key (and, for `quotes`, the
      // auto-incrementing quote_number) a real insert-with-no-id would
      // produce in Postgres — dbUpsertQuote's .upsert(...).select().single()
      // round-trip depends on getting a real key/number back the same way
      // it would against real Supabase.
      let row = item;
      if (key && row[key] == null) {
        row = { ...row, [key]: `harness-${table}-${rows.length}-${Math.random().toString(36).slice(2, 8)}` };
      }
      const idx = rows.findIndex((r) => r[key] === row[key]);
      if (idx === -1) {
        if (table === 'quotes' && row.quote_number == null) {
          row = { ...row, quote_number: ++harnessQuoteNumberCounter };
        }
        rows.push(row);
      } else {
        // Like Postgres's upsert, an update only changes the columns sent;
        // the rest (e.g. quote_number, which the app never sends) is kept.
        row = { ...rows[idx], ...row };
        rows[idx] = row;
      }
      affected.push(row);
    }
    if (op.returning) return { data: single ? affected[0] ?? null : affected, error: null };
    return { data: null, error: null };
  }
  if (op.type === 'update') {
    const affected = [];
    for (const r of rows) {
      if (matchesFilters(r, filters)) { Object.assign(r, op.payload); affected.push(r); }
    }
    if (op.returning) return { data: single ? affected[0] ?? null : affected, error: null };
    return { data: null, error: null };
  }
  if (op.type === 'delete') {
    const removed = rows.filter((r) => matchesFilters(r, filters));
    db[table] = rows.filter((r) => !matchesFilters(r, filters));
    if (op.returning) return { data: single ? removed[0] ?? null : removed, error: null };
    return { data: null, error: null };
  }
  return { data: null, error: null };
}

function makeBuilder(table) {
  const filters = [];
  let op = { type: 'select' };
  let single = false;
  let order = null;
  let range = null;
  const builder = {
    select() {
      // Real supabase-js: .select() after a mutation means "return the
      // affected row(s)"; a bare .select() with no prior mutation is just a
      // normal read. Only the former should touch `op`.
      if (op.type !== 'select') op = { ...op, returning: true };
      return builder;
    },
    upsert(payload) { op = { type: 'upsert', payload }; return builder; },
    insert(payload) { op = { type: 'insert', payload }; return builder; },
    update(payload) { op = { type: 'update', payload }; return builder; },
    delete() { op = { type: 'delete' }; return builder; },
    eq(field, value) { filters.push(['eq', field, value]); return builder; },
    neq(field, value) { filters.push(['neq', field, value]); return builder; },
    in(field, values) { filters.push(['in', field, values]); return builder; },
    gte(field, value) { filters.push(['gte', field, value]); return builder; },
    lt(field, value) { filters.push(['lt', field, value]); return builder; },
    order(field, opts) { order = { field, ascending: !(opts && opts.ascending === false) }; return builder; },
    range(from, to) { range = { from, to }; return builder; },
    limit(n) { range = { from: 0, to: n - 1 }; return builder; },
    maybeSingle() { single = true; return builder; },
    single() { single = true; return builder; },
    then(resolve, reject) {
      return Promise.resolve().then(() => execute(table, op, filters, single, order, range)).then(resolve, reject);
    },
  };
  return builder;
}

function makeChannel() {
  const channel = {
    on() { return channel; },
    subscribe() { return channel; },
  };
  return channel;
}

// Matches Login.jsx's shared-password flow closely enough to exercise it for
// real in the Login E2E spec, without touching Supabase Auth. Exported so
// e2e/login.spec.js doesn't need to duplicate the literal.
export const HARNESS_PASSWORD = 'harness-test-password';

// The harness login is staff unless a test sets window.__HARNESS_STAFF__ =
// false (to show the "No staff access" screen), mirroring the real
// app_metadata.staff flag (CLAUDE.md "Staff-only access").
function harnessSession() {
  return { user: { id: 'harness-user', app_metadata: { staff: window.__HARNESS_STAFF__ !== false } } };
}

// Stands in for the bounties Edge Function (CLAUDE.md "Bounties"): the same
// rules, applied to the in-memory `bounties` table, as the current harness
// login. Calls are recorded in window.__HARNESS_BOUNTY_CALLS__ and what
// would have been posted to Discord in window.__HARNESS_BOUNTY_POSTS__.
function bountyError(message) {
  return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: message }) } } };
}

async function harnessBounties(body) {
  window.__HARNESS_BOUNTY_CALLS__ = (window.__HARNESS_BOUNTY_CALLS__ || []).concat([body]);
  const posts = () => (window.__HARNESS_BOUNTY_POSTS__ = window.__HARNESS_BOUNTY_POSTS__ || []);
  const { data } = await supabaseClient.auth.getSession();
  const user = data.session && data.session.user;
  if (!user) return bountyError('Sign in first');
  const meta = user.app_metadata || {};
  const db = getDb();
  const list = db.bounties || (db.bounties = []);
  const now = new Date();
  const openCount = (excludeId) => list.filter((b) => b.user_id === user.id && b.status === 'open'
    && b.expires_at > now.toISOString() && b.id !== excludeId).length;
  const in60Days = () => new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

  if (body.action === 'create') {
    if (meta.member !== true) return bountyError('Only BGP Discord members can post bounties');
    const b = body.bounty || {};
    if (!b.game) return bountyError('Pick a game');
    if (!String(b.name || '').trim()) return bountyError("Enter the card's name");
    if (openCount(null) >= 10) return bountyError('You already have 10 open bounties. Cancel one to post another.');
    const row = {
      id: `harness-bounty-${list.length}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.id, discord_id: String(meta.discord_id || ''), discord_name: String(meta.discord_name || ''),
      game: b.game, name: String(b.name).trim(), set_name: b.set || '', number: b.number || '', rarity: b.rarity || '',
      printing: b.printing || '', condition: b.condition || '', image_url: b.imageUrl || '',
      max_price: b.maxPrice === '' || b.maxPrice == null ? null : Number(b.maxPrice), notes: b.notes || '',
      status: 'open', created_at: now.toISOString(), expires_at: in60Days(), closed_at: null,
    };
    list.push(row);
    posts().push({ kind: 'created', bounty: row });
    return { data: { bounty: row, posted: true }, error: null };
  }
  const bounty = list.find((b) => b.id === body.id);
  if (!bounty) return bountyError("That bounty doesn't exist");
  if (bounty.status !== 'open') return bountyError('That bounty is already closed');
  const isOwner = bounty.user_id === user.id;
  if (body.action === 'cancel') {
    if (!isOwner && meta.staff !== true) return bountyError('Not your bounty');
    Object.assign(bounty, { status: 'cancelled', closed_at: now.toISOString() });
  } else if (body.action === 'renew') {
    if (!isOwner) return bountyError('Not your bounty');
    if (openCount(bounty.id) >= 10) return bountyError('You already have 10 open bounties. Cancel one to renew this one.');
    Object.assign(bounty, { expires_at: in60Days() });
  } else if (body.action === 'fulfill' || body.action === 'remove') {
    if (meta.staff !== true) return bountyError('Staff only');
    Object.assign(bounty, { status: body.action === 'fulfill' ? 'fulfilled' : 'removed', closed_at: now.toISOString() });
    if (body.action === 'fulfill') posts().push({ kind: 'fulfilled', bounty: { ...bounty } });
  } else {
    return bountyError(`Unknown action: ${body.action}`);
  }
  return { data: { bounty: { ...bounty }, posted: body.action === 'fulfill' }, error: null };
}

export const supabaseClient = {
  auth: {
    // A test can stand in a whole session (e.g. a Discord member's, with a
    // provider_token) via window.__HARNESS_SESSION__, and what the next
    // refresh returns via window.__HARNESS_REFRESHED_SESSION__.
    async getSession() {
      if (window.__HARNESS_SESSION__ !== undefined) return { data: { session: window.__HARNESS_SESSION__ } };
      const signedIn = window.__HARNESS_SIGNED_IN__ !== false;
      return { data: { session: signedIn ? harnessSession() : null } };
    },
    async refreshSession() {
      if (window.__HARNESS_REFRESHED_SESSION__ !== undefined) {
        window.__HARNESS_SESSION__ = window.__HARNESS_REFRESHED_SESSION__;
        return { data: { session: window.__HARNESS_SESSION__ }, error: null };
      }
      if (window.__HARNESS_SESSION__ !== undefined) return { data: { session: window.__HARNESS_SESSION__ }, error: null };
      const signedIn = window.__HARNESS_SIGNED_IN__ !== false;
      return { data: { session: signedIn ? harnessSession() : null }, error: null };
    },
    // Records the request instead of leaving the page.
    async signInWithOAuth(args) {
      window.__HARNESS_OAUTH__ = args;
      return { data: {}, error: null };
    },
    async signInWithPassword({ password }) {
      if (password === HARNESS_PASSWORD) {
        window.__HARNESS_SIGNED_IN__ = true;
        return { data: { session: harnessSession() }, error: null };
      }
      return { data: null, error: { message: 'Invalid login credentials' } };
    },
    async signOut() {
      window.__HARNESS_SIGNED_IN__ = false;
      if (window.__HARNESS_SESSION__ !== undefined) window.__HARNESS_SESSION__ = null;
      return { error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
  from(table) { return makeBuilder(table); },
  channel() { return makeChannel(); },
  removeChannel() {},
  functions: {
    // No real card-search/scanner backend in the harness — every provider
    // resolves to "no matches" rather than hanging or erroring, which is
    // enough to exercise the surrounding UI (status text, empty states).
    // scan-binder-page can be scripted per test: each call takes the next
    // entry (an array of detected cards) off window.__HARNESS_SCAN_QUEUE__,
    // and returns no cards once it's empty. window.__HARNESS_SCAN_CALLS__
    // counts the calls (e.g. to prove "+1 same card" makes none).
    async invoke(name, opts) {
      // verify-discord-member returns window.__HARNESS_VERIFY__ and records
      // the body it was sent.
      if (name === 'verify-discord-member') {
        window.__HARNESS_VERIFY_BODY__ = opts && opts.body;
        return { data: window.__HARNESS_VERIFY__ || { member: true, name: '' }, error: null };
      }
      if (name === 'bounties') return harnessBounties((opts && opts.body) || {});
      if (name === 'scan-binder-page') {
        window.__HARNESS_SCAN_CALLS__ = (window.__HARNESS_SCAN_CALLS__ || 0) + 1;
        const queue = window.__HARNESS_SCAN_QUEUE__;
        const cards = queue && queue.length ? queue.shift() : [];
        return { data: { cards }, error: null };
      }
      return { data: { results: [] }, error: null };
    },
  },
};

export const SUPABASE_URL = 'https://harness.invalid';
export const SUPABASE_ANON_KEY = 'harness-anon-key';
export const SHARED_LOGIN_EMAIL = 'harness@example.com';
