import { supabaseClient } from './supabase.js';

// Repeatedly strips a trailing "(...)" group. Used only to get down to the
// literal card name for the base query — Scryfall's `name` field doesn't
// include print-treatment text like "(Borderless)", even though that text is
// real and meaningful (see parseTrailingCollectorNumber below for where it
// actually needs to go).
function stripTrailingParens(name) {
  let s = name;
  let next = s.replace(/\s*\([^()]*\)\s*$/, '').trim();
  while (next !== s) {
    s = next;
    next = s.replace(/\s*\([^()]*\)\s*$/, '').trim();
  }
  return s;
}

// A trailing "(1234)" on an imported name is a collector number, not junk —
// it's often the ONLY thing distinguishing multiple prints that otherwise
// share a name and treatment (e.g. three different "Bruce Banner
// (Borderless)" cards in the same set, numbered differently). Scryfall
// exposes collector number as its own searchable field (`number:`), so pull
// it out and use it to find the exact print instead of discarding it.
function parseTrailingCollectorNumber(name) {
  const m = name.match(/\((\d+)\)\s*$/);
  if (!m) return { name, collectorNumber: null };
  return { name: name.slice(0, m.index).trim(), collectorNumber: m[1] };
}

// Scryfall's own pricing model (confirmed via its API blog post announcing
// the finishes field, 2021-09-02): a print's `prices` object carries up to
// four independent USD fields — usd (nonfoil), usd_foil, usd_etched, and
// usd_glossy — not one flat price. A foil-only or etched-only print (a
// Secret Lair drop, most often) can have a null `usd` while still carrying
// a real price under one of the others. Falls back through them in
// nonfoil-first order — same "most-common baseline first" reasoning as
// Pokemon's POKEMON_PRICE_VARIANTS fallback — so a real print isn't
// reported as "no price data" just because it never had a plain nonfoil
// version.
function scryfallPrice(c) {
  const p = c.prices;
  if (!p) return null;
  if (p.usd != null) return Number(p.usd);
  if (p.usd_foil != null) return Number(p.usd_foil);
  if (p.usd_etched != null) return Number(p.usd_etched);
  if (p.usd_glossy != null) return Number(p.usd_glossy);
  return null;
}

// Confirmed live (not guessed): Scryfall's /cards/search returns HTTP 404
// with an error object specifically to mean "zero cards matched this
// query" — its normal, expected response for a query that's simply too
// narrow, not a failure. Treating it as an error (like every other non-ok
// status) would make every legitimately-empty search tier below look like
// "the database is down," which it isn't. A real 5xx gets a short retry —
// Scryfall's public API has no confirmed flakiness report the way
// pokemontcg.io's did (it needed a 4-attempt backoff before Pokemon moved to
// TCGdex), so this is deliberately a lighter, 1-retry safety net — and
// still throws (rather than
// silently returning []) if it doesn't recover, so a real outage surfaces
// as an honest "couldn't reach the database" instead of a misleading "no
// matches."
const SCRYFALL_RETRY_DELAYS_MS = [500];
async function scryfallQuery(q, attempt = 0) {
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    if (res.status >= 500 && attempt < SCRYFALL_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, SCRYFALL_RETRY_DELAYS_MS[attempt]));
      return scryfallQuery(q, attempt + 1);
    }
    throw new Error(`Scryfall returned ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).slice(0, 6).map(c => ({
    url: (c.image_uris && c.image_uris.normal) || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris && c.card_faces[0].image_uris.normal),
    label: `${c.name} (${c.set_name}) #${c.collector_number}`,
    // NM (near-mint, nonfoil-first) market price in USD — this exact
    // print's price, not a generic name-based lookup, since it's the same
    // card object the image came from. Used as the Market Value feature's
    // reference price.
    price: scryfallPrice(c),
    // A direct link to this exact print's real TCGPlayer listing — the
    // NM-price-times-multiplier estimate can be badly wrong for high-value
    // outliers (a flat percentage is a population average, not this card's
    // real going rate), so staff need a one-click way to check the actual
    // current per-condition listings before pricing anything expensive.
    listingUrl: c.purchase_uris && c.purchase_uris.tcgplayer,
    rarity: c.rarity || '',
    // Structured (not just baked into the label), same as Pokemon's
    // candidates — lets a confirmed pick back-fill the item's own Set/
    // Number fields (see selectCandidate in EditModal.jsx).
    set: c.set_name || '',
    number: c.collector_number || '',
  })).filter(r => r.url);
}

// APIs don't always use a consistent Title-Case convention — pokemontcg.io
// once returned "MEGA_ATTACK_RARE" next to normal Title Case values in the
// same set, and Lorcast reports "Super_rare". Normalizing case and
// underscores/hyphens to spaces before comparing means the model's (Title
// Case) guess still matches that kind of inconsistency instead of silently
// missing it.
function normalizeRarityForMatch(s) {
  return s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Soft preference, not a hard filter — moves results whose own reported
// rarity loosely matches the hint to the front, but never drops anything.
// A hard filter risks silently zeroing out results over a vocabulary
// mismatch (the binder scanner's rarity guess is free text, not guaranteed
// to match a given API's exact rarity strings); this can only ever help.
function preferRarity(results, rarityHint) {
  if (!rarityHint || !results.length) return results;
  const needle = normalizeRarityForMatch(rarityHint);
  if (!needle) return results;
  const matched = [], rest = [];
  for (const r of results) {
    // rarityAliases: every value this result's rarity could plausibly be
    // when the source's own label is ambiguous (see pokemonRarityFromTcgdex)
    // — matched against for ordering only, never written back to an item.
    const names = [r.rarity, ...(r.rarityAliases || [])].filter(Boolean);
    if (names.some(n => normalizeRarityForMatch(n).includes(needle))) matched.push(r);
    else rest.push(r);
  }
  return matched.length ? [...matched, ...rest] : results;
}

// A printed Magic collector number is occasionally typed with a leading "#"
// or (staff muscle memory from Pokemon's "280/217" style) a trailing
// "/<set total>" — neither of which Scryfall's number: operator expects.
function sanitizeMagicNumber(s) {
  return String(s).trim().replace(/^#/, '').split('/')[0].trim();
}

export async function searchScryfall(name, setHint, rarityHint, numberHint) {
  const trimmed = name.trim();
  const { name: withoutNumber, collectorNumber: parsedNumber } = parseTrailingCollectorNumber(trimmed);
  const cleanName = stripTrailingParens(withoutNumber);
  // setHint is deliberately unused here. Scryfall's set:/s:/e:/edition:
  // operators only match a print's 3-4 letter SET CODE, not its full set
  // name (confirmed via Scryfall's own syntax docs/examples — "e:ktk", not
  // "e:Khans of Tarkir") — and this app's Set field holds whatever free
  // text staff typed or the scanner read off the card, almost always a full
  // name, not a code. There's no lookup in this app from set name to set
  // code, so turning setHint into a set: filter would risk silently zeroing
  // out a correct match on a mismatch it can't detect — the same
  // "don't guess an external platform's exact capability" call made
  // elsewhere in this file (see setHint's own use for the Egman-backed
  // games, where it's safe specifically because those responses carry a
  // real card_code field to match against). Accepted as a parameter anyway
  // so every entry in searchCardImage's dispatch table has the same
  // (name, setHint, rarityHint, numberHint) shape.
  const collectorNumber = (numberHint ? sanitizeMagicNumber(numberHint) : '') || parsedNumber;

  // An explicit or name-embedded collector number is the strongest
  // disambiguator a Magic print has — same-name reprints (extended art,
  // showcase, borderless, judge promos…) are common, and unlike Pokemon's
  // scanner-guessed set/number, a Number staff actually typed in is
  // trustworthy enough to try first rather than as a last resort.
  if (collectorNumber) {
    const base = cleanName || trimmed;
    const unpadded = collectorNumber.replace(/^0+/, '') || collectorNumber;
    const numberVariants = unpadded !== collectorNumber ? [collectorNumber, unpadded] : [collectorNumber];
    try {
      // Exact-name match first (`!"..."` requires the name to equal `base`
      // precisely) — fast and precise when the scan's name is dead-on.
      for (const num of numberVariants) {
        const results = await scryfallQuery(`!"${base}" number:${num}`);
        if (results.length) return preferRarity(results, rarityHint);
      }
      // Real-world report: a scan read "Sauron, Dark Lord" for the actual
      // "Sauron, the Dark Lord" — a small dropped word that made every
      // exact-name+number query above return nothing, silently losing the
      // number constraint entirely and falling through to the fully
      // unscoped broad-name tier below, which landed on a different
      // (wrong) print with no numeric narrowing left at all. A vision
      // model's OCR drops small connecting words like this often enough
      // that requiring exact name equality here is too strict — this
      // second pass keeps the SAME number constraint but drops the exact-
      // match requirement on the name (bare, unquoted terms — the same
      // loose matching the broad tier below already relies on, which is
      // exactly why that tier still found *a* "Sauron" card despite the
      // missing "the"), so the number keeps doing its real disambiguating
      // work instead of being abandoned at the first sign of an
      // imperfectly-transcribed name.
      for (const num of numberVariants) {
        const results = await scryfallQuery(`${base} number:${num}`);
        if (results.length) return preferRarity(results, rarityHint);
      }
    } catch {
      // A persistent failure on this one narrow query shouldn't abort the
      // whole search — fall through to the broader tiers below, same
      // per-tier isolation searchPokemon uses for the identical reason.
    }
  }

  const hasBroaderTier = cleanName && cleanName !== trimmed;
  let results = [];
  try {
    results = await scryfallQuery(trimmed);
    if (results.length) return preferRarity(results, rarityHint);
  } catch (err) {
    if (!hasBroaderTier) throw err;
    results = [];
  }

  if (hasBroaderTier) {
    // No exact print match — surface every print of the base card (there may
    // be several, which is exactly the case that got us here) so staff can
    // pick the right one visually from the candidate grid. This really is
    // the last tier now, so its failure is allowed to propagate — a
    // genuinely unreachable API still reports as an error rather than a
    // misleading "no matches."
    results = await scryfallQuery(cleanName);
  }
  return preferRarity(results, rarityHint);
}

// ---------------------------------------------------------------------------
// Pokemon — TCGdex (api.tcgdex.net), replacing pokemontcg.io, which is
// folding into the paid Scrydex service (its key-less public tier was also
// failing live, 2026-10-14). Everything below was confirmed against the real
// API and TCGdex's own docs (filtering, single-card, markets, assets pages),
// not guessed:
// - CORS is `Access-Control-Allow-Origin: *`, so it's called directly from
//   the browser like Scryfall/Lorcast, no proxy needed.
// - The GraphQL endpoint returns EVERY card matching a name filter in one
//   request (unpaginated by default), with set/rarity/number included — but
//   has no pricing field. Pricing only exists on the REST single-card
//   object, so each candidate shown costs one extra request (capped and
//   cached below).
// - The name filter is a case-insensitive "contains" match by default, and
//   a GraphQL variable carries the name verbatim — so possessive names
//   ("Lillie's Clefairy ex") just work with a plain straight apostrophe.
//   The whole two-representation apostrophe hedge pokemontcg.io's Lucene
//   query string needed is gone. A curly apostrophe (’) returns nothing,
//   though, so it's normalized to ' first.
// - Results include Pokemon TCG *Pocket* (the mobile game) cards — digital
//   only, never in a binder — under the `tcgp` serie; excluded.
// ---------------------------------------------------------------------------
const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

// Serie id (sv, swsh, sm, xy, me, tcgp, ...) — the first path segment after
// the language in a card's image URL, e.g. https://assets.tcgdex.net/en/sv/sv09/056.
// Every candidate surfaced here has an image (imageless cards are dropped,
// same as before), so this is always available when it's needed.
function tcgdexSerie(image) {
  const m = /^https?:\/\/[^/]+\/[^/]+\/([^/]+)\//.exec(image || '');
  return m ? m[1] : '';
}

// A collector number as printed is usually "280/217" — TCGdex's localId
// only stores the first part, and pads some sets with leading zeros ("076"),
// so compare on a normalized form rather than the raw string.
function normalizePokemonNumber(s) {
  const n = String(s || '').trim().replace(/^#/, '').split('/')[0].trim().toUpperCase();
  return n.replace(/^0+(?=.)/, '');
}

// TCGdex's rarity vocabulary differs from the one this app has always used
// (pokemontcg.io's — the Rarity dropdown, the scanner prompt, and every
// already-saved catalog value use it). Translated into the app's own names
// rather than adopted as-is, so a picked candidate's back-filled Rarity
// stays consistent with everything already in the catalog. Confirmed
// against TCGdex's real /rarities list and a per-serie breakdown of real
// cards, not guessed.
const TCGDEX_RARITY_MAP = {
  'holo rare': 'Rare Holo',
  'holo rare v': 'Rare Holo V',
  'holo rare vmax': 'Rare Holo VMAX',
  'holo rare vstar': 'Rare Holo VSTAR',
  'secret rare': 'Rare Secret', // only used pre-Scarlet & Violet, where the app's name is "Rare Secret"
  'none': '',
};
// TCGdex's "Ultra Rare" is genuinely ambiguous outside two eras: in XY/
// Sun & Moon/Black & White it covers BOTH a regular-art EX/GX (the app's
// "Rare Holo EX"/"Rare Holo GX") AND its full-art version ("Rare Ultra") —
// confirmed live, xy7-57 and xy7-93 (regular and full-art Giratina EX) both
// report "Ultra Rare" — and in the Mega era it also covers Mega Attack Rare
// (me02.5-269, the real Mega Gengar ex MAR, reports "Ultra Rare"). For those,
// rarity is left BLANK so a picked candidate never overwrites the item's own
// (possibly correct) Rarity with a guess; the plausible values go in
// rarityAliases instead, which preferRarity can still match a hint against.
const ULTRA_RARE_BY_SERIE = {
  sv: { rarity: 'Ultra Rare' },
  swsh: { rarity: 'Rare Ultra' }, // Sword & Shield's full-art V/VMAX tier; regular V is "Holo Rare V"
  me: { rarity: '', aliases: ['Ultra Rare', 'Mega Attack Rare'] },
};
const ULTRA_RARE_AMBIGUOUS_OLDER = { rarity: '', aliases: ['Rare Ultra', 'Rare Holo EX', 'Rare Holo GX'] };

export function pokemonRarityFromTcgdex(raw, serie) {
  const r = String(raw || '').trim();
  if (!r) return { rarity: '', aliases: [] };
  const key = r.toLowerCase();
  if (key === 'ultra rare') {
    const hit = ULTRA_RARE_BY_SERIE[serie] || ULTRA_RARE_AMBIGUOUS_OLDER;
    return { rarity: hit.rarity, aliases: hit.aliases || [] };
  }
  if (key in TCGDEX_RARITY_MAP) return { rarity: TCGDEX_RARITY_MAP[key], aliases: [] };
  // Everything else differs only in capitalization ("Double rare",
  // "Special illustration rare", "Hyper rare") — Title Case each word,
  // leaving already-uppercase tokens ("LV.X", "ACE SPEC") alone.
  const titled = r.split(/\s+/).map(w => (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  return { rarity: titled, aliases: [] };
}

// TCGPlayer prices on a TCGdex card live under pricing.tcgplayer, keyed by
// print variant, each `{productId, lowPrice, midPrice, highPrice,
// marketPrice, directLowPrice}`. The live API uses "holofoil"/
// "reverse-holofoil"/"1st-edition-holofoil"/"unlimited-holofoil" while
// TCGdex's own docs example shows "holo"/"reverse" — both spellings are
// accepted rather than trusting either one alone. Any other variant key
// that shows up later is still tried, after the known ones.
//
// Within a variant, same most-reliable-first fallback as before: per
// TCGPlayer's own pricing docs, `marketPrice` aggregates *sold* listings
// over the past week and is null for a low-volume card with no recent
// sale, while low/mid/high come from *current* listings — so a real
// expensive chase card with active listings still gets a listing-based
// estimate instead of "no price data."
const POKEMON_PRICE_VARIANTS = [
  'normal', 'holofoil', 'holo', 'reverse-holofoil', 'reverse',
  'unlimited-holofoil', 'unlimited', '1st-edition-holofoil', '1st-edition-normal', '1st-edition',
];
function variantPrice(p) {
  if (p.marketPrice != null) return p.marketPrice;
  if (p.midPrice != null) return p.midPrice;
  if (p.lowPrice != null && p.highPrice != null) return (p.lowPrice + p.highPrice) / 2;
  if (p.lowPrice != null) return p.lowPrice;
  if (p.highPrice != null) return p.highPrice;
  return null;
}
export function pokemonTcgplayerPrice(card) {
  const t = card && card.pricing && card.pricing.tcgplayer;
  if (!t) return { price: null, productId: null };
  const keys = [
    ...POKEMON_PRICE_VARIANTS.filter(k => t[k]),
    ...Object.keys(t).filter(k => t[k] && typeof t[k] === 'object' && !POKEMON_PRICE_VARIANTS.includes(k)),
  ];
  let productId = null;
  for (const k of keys) {
    const p = t[k];
    if (productId == null && p.productId != null) productId = p.productId;
    const price = variantPrice(p);
    if (price != null) return { price, productId: p.productId != null ? p.productId : productId };
  }
  return { price: null, productId };
}

// A real 5xx gets one short retry — TCGdex has no flakiness report the way
// pokemontcg.io had (it answered every live test request), so this is the
// same lighter 1-retry safety net Scryfall/YGOPRODeck/Lorcast use, not
// pokemontcg.io's old 4-attempt backoff. Still throws if it doesn't recover,
// so an outage reports honestly instead of as "no matches."
const TCGDEX_RETRY_DELAYS_MS = [500];
async function tcgdexFetch(url, init, attempt = 0) {
  const res = await fetch(url, init);
  if (!res.ok && res.status >= 500 && attempt < TCGDEX_RETRY_DELAYS_MS.length) {
    await new Promise((r) => setTimeout(r, TCGDEX_RETRY_DELAYS_MS[attempt]));
    return tcgdexFetch(url, init, attempt + 1);
  }
  return res;
}

const TCGDEX_CARDS_QUERY = 'query($name:String!){ cards(filters:{name:$name}) { id localId name image rarity set { id name } } }';
async function tcgdexSearchUncached(nameFilter) {
  const res = await tcgdexFetch(`${TCGDEX_BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: TCGDEX_CARDS_QUERY, variables: { name: nameFilter } }),
  });
  if (!res.ok) throw new Error(`TCGdex returned ${res.status}`);
  const data = await res.json();
  if (data.errors && data.errors.length) throw new Error(`TCGdex query error: ${data.errors[0].message}`);
  return (data.data && data.data.cards) || [];
}

// A single card's full object — only needed for pricing. A failure here
// just means that one candidate shows without a price; it never fails the
// whole search.
async function tcgdexCardUncached(id) {
  const res = await tcgdexFetch(`${TCGDEX_BASE}/en/cards/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`TCGdex returned ${res.status}`);
  return res.json();
}

// A binder page commonly has several copies of the same card (bulk commons
// especially), and a scan's per-row auto-fill searches each copy
// independently — without these caches, N identical copies would fire N
// identical requests. Each caches the in-flight promise too, not just a
// resolved value, so concurrent duplicates collapse onto one request.
// Cleared on failure so a transient error doesn't get stuck cached; a
// success is safe to reuse for the session, since a print's data doesn't
// change while browsing.
const pokemonSearchCache = new Map();
const pokemonCardCache = new Map();
function cached(map, key, load) {
  if (map.has(key)) return map.get(key);
  const promise = load(key);
  map.set(key, promise);
  promise.catch(() => map.delete(key));
  return promise;
}

// Test-only — clears both caches so tests stay isolated from each other.
// No real app code path needs this; a long-lived browser tab is exactly
// the case the caches are meant to help.
export function __resetPokemonQueryCacheForTests() {
  pokemonSearchCache.clear();
  pokemonCardCache.clear();
}

// More than this many candidates is noise in the review grid anyway, and
// each one costs a pricing request.
const POKEMON_MAX_CANDIDATES = 20;
const POKEMON_PRICE_CONCURRENCY = 4;

function briefToCandidate(c) {
  const serie = tcgdexSerie(c.image);
  const { rarity, aliases } = pokemonRarityFromTcgdex(c.rarity, serie);
  const setName = (c.set && c.set.name) || '';
  return {
    // TCGdex image URLs come back extension-less by design; quality/format
    // are appended per its assets docs (600x825 webp, its recommended
    // format for the web).
    url: `${c.image}/high.webp`,
    // Collector number included — without it, two different prints of the
    // same name+set look identical in the candidate grid.
    label: `${c.name} (${setName}) #${c.localId || ''}`,
    price: null,
    listingUrl: null,
    rarity,
    ...(aliases.length ? { rarityAliases: aliases } : {}),
    // Structured (not just baked into the label) so a confirmed pick can
    // back-fill the item's own Set/Number fields — once staff visually
    // confirm a candidate, this real database value is more trustworthy
    // than the scan's own guess for these two frequently-wrong fields.
    set: setName,
    number: c.localId || '',
  };
}

async function attachPokemonPrices(cards, candidates) {
  let next = 0;
  async function worker() {
    while (next < cards.length) {
      const i = next++;
      try {
        const full = await cached(pokemonCardCache, cards[i].id, tcgdexCardUncached);
        const { price, productId } = pokemonTcgplayerPrice(full);
        candidates[i].price = price;
        // A direct link to this exact print's real TCGPlayer listing (the
        // product page format, confirmed live) — for checking actual
        // per-condition prices before trusting the NM-based estimate.
        if (productId != null) candidates[i].listingUrl = `https://www.tcgplayer.com/product/${productId}`;
      } catch {
        // Leave this one candidate unpriced — see tcgdexCardUncached.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(POKEMON_PRICE_CONCURRENCY, cards.length) }, worker));
}

export async function searchPokemon(name, setHint, rarityHint, numberHint) {
  const cleanName = String(name || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!cleanName) return [];

  // Full name first (TCGdex's default contains-match already covers a lot
  // of what pokemontcg.io needed several tiers for). If that finds nothing
  // — e.g. a set/promo code like "XY83" typed after the name, which isn't
  // part of the card's real name — fall back to just the first word, as a
  // prefix match ("Charizard*", per TCGdex's filtering docs). Only the last
  // tier's failure propagates, so a genuinely unreachable API still reports
  // as an error rather than a misleading "no matches."
  const firstWord = cleanName.split(' ')[0];
  const tiers = [cleanName];
  if (firstWord && firstWord !== cleanName) tiers.push(`${firstWord}*`);

  let briefs = [];
  let usedFirstWord = false;
  for (let i = 0; i < tiers.length; i++) {
    try {
      briefs = await cached(pokemonSearchCache, tiers[i], tcgdexSearchUncached);
    } catch (err) {
      if (i === tiers.length - 1) throw err;
      briefs = [];
    }
    briefs = briefs.filter(c => c.image && tcgdexSerie(c.image) !== 'tcgp');
    usedFirstWord = i > 0;
    if (briefs.length) break;
  }
  if (!briefs.length) return [];

  // An exact name match ranks above a card that merely contains the name
  // ("Charizard" before "Blaine's Charizard"/"Dark Charizard").
  const lower = cleanName.toLowerCase();
  const exact = briefs.filter(c => (c.name || '').toLowerCase() === lower);
  let pool = exact.length ? [...exact, ...briefs.filter(c => !exact.includes(c))] : briefs;

  // Set/number hints narrow the pool when they help, and are ignored when
  // they don't match anything (a wrong scan guess must never zero out the
  // search). Same priority as before: set+number together is about as
  // close to a unique key as a print has; number alone comes before set
  // alone because the scan's set guess is the less reliable of the two.
  // When the first-word fallback was needed, the last word that got
  // dropped is very often a promo/collector code typed into the name
  // ("Charizard EX XY121") — try it as a number hint if staff didn't give
  // one. Like every hint here, it only narrows if it actually matches.
  const droppedCode = usedFirstWord ? cleanName.split(' ').pop() : '';
  const wantNumber = normalizePokemonNumber(numberHint || droppedCode);
  const wantSet = setHint ? String(setHint).trim().toLowerCase() : '';
  const numberOk = c => !!wantNumber && normalizePokemonNumber(c.localId) === wantNumber;
  const setName = c => ((c.set && c.set.name) || '').toLowerCase();
  // An exact set name beats a loose one ("Base Set" must prefer Base Set
  // over Base Set 2), but a loose match still beats ignoring the hint.
  const setExact = c => !!wantSet && setName(c) === wantSet;
  const setLoose = c => {
    const s = setName(c);
    return !!wantSet && !!s && (s.includes(wantSet) || wantSet.includes(s));
  };
  for (const test of [
    c => numberOk(c) && setExact(c),
    c => numberOk(c) && setLoose(c),
    numberOk,
    setExact,
    setLoose,
  ]) {
    const narrowed = pool.filter(test);
    if (narrowed.length) { pool = narrowed; break; }
  }

  // Rarity ordering first, then the cap, then pricing — so the pricing
  // requests are only spent on candidates that will actually be shown.
  const briefOf = new Map();
  const candidates = pool.map(c => {
    const cand = briefToCandidate(c);
    briefOf.set(cand, c);
    return cand;
  });
  const ordered = preferRarity(candidates, rarityHint).slice(0, POKEMON_MAX_CANDIDATES);
  await attachPokemonPrices(ordered.map(c => briefOf.get(c)), ordered);
  return ordered;
}

// Unlike Scryfall/pokemontcg.io, a Yu-Gi-Oh card is ONE database entry
// covering every printing — reprints don't get a separate card object, they
// just add another entry to that one card's own `card_sets` array (each
// with its own set_name/set_code/set_rarity/set_price). So there's no
// "wrong print returned" problem to fix the way Magic/Pokemon have (a fname
// search essentially always finds the right card already) — the real
// disambiguation need here is picking WHICH of that one confirmed card's
// set_sets entries to surface the price/rarity/set from, not which card.
// Soft best-effort match, same "never zero out a real result over a
// mismatched hint" rule as preferRarity — numberHint (the printed set code,
// e.g. "LOB-005", visible bottom-left on every real card) is the strongest
// signal since it's essentially a global unique key; setHint/rarityHint are
// still useful fallbacks when the code wasn't captured/legible.
function pickYugiohSetEntry(cardSets, setHint, rarityHint, numberHint) {
  if (!cardSets || !cardSets.length) return null;
  const safeNumber = numberHint ? String(numberHint).trim().toLowerCase() : '';
  const safeSet = setHint ? setHint.trim().toLowerCase() : '';
  const safeRarity = rarityHint ? rarityHint.trim().toLowerCase() : '';
  if (safeNumber) {
    const m = cardSets.find(s => (s.set_code || '').toLowerCase().includes(safeNumber));
    if (m) return m;
  }
  if (safeSet) {
    const m = cardSets.find(s => (s.set_name || '').toLowerCase().includes(safeSet));
    if (m) return m;
  }
  if (safeRarity) {
    const m = cardSets.find(s => (s.set_rarity || '').toLowerCase().includes(safeRarity));
    if (m) return m;
  }
  return cardSets[0];
}

// Deliberately stays on YGOPRODeck's own default (internal) card_sets data
// rather than opting into its `tcgplayer_data=yes` mode — that mode
// additionally returns set_edition/set_url (which would otherwise be handy
// for the Printing/finish field and a listingUrl), but YGOPRODeck's own docs
// explicitly warn TCGplayer's own Set Name/Rarity data "have occasionally
// made up Rarity names in the past and don't always conform to correct Card
// Set Names" under that mode. Since Set/Rarity backfill accuracy here
// matters more than an extra listing link, this sticks with the more
// reliable default — no listingUrl for Yugioh today (the game-agnostic
// manual TCGPlayer search link already covers that gap, same as it does
// for every other provider that lacks one).
const YUGIOH_RETRY_DELAYS_MS = [500]; // same lighter 1-retry safety net as Scryfall — no confirmed flakiness report for this API either
async function ygoQuery(param, value, setHint, rarityHint, numberHint, attempt = 0) {
  const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?${param}=${encodeURIComponent(value)}`);
  if (!res.ok) {
    if (res.status >= 500 && attempt < YUGIOH_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, YUGIOH_RETRY_DELAYS_MS[attempt]));
      return ygoQuery(param, value, setHint, rarityHint, numberHint, attempt + 1);
    }
    // Not confirmed (unlike Scryfall's documented 404) whether this API reliably uses a distinct
    // status code for "no results" vs. a real error — rather than guess and
    // risk misreporting a genuine outage as "no matches," this keeps the
    // original behavior of treating any other non-ok status as empty.
    return [];
  }
  const data = await res.json();
  const cards = data.data || [];
  return cards.slice(0, 4).flatMap(c => {
    const setEntry = pickYugiohSetEntry(c.card_sets, setHint, rarityHint, numberHint);
    const price = (setEntry && Number(setEntry.set_price)) ||
      (c.card_prices && c.card_prices[0] && Number(c.card_prices[0].tcgplayer_price)) || null;
    return (c.card_images || []).slice(0, 2).map(img => ({
      url: img.image_url, label: c.name, price,
      rarity: (setEntry && setEntry.set_rarity) || '',
      set: (setEntry && setEntry.set_name) || '',
    }));
  });
}

export async function searchYugioh(name, setHint, rarityHint, numberHint) {
  // fname is already a fuzzy/substring match server-side; the fallback here
  // is for names with an extra trailing word (misremembered subtitle, etc.)
  // that keeps the full string from matching anything.
  let results = await ygoQuery('fname', name, setHint, rarityHint, numberHint);
  if (!results.length) {
    const words = name.split(/\s+/);
    if (words.length > 1) {
      results = await ygoQuery('fname', words.slice(0, -1).join(' '), setHint, rarityHint, numberHint);
    }
  }
  return preferRarity(results, rarityHint);
}

// One Piece, Riftbound, Gundam, and SWU's card databases either block direct
// browser calls with no CORS headers (One Piece, SWU — confirmed by
// live-testing fetch() from this app) or aren't a documented public API at
// all (Riftbound, Gundam — via Egman's deckbuilder, used with his explicit
// go-ahead). Routed through card-lookup-proxy (a Supabase Edge Function)
// instead, which fetches server-side where CORS doesn't apply.
async function proxyQuery(provider, query, setHint, rarityHint, numberHint) {
  const { data, error } = await supabaseClient.functions.invoke('card-lookup-proxy', {
    body: { provider, query, setHint: setHint || '', rarityHint: rarityHint || '', numberHint: numberHint || '' },
  });
  if (error) return [];
  return data?.results || [];
}

// setHint is the item's own `set` field — for these games it also ends up
// holding whatever printed set/card code the binder scanner read off the
// card (e.g. "EXBP-008"), which is exactly what disambiguates prints that
// otherwise share an identical name (Gundam's base-set generics, alt art,
// promos). See card-lookup-proxy for how it's used. rarityHint is the same
// idea, narrowed server-side there against a confirmed real `rarity` field
// for these three games specifically (see card-lookup-proxy's egmanQuery) —
// SWU has no confirmed rarity field, so it doesn't get one here either.
// numberHint (One Piece only for now) is the card's own printed collector
// number (the digits after the dash in e.g. "OP01-001") — egmanQuery matches
// it against the suffix of the confirmed real `card_code` field. Riftbound/
// Gundam don't pass it yet (their own parity sprints haven't happened), so
// it's simply omitted for those calls below rather than guessed at.
export async function searchOnePiece(name, setHint, rarityHint, numberHint) {
  return await proxyQuery('onepiece', name.trim(), setHint, rarityHint, numberHint);
}

// numberHint maps to the printed card_code's suffix, same as One Piece
// (e.g. "310" from "OGN-310/298") — egmanQuery already supports this
// generically; Riftbound just never passed it through until now.
export async function searchRiftbound(name, setHint, rarityHint, numberHint) {
  return await proxyQuery('riftbound', name.trim(), setHint, rarityHint, numberHint);
}

// numberHint maps to the printed card_code's suffix, same as One Piece/
// Riftbound (e.g. "001" from "GD01-001") — egmanQuery already supports
// this generically; Gundam just never passed it through until now.
export async function searchGundam(name, setHint, rarityHint, numberHint) {
  return await proxyQuery('gundam', name.trim(), setHint, rarityHint, numberHint);
}

// setHint/rarityHint are applied server-side in card-lookup-proxy as a
// soft, narrow-if-it-helps filter against the already-fetched results' own
// Set/Rarity fields — not a query-string operator (see that function's own
// comment for why: this app's Set field for SWU holds a full expansion
// name, not the short code the API's confirmed set: operator expects,
// same mismatch risk as Magic's setHint). numberHint is accepted for a
// consistent dispatch shape but unused — no confirmed collector-number
// field to narrow by.
export async function searchSwu(name, setHint, rarityHint, numberHint) {
  return await proxyQuery('swu', name.trim(), setHint, rarityHint, numberHint);
}

// Lorcast (api.lorcast.com) — a free, no-key, Scryfall-modeled API for Disney
// Lorcana. Confirmed CORS-safe for direct browser calls (unlike several other
// small TCG APIs checked for this feature — see CLAUDE.md).
//
// Real `prices.usd`/`prices.usd_foil` fields (confirmed via a real card
// sample) — same nonfoil-first fallback reasoning as scryfallPrice, just
// with the two fields Lorcana's data actually carries (no etched/glossy
// equivalent here).
function lorcastPrice(c) {
  const p = c.prices;
  if (!p) return null;
  if (p.usd != null) return Number(p.usd);
  if (p.usd_foil != null) return Number(p.usd_foil);
  return null;
}

// A printed Lorcana collector number ("154/204", same number/total-count
// format Pokemon uses) needs the "/<total>" part stripped before it's a
// bare number Lorcast's cn: operator can use.
function sanitizeLorcanaNumber(s) {
  return String(s).split('/')[0].trim();
}

// Lighter, 1-retry safety net on a genuine 5xx, same pattern as Scryfall/
// Yu-Gi-Oh — no confirmed flakiness report for this endpoint either. Unlike
// Scryfall (whose 404-means-"no-results" behavior is confirmed via its own
// docs), Lorcast's exact "zero matches" status code isn't independently
// confirmed, so — same call as ygoQuery — a persistent non-5xx failure
// still returns [] instead of throwing, rather than risk misreporting a
// real "no matches" as an error on unconfirmed information.
const LORCAST_RETRY_DELAYS_MS = [500];
async function lorcastQuery(q, attempt = 0) {
  const res = await fetch(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    if (res.status >= 500 && attempt < LORCAST_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, LORCAST_RETRY_DELAYS_MS[attempt]));
      return lorcastQuery(q, attempt + 1);
    }
    return [];
  }
  const data = await res.json();
  return (data.results || []).slice(0, 6).map(c => ({
    url: c.image_uris && c.image_uris.digital && (c.image_uris.digital.normal || c.image_uris.digital.small),
    label: `${c.name}${c.version ? ' - ' + c.version : ''} (${(c.set && c.set.name) || ''}${c.collector_number ? ' #' + c.collector_number : ''}${c.rarity ? ' · ' + c.rarity : ''})`,
    price: lorcastPrice(c),
    // A direct link to this exact print's real TCGPlayer listing — Lorcast's
    // card object carries the same purchase_uris.tcgplayer field Scryfall's
    // does (confirmed via a real sample), closing what was previously a
    // documented gap: Lorcana had no listingUrl at all, so EditModal/
    // ScannerPanel's Pricing section could only ever show the game-agnostic
    // manual TCGPlayer search fallback for this game. Real link now, same
    // as Magic/Pokemon/the Egman-backed games.
    listingUrl: c.purchase_uris && c.purchase_uris.tcgplayer,
    rarity: c.rarity || '',
    // Structured (not just baked into the label), same as every other
    // game's candidates — lets a confirmed pick back-fill the item's own
    // Set/Number/Rarity fields. set.code (a bare number, e.g. "6") rather
    // than set.name — Lorcana cards print only a set NUMBER, never an
    // expansion name (see the scan-binder-page guidance below), so a bare
    // number is what this app's Set field actually holds for this game,
    // and it's also exactly what Lorcast's own s: search operator expects.
    set: (c.set && c.set.code) || '',
    number: c.collector_number || '',
  })).filter(r => r.url);
}

// Lorcast's query syntax is confirmed (via its own docs, not guessed) to be
// "heavily influenced by Scryfall": s: (or set:) searches by the set's plain
// NUMBER — Lorcana sets have no letter code, unlike Magic, e.g. "s:6" for
// Azurite Sea — and cn: (or number:) searches by collector number, meant to
// be "combined with s: to find specific card editions" per Lorcast's own
// docs. Both are safe to use as real server-side filters here (unlike
// Magic's setHint, which Scryfall's set: operator can't use because it
// wants a letter code this app doesn't store) since this app's Set field
// for Lorcana holds exactly the bare set number the scanner reads off the
// card, matching what s: expects. A `rarity:` operator also exists there,
// but its confirmed real API value for Super Rare is the oddly-formatted
// "Super_rare" (see RARITY_OPTIONS_BY_GAME.Lorcana) and its multi-word
// query tokenization isn't confirmed, so — same discipline as every other
// game — rarityHint stays a soft, client-side preferRarity reorder instead
// of a hard server-side filter that could zero out a real match on a
// tokenization mismatch this app has no way to detect.
export async function searchLorcana(name, setHint, rarityHint, numberHint) {
  const trimmed = name.trim();
  const safeSet = setHint ? String(setHint).trim() : '';
  const safeNumber = numberHint ? sanitizeLorcanaNumber(numberHint) : '';

  if (safeSet && safeNumber) {
    const results = await lorcastQuery(`${trimmed} s:${safeSet} cn:${safeNumber}`);
    if (results.length) return preferRarity(results, rarityHint);
  }
  if (safeNumber) {
    const results = await lorcastQuery(`${trimmed} cn:${safeNumber}`);
    if (results.length) return preferRarity(results, rarityHint);
  }
  if (safeSet) {
    const results = await lorcastQuery(`${trimmed} s:${safeSet}`);
    if (results.length) return preferRarity(results, rarityHint);
  }
  return preferRarity(await lorcastQuery(trimmed), rarityHint);
}

// A manual fallback for when the automated search above fails outright
// (exhausted every retry) or found a card but no price data for it — rather
// than leave staff stuck with nothing, a link straight to TCGPlayer's own
// search with the name/set already typed in gets them most of the way to
// finding the real listing themselves. Verified live (2026-08-21) rather
// than guessed: `https://www.tcgplayer.com/search/all/product?q=<query>`
// is TCGPlayer's real, working general search results URL. Deliberately
// uses the game-agnostic "all" category rather than a per-game category
// path (e.g. `/search/pokemon/product`) — this app supports 8 different
// games, and confirming each one's exact category slug without a real
// sample for every single one risks shipping a wrong/broken slug for at
// least one of them, whereas "all" is already confirmed to work correctly
// for any game.
export function tcgplayerSearchUrl(name, set) {
  const q = [name, set].filter(Boolean).join(' ').trim();
  return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(q)}&view=grid`;
}

// A second, independent price reference alongside TCGPlayer — eBay's own
// SOLD/completed listings (not just active asking prices) are a real,
// useful second data point for judging a card's actual going rate,
// confirmed live rather than guessed: `_nkw=<query>` is eBay's standard
// search-term param, and `LH_Sold=1&LH_Complete=1` is eBay's own documented
// filter for sold+completed results specifically (not just any listing).
// One caveat worth remembering if this ever looks "broken": as of
// 2026-07-22 eBay put sold/completed results behind a login wall — a
// signed-out browser gets redirected to signin.ebay.com instead of seeing
// results directly. Not worked around here (no accepted way to do that
// from a plain link), just something to know if staff report the link
// "not working" — it still does, it just needs an eBay account signed in
// first, the same way TCGPlayer's own link assumes nothing about login.
export function ebaySoldSearchUrl(name, set) {
  const q = [name, set].filter(Boolean).join(' ').trim();
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1`;
}

// A third, independent price reference — PriceCharting aggregates its own
// sale-price history/index per card, a different methodology from either
// TCGPlayer's live-listing snapshot or eBay's raw sold-listing search, so
// it's a genuinely separate data point rather than a duplicate of the other
// two. Free to browse, no account/API key needed, same "manual link, not an
// automated fetch" shape as the other two.
// Unlike tcgplayerSearchUrl/ebaySoldSearchUrl above, this URL was NOT
// confirmed via a direct live visit — pricecharting.com is blocked by this
// sandbox's egress proxy (confirmed via both WebFetch and a raw curl, both
// coming back as a hard block, not a transient failure). Corroborated
// instead via a third-party source (a scraper product's own documentation
// page quoting a real PriceCharting search URL) showing the search endpoint
// is `/search-products` with a `type=prices` and a `q=<query>` param — those
// two params are the only ones used here; the extra params that source URL
// also included (sort/category/etc.) looked like optional display
// preferences, not required for the search itself, so they're left out
// rather than guessed at. Flagged here honestly as corroborated-not-verified,
// unlike this file's usual "confirmed live" standard — revisit if a staff
// report ever suggests this URL doesn't actually work.
export function priceChartingSearchUrl(name, set) {
  const q = [name, set].filter(Boolean).join(' ').trim();
  return `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(q)}`;
}

// Single dispatch table for "search a card image by game" — shared by every
// entry point that needs it (EditModal's Find image/Find market price,
// ScannerPanel's auto-fill, CSV/XLSX import's auto-fill) so adding a new
// game's search function only means editing this one list, not three
// near-identical copies of the same if-chain. numberHint (the printed
// collector number) is Pokemon-only for now — every other game's search
// function simply ignores the extra argument.
export async function searchCardImage(game, name, setHint, rarityHint, numberHint) {
  if (!name) return [];
  if (game === "Magic") return await searchScryfall(name, setHint, rarityHint, numberHint);
  if (game === "Pokemon") return await searchPokemon(name, setHint, rarityHint, numberHint);
  if (game === "Yugioh") return await searchYugioh(name, setHint, rarityHint, numberHint);
  if (game === "Lorcana") return await searchLorcana(name, setHint, rarityHint, numberHint);
  if (game === "One Piece") return await searchOnePiece(name, setHint, rarityHint, numberHint);
  if (game === "Riftbound") return await searchRiftbound(name, setHint, rarityHint, numberHint);
  if (game === "Gundam") return await searchGundam(name, setHint, rarityHint, numberHint);
  if (game === "SWU") return await searchSwu(name, setHint, rarityHint, numberHint);
  return null; // null (not []) signals "not set up for this game" vs. a real empty result
}
