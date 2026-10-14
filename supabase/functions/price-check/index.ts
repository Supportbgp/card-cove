// Feature B (price tracking + spike alerts), PR 1 — see CLAUDE.md's "Price
// tracking & spike alerts" section. Triggered on a schedule by
// .github/workflows/price-check.yml (GitHub Actions cron), never by the
// browser — unlike scan-binder-page/card-lookup-proxy, this has no CORS
// allowlist at all, since a browser is never the caller.
//
// Unlike every other Edge Function in this repo, this one reads/writes
// Postgres directly (catalog, price_history, price_alerts,
// price_tracking_settings) using the service-role client Supabase injects
// into every Edge Function automatically (SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY env vars — no `supabase secrets set` needed for
// those two). The HTTP call itself still needs a valid Authorization bearer
// to pass Supabase's default per-function JWT check — the calling GitHub
// Actions workflow authenticates with the same service-role key, stored as
// a GitHub repository secret (SUPABASE_SERVICE_ROLE_KEY). See CLAUDE.md for
// the exact setup steps.
//
// Deploy from the repo root with:
//   supabase functions deploy price-check
//
// Per-provider price lookups below are a deliberately simpler, single-shot
// version of cardSearch.js's own interactive multi-tier fallback ladders —
// this runs unattended against the whole tracked catalog on a schedule, so
// request budget across many items matters more than getting any one item
// exactly right on the first try the way an interactive staff search does.
// A wrong/no match for one item just means no price_history row for it
// today, not a blocking failure — it'll be tried again on the next
// scheduled run. Field names/endpoints below mirror cardSearch.js's own
// already-confirmed shapes exactly (same real APIs, same response fields),
// not re-guessed from scratch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Light 1-retry-on-5xx safety net, same reasoning already used throughout
// cardSearch.js/card-lookup-proxy — none of these providers have a
// confirmed flakiness report severe enough to need more. (pokemontcg.io did
// — it needed a 4-attempt backoff here — until Pokemon moved to TCGdex.)
async function fetchWithRetry(url, delayMs = 500, init = undefined) {
  let res = await fetch(url, init);
  if (!res.ok && res.status >= 500) {
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url, init);
  }
  return res;
}

async function runWithConcurrency(items, limit, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

// A real run's sampleFailures (see the Deno.serve handler's own diagnostics)
// showed the dominant cause wasn't retries or API flakiness at all — it was
// that catalog.name frequently has extra text typed straight into it that
// isn't part of a card's actual indexed name: a collector number ("Charizard
// 4/102", "Snorlax - 051", "Vaporeon ex - 149/131"), a rarity/variant note
// ("Dialga EX (122 Secret Rare)", "Pongo - Determined Father (Enchanted)"),
// or several of these stacked ("Vampiric Tutor (JP Alternate Art) (Silver
// Scroll Foil)"). None of this is surprising once named — catalog.number was
// never a real column (see the Deno.serve handler's own comment on that),
// so staff had nowhere else to put a collector number but Name itself. Two
// real, separate problems this one cleanup step fixes: (1) an exact/
// near-exact name search on pokemontcg.io/Scryfall/etc. simply won't match a
// real card's name against this extra text, which is "no_match", not a
// retry-able failure; (2) Scryfall's own query syntax treats literal
// parentheses as search-grouping syntax, not text, so a parenthetical-heavy
// name can come back as a request failure rather than a real search
// attempt — plausibly explaining Magic's own disproportionate share of
// "fetch_failed" results, all of which were parenthetical-heavy names in
// the same real sample.
//
// Deliberately does NOT strip a bare " - <Words>" suffix with no trailing
// number — several real official card names use exactly that format (SWU's
// "Cad Bane - He Who Needs No Introduction", Lorcana's "Pongo - Determined
// Father" once its own "(Enchanted)" suffix is removed). See
// dashFallbackNames below for how those are handled instead — as a second,
// narrower fallback tier, not by stripping the dash outright.
//
// A follow-up real run (checked climbed from 58 to 133 once this function
// existed, but still had real failures) showed two more real gaps:
// (1) a bracketed annotation ("Misty's Psyduck [W Stamped]") survived
// untouched — this only ever stripped parenthetical groups, never
// square-bracket ones; (2) a *mid-string* parenthetical group
// ("Sheoldred, the Apocalypse (Textured Foil) - Dominaria United (DMU)")
// survived too, because the original regex only matched a run of groups
// anchored to the very end of the string — the non-paren " - Dominaria
// United" text between the two groups broke that anchor, leaving
// "(Textured Foil)" in place to trip Scryfall's own literal-parens-as-
// grouping-syntax problem again (a "fetch_failed", not a clean no-match).
// Every parenthetical/bracketed group seen across every real sample
// collected in this whole debugging arc has been an extraneous staff
// annotation (rarity/variant/printing note, grading stamp, set code) —
// never part of a card's actual name — so stripping every such group
// anywhere in the string, not just a trailing run of them, is a safe
// generalization of the same already-verified assumption, not a new guess.
function cleanCardName(name) {
  let n = String(name || "").trim();
  n = n.replace(/\([^)]*\)/g, " ");
  n = n.replace(/\[[^\]]*\]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  n = n.replace(/\s*-?\s*\d+(\/\d+)?$/, "").trim();
  return n || String(name || "").trim();
}

// A real dash-subtitle card name (SWU's "Cad Bane - He Who Needs No
// Introduction", Lorcana's "Pongo - Determined Father") has now failed
// "no_match" for three consecutive real runs even after every cleanup
// above — the full name is correct, so this isn't noise to strip, but
// something about the full phrase isn't matching either provider's search
// as a single query. Rather than guess at either API's exact matching
// behavior (the thing this file's own header explicitly says not to do),
// this adds a second, narrower fallback tier — the same "narrower tier
// fails, fall through to a broader one" ladder discipline already used
// throughout cardSearch.js's interactive search — tried only once the full
// name has already come back empty, so it can only help, never override a
// query that already succeeds.
function dashFallbackNames(name) {
  const cleaned = cleanCardName(name);
  const names = [cleaned];
  const dashIdx = cleaned.indexOf(" - ");
  if (dashIdx > 0) {
    const prefix = cleaned.slice(0, dashIdx).trim();
    if (prefix && prefix !== cleaned) names.push(prefix);
  }
  return names;
}

// Tries each candidate name in order, stopping as soon as one actually
// finds something (a real price, or a real card with no usable price field
// — "no_price" is a confirmed match, not a reason to keep guessing at a
// different, possibly-wrong card). Only "no_match"/"fetch_failed" fall
// through to the next, broader candidate.
async function withNameFallback(item, queryOnce) {
  const names = dashFallbackNames(item.name);
  let result = { price: null, reason: "no_match" };
  for (const name of names) {
    result = await queryOnce(name);
    if (result.price != null || result.reason === "no_price") return result;
  }
  return result;
}

// --- Per-game price lookups -------------------------------------------
// Each takes the catalog row (name/set/rarity/number already on it) and
// returns { price, reason } — price is null when nothing usable was found,
// and reason explains which of three distinct failure modes it was:
// "fetch_failed" (the request itself never succeeded, even after retry),
// "no_match" (a real response came back with zero results for this name),
// or "no_price" (a card was found, but it carries no usable price field).
// Added after a real run's aggregate failedByGame count (99 Pokemon
// failures even with the 4-attempt retry budget) didn't say which of these
// three was actually happening — this is what lets the next run's response
// say that directly instead of requiring another guess-and-redeploy cycle.

function scryfallPrice(c) {
  const p = c.prices;
  if (!p) return null;
  if (p.usd != null) return Number(p.usd);
  if (p.usd_foil != null) return Number(p.usd_foil);
  if (p.usd_etched != null) return Number(p.usd_etched);
  if (p.usd_glossy != null) return Number(p.usd_glossy);
  return null;
}

async function magicPrice(item) {
  return withNameFallback(item, async (name) => {
    const res = await fetchWithRetry(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}`);
    if (!res.ok) return { price: null, reason: "fetch_failed" };
    const data = await res.json();
    const card = (data.data || [])[0];
    if (!card) return { price: null, reason: "no_match" };
    const price = scryfallPrice(card);
    return { price, reason: price == null ? "no_price" : null };
  });
}

// Pokemon — TCGdex (api.tcgdex.net), replacing pokemontcg.io, which folded
// into the paid Scrydex service. Same API and response shapes as
// cardSearch.js's searchPokemon (confirmed live, 2026-10-14 — see CLAUDE.md's
// TCGdex migration section): a GraphQL name search returns every match with
// its set in one request (a GraphQL variable carries the name verbatim, so a
// possessive name like "Lillie's Clefairy ex" needs no sanitizing — the old
// two-representation apostrophe hedge is gone), and the price lives only on
// the REST single-card object, so this is two requests per item instead of
// one. TCG Pocket (mobile-game, digital-only) cards share the same database
// and are skipped.
const TCGDEX_BASE = "https://api.tcgdex.net/v2";
const TCGDEX_CARDS_QUERY = "query($name:String!){ cards(filters:{name:$name}) { id name image set { name } } }";

function tcgdexSerie(image) {
  const m = /^https?:\/\/[^/]+\/[^/]+\/([^/]+)\//.exec(image || "");
  return m ? m[1] : "";
}

// Same variant order and most-reliable-first fallback as cardSearch.js's
// pokemonTcgplayerPrice: a card commonly has no recent *sale* (marketPrice/
// midPrice) while still having real *listings* (low/high). Both the live
// API's key names ("holofoil", "reverse-holofoil") and TCGdex's docs-example
// names ("holo", "reverse") are accepted.
const POKEMON_PRICE_VARIANTS = [
  "normal", "holofoil", "holo", "reverse-holofoil", "reverse",
  "unlimited-holofoil", "unlimited", "1st-edition-holofoil", "1st-edition-normal", "1st-edition",
];
function pokemonTcgplayerPrice(card) {
  const t = card && card.pricing && card.pricing.tcgplayer;
  if (!t) return null;
  const keys = [
    ...POKEMON_PRICE_VARIANTS.filter((k) => t[k]),
    ...Object.keys(t).filter((k) => t[k] && typeof t[k] === "object" && !POKEMON_PRICE_VARIANTS.includes(k)),
  ];
  for (const k of keys) {
    const p = t[k];
    if (p.marketPrice != null) return p.marketPrice;
    if (p.midPrice != null) return p.midPrice;
    if (p.lowPrice != null && p.highPrice != null) return (p.lowPrice + p.highPrice) / 2;
    if (p.lowPrice != null) return p.lowPrice;
    if (p.highPrice != null) return p.highPrice;
  }
  return null;
}

async function pokemonPrice(item) {
  // No numberHint — the collector number is never saved on a catalog row
  // (see CLAUDE.md's catalog.number crash fix). The item's own Set IS saved,
  // though, so among several prints sharing a name, one from that set is
  // preferred — TCGdex returns matches oldest-first, so without this a
  // reprinted name would always be priced off its oldest print.
  return withNameFallback(item, async (rawName) => {
    const name = rawName.replace(/[’‘]/g, "'");
    const res = await fetchWithRetry(`${TCGDEX_BASE}/graphql`, 500, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: TCGDEX_CARDS_QUERY, variables: { name } }),
    });
    if (!res.ok) return { price: null, reason: "fetch_failed" };
    const data = await res.json();
    if (data.errors && data.errors.length) return { price: null, reason: "fetch_failed" };
    const matches = ((data.data && data.data.cards) || []).filter((c) => tcgdexSerie(c.image) !== "tcgp");
    if (!matches.length) return { price: null, reason: "no_match" };

    const lower = name.toLowerCase();
    const exact = matches.filter((c) => (c.name || "").toLowerCase() === lower);
    const pool = exact.length ? exact : matches;
    const wantSet = String(item.set_name || "").trim().toLowerCase();
    const card = (wantSet && pool.find((c) => ((c.set && c.set.name) || "").toLowerCase() === wantSet)) || pool[0];

    const cardRes = await fetchWithRetry(`${TCGDEX_BASE}/en/cards/${encodeURIComponent(card.id)}`);
    if (!cardRes.ok) return { price: null, reason: "fetch_failed" };
    const price = pokemonTcgplayerPrice(await cardRes.json());
    return { price, reason: price == null ? "no_price" : null };
  });
}

async function yugiohPrice(item) {
  return withNameFallback(item, async (name) => {
    const res = await fetchWithRetry(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}`);
    if (!res.ok) return { price: null, reason: "fetch_failed" };
    const data = await res.json();
    const card = (data.data || [])[0];
    if (!card) return { price: null, reason: "no_match" };
    const price = (card.card_prices && card.card_prices[0] && Number(card.card_prices[0].tcgplayer_price)) || null;
    return { price, reason: price == null ? "no_price" : null };
  });
}

function lorcastPrice(c) {
  const p = c.prices;
  if (!p) return null;
  if (p.usd != null) return Number(p.usd);
  if (p.usd_foil != null) return Number(p.usd_foil);
  return null;
}

async function lorcanaPrice(item) {
  return withNameFallback(item, async (name) => {
    const res = await fetchWithRetry(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(name)}`);
    if (!res.ok) return { price: null, reason: "fetch_failed" };
    const data = await res.json();
    const card = (data.results || [])[0];
    if (!card) return { price: null, reason: "no_match" };
    const price = lorcastPrice(card);
    return { price, reason: price == null ? "no_price" : null };
  });
}

// One Piece / Riftbound / Gundam — Egman's deckbuilder, same two-endpoint
// (full card list + full price list, joined by card_code) shape
// card-lookup-proxy's own egmanQuery already uses. No numberHint narrowing
// here (unlike egmanQuery's own interactive version) — catalog never
// persists a collector number (see pokemonPrice's own comment above for
// why), so this is name-match only, taking the first result.
async function egmanPrice(gameSlug, item) {
  const [cardsRes, pricesRes] = await Promise.all([
    fetchWithRetry(`https://deckbuilder.egmanevents.com/api/cards/${gameSlug}`),
    fetchWithRetry(`https://deckbuilder.egmanevents.com/api/prices/${gameSlug}`),
  ]);
  if (!cardsRes.ok) return { price: null, reason: "fetch_failed" };
  const cards = await cardsRes.json();
  const prices = pricesRes.ok ? await pricesRes.json() : [];
  const priceByCode = new Map((Array.isArray(prices) ? prices : []).map((p) => [p.card_code, p]));

  return withNameFallback(item, (name) => {
    const nameNeedle = name.toLowerCase();
    const matches = (Array.isArray(cards) ? cards : [])
      .filter((c) => (c.name || "").toLowerCase().includes(nameNeedle));

    const match = matches[0];
    if (!match) return { price: null, reason: "no_match" };
    const priceEntry = priceByCode.get(match.card_code);
    const price = priceEntry ? priceEntry.market_price : null;
    return { price, reason: price == null ? "no_price" : null };
  });
}

async function swuPrice(item) {
  return withNameFallback(item, async (name) => {
    const res = await fetchWithRetry(`https://api.swu-db.com/cards/search?q=${encodeURIComponent(name)}&pretty=true`);
    if (!res.ok) return { price: null, reason: "fetch_failed" };
    const data = await res.json();
    const card = (Array.isArray(data.data) ? data.data : [])[0];
    if (!card) return { price: null, reason: "no_match" };
    const price = card.MarketPrice ? Number(card.MarketPrice) : null;
    return { price, reason: price == null ? "no_price" : null };
  });
}

// Sports Singles has no card database to look up against at all (a
// documented, accepted drawback elsewhere in this app) — simply absent
// here, same as every other provider dispatch table in this codebase, so
// it's silently skipped rather than erroring.
const PRICE_LOOKUPS = {
  Magic: magicPrice,
  Pokemon: pokemonPrice,
  Yugioh: yugiohPrice,
  Lorcana: lorcanaPrice,
  "One Piece": (item) => egmanPrice("optcg", item),
  Riftbound: (item) => egmanPrice("riftbound", item),
  Gundam: (item) => egmanPrice("gundam", item),
  SWU: swuPrice,
};

async function lookupPrice(item) {
  const fn = PRICE_LOOKUPS[item.game];
  if (!fn) return { price: null, reason: "no_lookup" };
  try {
    return await fn(item);
  } catch {
    return { price: null, reason: "exception" };
  }
}

// A hard per-invocation ceiling, regardless of what a caller requests —
// Edge Functions have a real execution time limit (see RUN_DEADLINE_MS
// below), so no single call is ever allowed to ask for more than this many
// rows at once. Used as the DEFAULT `limit` too when a caller sends no body
// at all (e.g. an ad-hoc manual curl with no JSON), matching this
// function's original single-shot behavior for backward compatibility.
const MAX_ITEMS_PER_RUN = 200;
const CONCURRENCY = 3;

// A real manual trigger run hit this exact wall: the previous name-matching
// fixes (dash-subtitle fallback, Pokemon's 4-attempt retry) made far more
// lookups actually succeed (checked climbed from 58 to 133 on a 200-item
// run) — more successful lookups means more total request/retry time, not
// less, and the run's total wall-clock time crossed Supabase Edge
// Functions' hard, non-adjustable 150-second idle timeout
// (`{"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s)
// reached"}` — a real, named platform limit from the error itself, not
// something to guess at). `MAX_ITEMS_PER_RUN` alone can't prevent this: it
// bounds how much work *might* be attempted, not how long that work
// actually takes, and per-item latency varies a lot (a Pokemon item that
// needs its full 4-attempt backoff takes several seconds; a dash-fallback
// retry on a no_match name doubles a request). A fixed wall-clock deadline
// inside the run itself is the direct fix: stop *starting* new lookups once
// the elapsed time nears the real limit, finish writing whatever was
// already found, and report what got skipped for time so the next run
// (or a future tuning pass, if this keeps happening) has a real number to
// act on instead of another guess. 120s leaves a 30s margin under the
// documented 150s limit for the final DB round-trips and response
// serialization once the loop stops.
const RUN_DEADLINE_MS = 120000;

// A real run with this deadline in place returned `{"skippedForTime":99}`
// out of 200 scoped items — not a one-off, but a PERMANENT gap: the catalog
// query below orders by price descending and always starts at the same
// place, so the same ~99 lowest-priced-within-the-cap items would be
// skipped on *every* run, forever, not just "picked up tomorrow" the way
// the comment above assumed. Fixed by accepting `offset`/`limit` in the
// request body so the caller (the GitHub Actions workflow, below) can walk
// the catalog in several smaller batches, each a separate invocation with
// its own fresh RUN_DEADLINE_MS/150s clock, instead of one invocation
// trying to cover the whole scoped catalog at once. `limit` is still
// clamped to MAX_ITEMS_PER_RUN regardless of what's requested.
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    // No body sent at all (e.g. an ad-hoc manual curl) — fall through to
    // the defaults below, same as this function's original behavior.
  }
  const offset = Number.isFinite(body.offset) ? Math.max(0, Math.trunc(body.offset)) : 0;
  const limit = Number.isFinite(body.limit)
    ? Math.min(Math.max(1, Math.trunc(body.limit)), MAX_ITEMS_PER_RUN)
    : MAX_ITEMS_PER_RUN;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: settingsRow } = await admin
    .from("price_tracking_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const floor = (settingsRow && settingsRow.floor_price) ?? 25;
  const spikePct = (settingsRow && settingsRow.spike_pct) ?? 20;

  // Bulk lots have no per-print identity to look up at all (see CLAUDE.md's
  // "Sorting stage + Bulk item type" section) — excluded the same way
  // catalog_public_view excludes them. No `number` column — collector
  // number has never been a persisted catalog column anywhere in this app
  // (confirmed against every `alter table catalog add column` migration —
  // only base_price and rarity were ever added), only a transient,
  // never-saved search-hint field elsewhere in the UI. The first real
  // manual trigger run of this function failed with exactly this mistake
  // ("column catalog.number does not exist") — caught by the user's own
  // manual test, not by review, so each per-game lookup above was also
  // stripped of its now-impossible numberHint narrowing.
  //
  // Compares against `price` ("Our Price"), not `base_price` — a second
  // real finding from manual testing. `base_price` is only ever populated
  // when staff run "Find stock image"/"Find market price" and pick a
  // candidate (Sprint 5's Market Value feature); confirmed via a real query
  // against the live project that 0 of 599 real catalog items had
  // base_price set, so the floor/comparison never matched anything at all.
  // `price` is what every real item actually has — confirmed with the user
  // that comparing a fresh market price against what's currently charged is
  // the right comparison anyway (the goal is "notice our listed price is
  // now stale relative to the market," which `price` answers more directly
  // than a possibly-never-captured reference price would). This never
  // writes back to `price` — same "never silently overwrite a manual
  // entry" rule already documented below.
  //
  // `.in("game", ...)` — a third real finding from the first full-volume
  // test run: a shop catalog of 241 above-floor items broke down as 166
  // Pokemon / 36 Magic / 12 "Other" / 10 One Piece / 9 SWU / 8 Lorcana (a
  // real query against the live project, not guessed) — "Other" is a real,
  // legitimate GAMES value (canonicalizeGame's own fallback for an
  // unrecognized game string, e.g. some Quote-tab-originated items), but
  // PRICE_LOOKUPS has no entry for it at all, so those items could never
  // succeed and were just burning slots in the 200-item cap for no reason.
  // Filtering to only games this file actually knows how to look up keeps
  // every checked slot meaningful; Sports Singles is excluded the same way
  // (no card database exists for it, a documented drawback elsewhere in
  // this app) without needing its own special case.
  const { data: items, error } = await admin
    .from("catalog")
    .select("sku, name, set_name, game, price")
    .neq("item_type", "bulk")
    .not("price", "is", null)
    .gte("price", floor)
    .in("game", Object.keys(PRICE_LOOKUPS))
    .order("price", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return json({ error: error.message }, 500);
  }

  let checked = 0, spikes = 0, failed = 0, skippedForTime = 0;
  const failedByGame = {};
  const failedByReason = {};
  // Finer-grained than either tally alone — this round's diagnosis needed to
  // cross-reference failedByGame against sampleFailures by hand to see that
  // Magic's failures were disproportionately fetch_failed while Pokemon's
  // were disproportionately no_match; this gives that cross-tabulation
  // directly in the response instead.
  const failedDetail = {};
  const sampleFailures = [];
  const MAX_SAMPLE_FAILURES = 15;

  const startedAt = Date.now();
  await runWithConcurrency(items || [], CONCURRENCY, async (item) => {
    // Stop starting new lookups once the run is close to Supabase's real
    // 150s idle-timeout wall (see RUN_DEADLINE_MS above) — an in-flight
    // request already running when this trips is allowed to finish
    // naturally (runWithConcurrency doesn't cancel it), but no new one
    // starts, so total time can't keep climbing past this point. Unlike the
    // old single-invocation design, a skipped item here isn't lost until
    // tomorrow — the orchestrating workflow (below) advances its next
    // batch's offset by `attempted`, not by a fixed batch size, so this
    // batch's untouched tail becomes exactly the start of the very next
    // batch in the same run.
    if (Date.now() - startedAt > RUN_DEADLINE_MS) {
      skippedForTime++;
      return;
    }
    const { price, reason } = await lookupPrice(item);
    if (price == null) {
      failed++;
      failedByGame[item.game] = (failedByGame[item.game] || 0) + 1;
      failedByReason[reason] = (failedByReason[reason] || 0) + 1;
      failedDetail[item.game] = failedDetail[item.game] || {};
      failedDetail[item.game][reason] = (failedDetail[item.game][reason] || 0) + 1;
      // Capped sample of real failing names so a high-failure run can be
      // inspected directly from the response instead of needing yet
      // another round-trip to a SQL query to find real examples — this is
      // exactly how the "Other"/Pokemon-retry issues above were diagnosed,
      // just made available without re-querying every time.
      if (sampleFailures.length < MAX_SAMPLE_FAILURES) {
        sampleFailures.push({ sku: item.sku, name: item.name, game: item.game, reason });
      }
      return;
    }
    checked++;

    await admin.from("price_history").insert({
      sku: item.sku, name: item.name, game: item.game, price,
    });

    const pctChange = item.price > 0 ? ((price - item.price) / item.price) * 100 : 0;
    if (pctChange >= spikePct) {
      // Don't pile up a fresh alert every single day a sustained spike
      // persists — one unacknowledged alert per sku is enough to drive the
      // in-app badge; staff dismiss it (or update the price) once, not once
      // per day it stays elevated.
      const { data: existing } = await admin
        .from("price_alerts")
        .select("id")
        .eq("sku", item.sku)
        .eq("acknowledged", false)
        .limit(1);
      if (!existing || existing.length === 0) {
        spikes++;
        await admin.from("price_alerts").insert({
          sku: item.sku, name: item.name, game: item.game,
          previous_price: item.price, new_price: price, pct_change: pctChange,
        });
      }
    }
  });

  // failedByGame/failedByReason/failedDetail/sampleFailures are included so
  // a future high-failure run can be diagnosed from the response alone, the
  // same real-usage-driven approach that found the "Other" and
  // Pokemon-retry issues above in the first place — no need to go back to a
  // SQL query every time. truncated/skippedForTime do the same job for the
  // real-world time-budget wall found above.
  //
  // `offset`/`limit` are echoed back so the calling workflow's own log output
  // identifies which slice this response covers. `attempted` (checked +
  // failed — i.e. every item that wasn't skipped for time) is what the
  // orchestrating workflow advances its next batch's offset by, NOT `limit`
  // — this is what makes a batch's own truncation self-healing rather than
  // a second permanent skip: the next batch simply starts exactly where
  // this one's real work stopped, whether that's a full `limit` items in or
  // fewer.
  const attempted = checked + failed;
  return json({
    offset, limit, attempted,
    total: (items || []).length, checked, spikes, failed,
    truncated: skippedForTime > 0, skippedForTime,
    failedByGame, failedByReason, failedDetail, sampleFailures,
  }, 200);
});

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
