// Server-side proxy for card image/price lookups that block direct browser
// calls with no CORS headers (confirmed for One Piece and SWU by
// live-testing fetch() from the deployed app before building this), or that
// aren't a documented public API at all (Egman's deckbuilder — used with his
// explicit go-ahead, see CLAUDE.md). The fetch happens here, in Deno, where
// CORS doesn't apply at all (it's a browser-only restriction) — the browser
// only ever talks to this function, never to the upstream API directly.
//
// Deploy from the repo root with:
//   supabase functions deploy card-lookup-proxy
//
// Requires being signed in with the shared login on the client side, same as
// scan-binder-page — Edge Functions verify the caller's JWT by default.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://supportbgp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

// The exact-match list above only ever matched `localhost` — testing via
// `npm run dev -- --host` (needed to reach the dev server from a phone on
// the same LAN) serves from a private-IP origin instead, which silently
// failed CORS on that phone while the same call worked fine from a laptop's
// `localhost` origin. Matches any RFC1918 private range on Vite's dev/preview
// ports, not a specific IP, since that address varies by network.
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|4173)$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN_RE.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Egman's deckbuilder (deckbuilder.egmanevents.com) exposes one JSON
// endpoint per game returning that game's FULL card list — confirmed by a
// real response sample for Riftbound, One Piece, and Gundam (card_code,
// name, set_code/set_label, rarity, _defaultImagePath). There's no
// documented name-filter param, so rather than guess one, we fetch the
// whole list and do the matching ourselves — the endpoint already proved it
// works with no query params at all, so this needs no further unverified
// assumptions.
//
// A separate /api/prices/<game> endpoint (same full-list-per-game shape)
// carries real TCGPlayer-sourced pricing — confirmed by a real sample for
// all three games: market_price, low_price (unused for now), and
// tcgplayer_url (a direct link to the real listing, same role as Scryfall's
// purchase_uris.tcgplayer / pokemontcg.io's tcgplayer.url). Joined back to
// the card list by card_code, which both endpoints share.
//
// Retries a GET once on a 5xx before giving up — matches the light,
// 1-retry safety net already used for Scryfall (no confirmed flakiness
// report for this endpoint the way pokemontcg.io has one, so this isn't
// the aggressive 4-attempt backoff that needed). A non-5xx response
// (including a 4xx) returns immediately without retrying, same "a bad
// request won't succeed on a second try" reasoning used elsewhere.
async function fetchWithRetry(url, delayMs = 500) {
  let res = await fetch(url);
  if (!res.ok && res.status >= 500) {
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url);
  }
  return res;
}

// A name-only match isn't enough: many of these games reuse the same name
// across many separate prints (alt art, promos, base-set generics like
// Gundam's "EX Base" cards, which share that literal name across dozens of
// otherwise-unrelated cards distinguished only by card_code). setHint — the
// item's own `set` field, which for these games doubles as wherever a
// printed set/card code the vision scanner read off the card ends up — is
// matched against card_code/set_code/set_label to narrow to the exact
// print. If the hint doesn't match anything (typo, or genuinely no hint),
// we fall back to the unnarrowed name matches rather than returning empty.
//
// numberHint (One Piece, Riftbound, and Gundam — all three Egman-backed
// games now pass one) is the card's own printed collector number —
// confirmed real card_code format is "<set code>-<number>" (e.g.
// "OP01-001", "OGN-310", "GD01-001"), so it's matched against the suffix
// after the last dash,
// leading zeros ignored (same convention mergeScanDuplicates in
// cardUtils.js already uses for the same reason: "0451" and "451" are the
// same printed number). Tried before setHint/rarityHint, same "number is
// the strongest disambiguator" priority used for Pokemon/Magic elsewhere in
// this app — narrows first if it helps, and every later hint still only
// narrows the result of the previous one, never replaces it with zero.
async function egmanQuery(gameSlug, name, setHint, rarityHint, numberHint) {
  const [cardsRes, pricesRes] = await Promise.all([
    fetchWithRetry(`https://deckbuilder.egmanevents.com/api/cards/${gameSlug}`),
    fetchWithRetry(`https://deckbuilder.egmanevents.com/api/prices/${gameSlug}`),
  ]);
  if (!cardsRes.ok) return [];
  const cards = await cardsRes.json();
  const prices = pricesRes.ok ? await pricesRes.json() : [];
  const priceByCode = new Map((Array.isArray(prices) ? prices : []).map((p) => [p.card_code, p]));

  const nameNeedle = name.toLowerCase();
  let matches = (Array.isArray(cards) ? cards : [])
    .filter((c) => (c.name || "").toLowerCase().includes(nameNeedle));

  if (numberHint) {
    // Accepts either a bare collector number ("001", matching card_code's
    // suffix after the last dash — what the scanner reports) or the full
    // printed code ("OP01-001", what a staff member might type by hand) —
    // whichever form the hint is in, don't force a guess about which one
    // this caller happened to supply.
    const needle = numberHint.trim().toLowerCase();
    const numNeedle = needle.replace(/^0+/, "") || "0";
    const narrowed = matches.filter((c) => {
      const code = (c.card_code || "").toLowerCase();
      if (needle.includes("-") && code.includes(needle)) return true;
      const suffix = code.includes("-") ? code.split("-").pop() : code;
      const num = suffix.replace(/^0+/, "") || "0";
      return num === numNeedle;
    });
    if (narrowed.length) matches = narrowed;
  }

  if (setHint) {
    const codeNeedle = setHint.toLowerCase();
    const narrowed = matches.filter((c) =>
      (c.card_code || "").toLowerCase().includes(codeNeedle) ||
      (c.set_code || "").toLowerCase().includes(codeNeedle) ||
      (c.set_label || "").toLowerCase().includes(codeNeedle)
    );
    if (narrowed.length) matches = narrowed;
  }

  // Same narrow-if-it-helps, fall-back-if-not rule as setHint above — safe
  // to filter on `rarity` directly (not just guessed at) since the same
  // real response sample that confirmed card_code/set_code/set_label also
  // confirmed this field.
  if (rarityHint) {
    const rarityNeedle = rarityHint.toLowerCase();
    const narrowed = matches.filter((c) => (c.rarity || "").toLowerCase().includes(rarityNeedle));
    if (narrowed.length) matches = narrowed;
  }

  // A generous cap, not 6 — these are just thumbnails in a picker grid, and
  // a card with many prints (alt art, promos) needs enough of them visible
  // to actually find the right one. card_code + rarity in the label is what
  // makes otherwise-identical-looking same-name prints distinguishable.
  return matches
    .slice(0, 20)
    .map((c) => {
      const priceEntry = priceByCode.get(c.card_code);
      return {
        url: c._defaultImagePath ? `https://deckbuilder.egmanevents.com/api/images/${gameSlug}/${c._defaultImagePath}` : null,
        label: `${c.name} (${c.card_code || c.set_code || ""}${c.rarity ? ' · ' + c.rarity : ''})`,
        price: priceEntry ? priceEntry.market_price : null,
        listingUrl: priceEntry ? priceEntry.tcgplayer_url : null,
        rarity: c.rarity || '',
      };
    })
    .filter((r) => r.url);
}

// Each provider takes a search string (+ optional set/code hint) and
// returns the normalized candidate shape the client already expects from
// cardSearch.js: { url, label }[].
const PROVIDERS = {
  onepiece: (query, setHint, rarityHint, numberHint) => egmanQuery('optcg', query, setHint, rarityHint, numberHint),
  riftbound: (query, setHint, rarityHint, numberHint) => egmanQuery('riftbound', query, setHint, rarityHint, numberHint),
  gundam: (query, setHint, rarityHint, numberHint) => egmanQuery('gundam', query, setHint, rarityHint, numberHint),

  // api.swu-db.com (not www. — that host 404s, the docs page and the API
  // itself live on different subdomains). Confirmed CORS-blocked, and the
  // response shape is confirmed by a real sample: array at data.data,
  // fields Name/FrontArt/Set/MarketPrice/LowPrice (LowPrice unused for
  // now). A later research pass confirmed the API's query syntax DOES
  // support `set:`/`rarity:` (or `s:`/`r:`) filter keywords server-side —
  // but not whether they can safely combine with a plain fuzzy-text name
  // search in the same query, and this app's Set field for SWU holds
  // whatever free text staff typed/the scanner read (almost always a full
  // expansion name, not the short code — e.g. "sor" — those operators
  // expect), same mismatch risk as Magic's setHint. Rather than guess at
  // that combination, setHint/rarityHint are applied here as a soft,
  // narrow-if-it-helps filter against the ALREADY-fetched name-matched
  // results' own Set/Rarity fields instead — same egmanQuery-style
  // narrowing used for the three games above, just without a server-side
  // query-string filter. `Rarity` (also confirmed real via research, a
  // separate later finding from the original response sample) is read
  // defensively as either casing in case the true field name differs
  // from this app's other confirmed PascalCase fields. numberHint is
  // accepted for a consistent dispatch shape but deliberately unused — no
  // confirmed collector-number field name to narrow by.
  swu: async (query, setHint, rarityHint, _numberHint) => {
    const res = await fetchWithRetry(`https://api.swu-db.com/cards/search?q=${encodeURIComponent(query)}&pretty=true`);
    if (!res.ok) return [];
    const data = await res.json();
    let matches = Array.isArray(data.data) ? data.data : [];

    if (setHint) {
      const needle = setHint.toLowerCase();
      const narrowed = matches.filter((c) => (c.Set || "").toLowerCase().includes(needle));
      if (narrowed.length) matches = narrowed;
    }
    if (rarityHint) {
      const needle = rarityHint.toLowerCase();
      const narrowed = matches.filter((c) => ((c.Rarity || c.rarity || "")).toLowerCase().includes(needle));
      if (narrowed.length) matches = narrowed;
    }

    return matches.slice(0, 20).map((c) => ({
      url: c.FrontArt,
      label: `${c.Name} (${c.Set || ""}${c.Rarity || c.rarity ? ' · ' + (c.Rarity || c.rarity) : ''})`,
      price: c.MarketPrice ? Number(c.MarketPrice) : null,
      rarity: c.Rarity || c.rarity || '',
      set: c.Set || '',
    })).filter((r) => r.url);
  },
};

// Staff only (CLAUDE.md "Staff-only access"). Supabase already rejects a
// call without a valid login, but once members can sign in with Discord a
// valid login no longer means staff. The caller is looked up on the auth
// server (not just read from the token), so removing someone's staff flag
// takes effect right away. The service-role key is auto-provided to every
// Edge Function; it's only used here to look the user up.
async function callerIsStaff(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !key) return false;
  const { data, error } = await createClient(url, key).auth.getUser(token);
  return !error && data?.user?.app_metadata?.staff === true;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin") || "");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (!(await callerIsStaff(req))) {
    return json({ error: "Staff only" }, 403, headers);
  }

  try {
    const { provider, query, setHint, rarityHint, numberHint } = await req.json();
    if (!provider || !PROVIDERS[provider]) {
      return json({ error: `Unknown provider: ${provider}` }, 400, headers);
    }
    if (!query || typeof query !== "string") {
      return json({ error: "Missing query" }, 400, headers);
    }
    const results = await PROVIDERS[provider](query, setHint || "", rarityHint || "", numberHint || "");
    return json({ results }, 200, headers);
  } catch (err) {
    return json({ error: String(err) }, 500, headers);
  }
});

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}
