export function parseMoney(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[$,]/g, '').trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

export const GRADING_RE = /\b(PSA|BGS|CGC|SGC|Beckett)\s+((?:Gem\s*Mint|Black\s*Label|Gold\s*Label|Pristine|Mint)\s+)?(\d{1,2}(?:\.\d)?)\b\s*$/i;

export function detectGrading(rawName) {
  const name = (rawName || "").trim();
  const m = name.match(GRADING_RE);
  if (!m) {
    return { name: name, itemType: "single", grader: "", grade: "" };
  }
  let grader = m[1].toUpperCase();
  if (grader === "BECKETT") grader = "Beckett";
  const qualifier = (m[2] || "").trim();
  const num = m[3];
  const grade = qualifier ? (qualifier + " " + num) : num;
  const cleanedName = name.slice(0, m.index).replace(/[-–—\s]+$/, "").trim();
  return { name: cleanedName || name, itemType: "slab", grader: grader, grade: grade };
}

const GAME_ALIASES = {
  magic: "Magic", mtg: "Magic", "magic: the gathering": "Magic", "magic the gathering": "Magic",
  pokemon: "Pokemon", "pokémon": "Pokemon", pkmn: "Pokemon",
  yugioh: "Yugioh", "yu-gi-oh": "Yugioh", "yu-gi-oh!": "Yugioh", ygo: "Yugioh",
  lorcana: "Lorcana", "disney lorcana": "Lorcana",
  "one piece": "One Piece",
  sports: "Sports Singles", "sports singles": "Sports Singles",
  swu: "SWU", "star wars unlimited": "SWU", "star wars": "SWU",
  riftbound: "Riftbound",
  gundam: "Gundam", "gundam card game": "Gundam", gcg: "Gundam",
};

// Imported spreadsheets rarely spell a game exactly like the Add/Edit form's
// dropdown does ("MTG" instead of "Magic", etc.) — coerce known variants onto
// the canonical string so the dropdown and the image-search game check (which
// compares against that exact string) both work on imported data.
function canonicalizeGame(raw) {
  const g = (raw || "").toString().trim();
  if (!g) return "Other";
  return GAME_ALIASES[g.toLowerCase()] || g;
}

// The canonical game list for every game dropdown in the app (EditModal,
// ScannerPanel, and now the Quote tab) — previously duplicated verbatim in
// EditModal.jsx and ScannerPanel.jsx with no single source of truth; a
// third consumer needing the exact same list is the trigger to hoist it
// here instead of tripling the copy.
export const GAMES = ["Magic", "Pokemon", "Yugioh", "Lorcana", "One Piece", "Sports Singles", "SWU", "Riftbound", "Gundam", "Other"];

// A small colored tag per game, shown next to the item name so a mixed-game
// catalog (this shop carries 9+ lines) scans by color at a glance, not just
// by reading text. Originally reused the 6 shared UI accent tokens (some
// games sharing a color), but real-phone testing found 3 exact repeats
// (Magic/SWU, Pokemon/Riftbound, Yugioh/Gundam) plus Lorcana/One Piece sitting
// only ~10° apart on the color wheel despite being different tokens — too
// close to tell apart at badge size. Every game now gets its own dedicated
// hue (`--tag-*` custom properties, `.badge.tag-*` in CSS), spaced ~30-40°
// apart around the wheel — the minimum gap needed for them to read as
// genuinely different colors rather than shades of each other — each still
// individually verified at ≥4.5:1 contrast against white. "Other" gets no
// color at all.
export const GAME_TAG_CLASS = {
  Magic: "tag-purple",
  Pokemon: "tag-amber",
  Yugioh: "tag-rust",
  Lorcana: "tag-lorcana",
  "One Piece": "tag-blue",
  "Sports Singles": "tag-green",
  SWU: "tag-swu",
  Riftbound: "tag-riftbound",
  Gundam: "tag-gundam",
};

// Suggestions for the Rarity field (a select-plus-escape-hatch picker via
// SelectWithCustom, EditModal/ScannerPanel) — Rarity is a real saved catalog
// attribute (see phase7_rarity_column.sql), but the curated list here is
// just suggestions, not a hard constraint on what can be saved. Values are
// real rarity strings each game's own card database uses (verified, not
// guessed — Pokemon's grouped by era against pokemon-tcg-data on GitHub;
// Magic's against Scryfall's own confirmed `rarity` field values). Games
// with no entry here just get no suggestions — the field still works as
// plain free text via the picker's escape hatch.
export const RARITY_OPTIONS_BY_GAME = {
  Pokemon: [
    "Common", "Uncommon", "Rare", "Rare Holo",
    // Modern (2023+, Scarlet & Violet era, lowercase "ex")
    "Double Rare", "Illustration Rare", "Ultra Rare", "Special Illustration Rare", "Hyper Rare",
    // Mega Evolution era (2025+, "Mega ___ ex") — verified against a real
    // Mega Evolution/Ascended Heroes sample; Mega Hyper Rare replaces plain
    // Hyper Rare as that era's gold chase-card tier, and Mega Attack Rare
    // (real API value "MEGA_ATTACK_RARE" — see the normalization note in
    // cardSearch.js's preferRarity) debuted with Ascended Heroes.
    "Mega Attack Rare", "Mega Hyper Rare",
    // Older (2012-2022, uppercase "-EX"/"-GX"/"V")
    "Rare Holo EX", "Rare Holo GX", "Rare Holo V", "Rare Ultra", "Rare Secret",
    // Confirmed real, current value — pokemontcg.io's own /rarities
    // endpoint lists "Promo" alongside every tier above, and a real card
    // (Mew 09/53, WOTC Black Star Promo) reports exactly this rarity. Promo
    // cards span every era, so this sits outside the era-grouped blocks
    // above rather than belonging to just one of them.
    "Promo",
  ],
  // Scryfall's `rarity` field takes exactly these six values (confirmed via
  // its own API type definitions, not guessed) — "Mythic Rare" is the
  // colloquial/WotC name for the API's plain "mythic"; the other five are
  // used as-is. Special/Bonus are real, still-current values, not legacy-
  // only: Special is for timeshifted cards (has its own purple rarity
  // symbol; sorts above Rare, below Mythic); Bonus is for a "glowing"
  // mythic-style symbol used on bonus-sheet cards like Vintage Masters'
  // Power Nine (sorts as the rarest tier, above Mythic). Both rare enough
  // in a real shop's binders that an exact pick beats forcing free text
  // every time one comes in.
  //
  // "Promo" is deliberately appended despite NOT being one of Scryfall's
  // six confirmed rarity values above (a promo Magic card keeps its
  // ORIGINAL rarity — Scryfall tracks promo-ness as a separate `is:promo`
  // boolean/dedicated Set, never the rarity field itself — see the
  // "Promo rarity audited across every game" note in CLAUDE.md). Kept
  // anyway per an explicit staff request: floor staff naturally describe
  // a card as "the promo version," so having it selectable here makes
  // that kind of item easier to find later via the Catalog's Rarity
  // filter, even though it doesn't correspond to a real value this
  // game's own API would ever return.
  Magic: ["Common", "Uncommon", "Rare", "Mythic Rare", "Special", "Bonus", "Promo"],
  // Real Yu-Gi-Oh TCG rarity tiers, confirmed against YGOPRODeck's own
  // `card_sets[].set_rarity` field (a real sample returned exactly "Secret
  // Rare"/"Ultra Rare" as Title Case strings — matches what's listed here)
  // plus cross-referenced community rarity guides for the tiers a single
  // sample didn't happen to include. Ordered roughly least-to-most-rare.
  // Deliberately excludes Parallel Rare variants (Normal/Ultra/Super
  // Parallel Rare, Duel Terminal-exclusive) and region-specific OCG-only
  // tiers — same "an ever-expanding, niche vocabulary belongs in the
  // free-text escape hatch, not a hardcoded list" call as Pokemon's Poke
  // Ball/Master Ball pattern exclusion above.
  //
  // "Promo" is appended despite not being a real Yu-Gi-Oh rarity value
  // either — same reasoning and same explicit staff request as Magic's
  // above (a promo printing's `set_rarity` is still a normal tier like
  // "Ultra Rare," confirmed via a real card_sets sample; promo-ness is
  // which SET a printing belongs to, not its rarity).
  Yugioh: [
    "Common", "Rare", "Super Rare", "Ultra Rare", "Ultimate Rare", "Secret Rare",
    "Gold Rare", "Ghost Rare", "Platinum Secret Rare", "Prismatic Secret Rare",
    "Collector's Rare", "Starlight Rare", "Quarter Century Secret Rare", "Promo",
  ],
  // Real One Piece Card Game rarity codes, each one actually printed in the
  // card's bottom-right corner (confirmed via Bandai's own card-list site and
  // cross-referenced community rarity guides, not guessed): Common (C),
  // Uncommon (UC), Rare (R), Super Rare (SR), Secret Rare (SEC), Leader (L),
  // Special Rare (SP), Treasure Rare (TR — English/Chinese/French only,
  // OP-06 booster sets onward; Japanese releases get a different chase
  // incentive instead), and Manga Rare (MR — always also a Secret Rare
  // under the hood, but carries its own distinct printed code and Oda-manga-
  // panel artwork, same "give it its own entry" call as Pokemon's tiers that
  // nest inside a broader concept).
  //
  // Deliberately excludes "Parallel"/"Alternate Art" — confirmed via research
  // to be the SAME thing (collectors and TCGPlayer use both names
  // interchangeably for a card marked with a small star above its rarity
  // code), and it's an overlay on top of any of the tiers above (a Common,
  // an SR, even a Leader can get one) rather than a rarity tier itself — see
  // PRINTING_OPTIONS_BY_GAME["One Piece"] below, same rarity-vs-finish split
  // as Yu-Gi-Oh's edition field.
  //
  // "Promo" is appended despite research confirming One Piece promos use
  // a `P-###` number prefix instead of a distinct rarity tier — same
  // explicit staff-convenience exception as Magic/Yugioh above.
  "One Piece": [
    "Common", "Uncommon", "Rare", "Super Rare", "Secret Rare",
    "Leader", "Special Rare", "Treasure Rare", "Manga Rare", "Promo",
  ],
  // The six official Disney Lorcana rarity tiers, each with its own distinct
  // printed symbol next to the collector number (confirmed via multiple
  // community rarity guides, not guessed): a gray/white circle (Common), a
  // white book (Uncommon — the one exception to the "more sides = rarer"
  // pattern), a bronze triangle (Rare), a silver diamond (Super Rare), a
  // gold pentagon (Legendary), and a rainbow/holographic hexagon (Enchanted
  // — foil-only, never pulled as a plain Rare/Super Rare/Legendary). Plus
  // "Promo" — confirmed as a real, distinct value the Lorcast API's own
  // `rarity` field assigns to cards from non-numbered promotional sets
  // (verified against a real sample: an entire promo set's cards all
  // reported `"rarity": "Promo"`, not one of the six tiers above).
  //
  // "Epic" added per explicit staff confirmation (seen on real cards) —
  // not yet independently verified against a Lorcast API sample the way
  // the six tiers above were, so its exact position in the rarity ladder
  // relative to Super Rare/Legendary is a best guess, not researched.
  // Revisit the ordering if a real sample surfaces.
  Lorcana: ["Common", "Uncommon", "Rare", "Super Rare", "Epic", "Legendary", "Enchanted", "Promo"],
  // Star Wars: Unlimited's four pull-structure rarities, each with its own
  // distinct gemstone symbol/color at the bottom of the card (confirmed via
  // multiple community rarity guides): grey/clear (Common), green
  // (Uncommon), blue (Rare), and a gold/yellow STAR — not a gemstone, the
  // one shape break in the pattern — for Legendary. Plus "Special", a real
  // fifth value confirmed directly against a real API response sample
  // (swuapi.com's own docs quote the API's `rarity` field as accepting it)
  // and independently corroborated by community sources describing a
  // distinct "Special" rarity slot cards (including some Leaders) can have
  // — deliberately NOT given scan-detection visual guidance in
  // scan-binder-page below, since no confirmed distinguishing symbol/color
  // was found for it the way the other four have one; staff can still pick
  // it from this list by hand.
  //
  // Deliberately excludes Hyperspace/Showcase/Prestige — confirmed via a
  // real swu-db.com card listing (a Rare card reporting Rarity: Rare with
  // separate variants Original/Hyperspace/Foil/Hyperspace Foil) to be a
  // genuinely independent finish/treatment axis layered on top of any base
  // rarity, not a rarity tier itself — see PRINTING_OPTIONS_BY_GAME.SWU.
  //
  // "Promo" is appended too, despite only weak (non-API) evidence it's a
  // real rarity value for this game — same explicit staff-convenience
  // exception as Magic/Yugioh/One Piece above.
  //
  // "Serialized" added per explicit staff request — this reverses an
  // earlier call in this file (see PRINTING_OPTIONS_BY_GAME.SWU) that
  // excluded it from the curated Printing list as event/distribution-tied
  // vocabulary. Staff specifically want it selectable as a Rarity instead,
  // so it lives here rather than in Printing.
  SWU: ["Common", "Uncommon", "Rare", "Legendary", "Special", "Serialized", "Promo"],
  // Riftbound's four functional/pull-structure rarities, each with its own
  // frame style AND gem shape (confirmed via multiple community rarity
  // guides): bronze frame + round gem (Common), silver frame + triangular
  // gem (Uncommon), gold full-art frame with foil + square gem (Rare),
  // minimalist gold frame with foil + pentagonal gem (Epic). Plus two more
  // real, confirmed values: `Showcase` — the chase rarity above Epic,
  // foil-only, no colored frame at all (full art) — and `Promo`. Unlike
  // SWU/Lorcana/Magic, Riftbound's Alternate Art/Overnumbered/Signature
  // collector versions are NOT a separate axis from rarity — research
  // confirmed all three are sub-flavors that still report Showcase as
  // their own `rarity` value, distinguished from each other only by their
  // collector-number notation (an "a" suffix, an unmarked number above the
  // set's total, or an asterisk) — so they belong in
  // PRINTING_OPTIONS_BY_GAME.Riftbound below instead, not here.
  Riftbound: ["Common", "Uncommon", "Rare", "Epic", "Showcase", "Promo"],
  // Gundam Card Game's six official rarity abbreviations, each printed as
  // its own letter code next to the collector number (confirmed via
  // multiple community rarity guides, cross-referenced for consistency):
  // Common (C), Uncommon (U), Rare (R), Legend Rare (LR — the marquee
  // mobile suits), Special (SP — premium alt-art REPRINTS of existing
  // cards, keeping their original card number, not a new print), and
  // Promo (P — event/organized-play printings outside the booster
  // ladder).
  //
  // Deliberately excludes the "+"/"++" alt-art suffix system (e.g. C+,
  // LR++) — confirmed via research to be an overlay applied on TOP of any
  // of the six rarities above (an alt-art LR+ still plays as, and shares
  // its card number with, the base LR — only the art/foil differs), same
  // rarity-vs-finish split as One Piece's star-marked Parallel/Alternate
  // Art overlay. See PRINTING_OPTIONS_BY_GAME.Gundam.
  Gundam: ["Common", "Uncommon", "Rare", "Legend Rare", "Special", "Promo"],
};

// Printing/finish field's curated options (EditModal/ScannerPanel) — same
// select-plus-escape-hatch pattern as Rarity/Condition. These five are real,
// current TCGPlayer price-variant categories (the same ones
// POKEMON_PRICE_VARIANTS in cardSearch.js reads price data by — confirmed
// directly against live API responses this session, not guessed).
//
// Deliberately excludes two things found during research specifically to
// avoid getting this wrong:
// - Poke Ball/Master Ball/Love Ball/Friend Ball/Quick Ball/Dusk Ball-style
//   reverse holo patterns. These are real (Prismatic Evolutions introduced
//   Poke Ball + Master Ball in Jan 2025; Ascended Heroes expanded to five
//   ball types in Jan 2026) and share the same collector number as the
//   plain card — a genuine printing/finish distinction, not a different
//   print. But the vocabulary keeps growing with each new set, so hardcoding
//   today's list would need manual upkeep forever and go stale the moment
//   a new set ships. Staff enter these through the free-text escape hatch
//   instead (explicit call — see CLAUDE.md).
// - "Shadowless". Looks like a finish variant but isn't one: TCGPlayer
//   models it as its own separate Set ("Base Set (Shadowless)"), distinct
//   from "Base Set" — a Set-field distinction, not a Printing/finish one.
//   Including it here would have been a real modeling mistake.
export const PRINTING_OPTIONS_BY_GAME = {
  Pokemon: ["Normal", "Holofoil", "Reverse Holofoil", "1st Edition Normal", "1st Edition Holofoil"],
  // Scryfall's `finishes` field (confirmed via its own API blog post
  // announcing it, not guessed) is the actual, complete list of Magic
  // finish/printing values: nonfoil, foil, etched, and glossy — pricing
  // (scryfallPrice in cardSearch.js) reads by these same four names.
  //
  // Deliberately excludes frame/border TREATMENTS — Showcase, Extended Art,
  // Borderless, Full Art, etc. (Scryfall's separate `frame_effects` field) —
  // even though they look like finish variants at a glance. Same modeling
  // trap as Pokemon's "Shadowless" exclusion above: a treatment is a
  // different ATTRIBUTE of the same finish (a Showcase card can independently
  // be foil or nonfoil), not a finish itself, and TCGPlayer lists them as
  // their own product line/title variant rather than a finish dropdown
  // value. Belongs in the Set/Notes fields (already free text) if it needs
  // recording at all, not here. Marketing-only finish names seen on real
  // product (Secret Lair's "Rainbow Foil", "Surge Foil", "gold-etched") are
  // also left out — they're presentation names for finishes Magic's own API
  // already tracks as plain "foil"/"etched", not additional API-level
  // values, so adding them would just be duplicate vocabulary for the same
  // four real options.
  Magic: ["Nonfoil", "Foil", "Etched", "Glossy"],
  // Unlike Magic/Pokemon, a Yu-Gi-Oh print's RARITY tier already implies a
  // specific foil/holo treatment (e.g. Ultra Rare always means holo card
  // name + art) — there's no independent "foil vs. nonfoil" axis the way
  // the other two games have. The genuinely separate, real printing/edition
  // concept for Yu-Gi-Oh is instead 1st Edition vs. Unlimited Edition —
  // Konami prints every retail product 1st Edition for an initial run, then
  // switches to Unlimited Edition for later reprints, with a separate
  // Limited Edition used for certain promos (Sneak Peek/Championship Series
  // prize cards). Confirmed via Yugipedia's edition pages and TCGPlayer's
  // own price-guide edition options, not guessed. Evergreen, non-expanding
  // vocabulary — no ball-pattern-style exclusion needed here.
  Yugioh: ["1st Edition", "Unlimited Edition", "Limited Edition"],
  // Same rarity-vs-finish split as Yu-Gi-Oh above, but the other way around:
  // a One Piece print's base rarity code (Common/Rare/SR/etc., see
  // RARITY_OPTIONS_BY_GAME["One Piece"]) already implies its default foil
  // treatment (Common/Uncommon are non-foil, Rare gets an accent foil,
  // Super Rare and above are full holo — confirmed via research, not
  // guessed), so there's no separate foil/nonfoil toggle to offer here.
  // The genuinely independent axis is instead the star-marked overlay
  // treatment ("Parallel"/"Alternate Art" — the same thing, confirmed via
  // research; picking one name to avoid offering duplicate options for one
  // real value) that swaps in different artwork on top of any base rarity
  // without changing the card's stats or text.
  "One Piece": ["Normal", "Alternate Art"],
  // Unlike Yu-Gi-Oh/One Piece above, Lorcana's rarity and finish ARE
  // genuinely independent axes — confirmed via research: every one of the
  // six numbered-set cards at Common/Uncommon/Rare/Super Rare/Legendary
  // exists in both a foil and a non-foil printing (real `prices.usd` vs.
  // `prices.usd_foil` fields on the same Lorcast card object confirm both
  // exist), with Enchanted being the one rarity that's foil-only. Since
  // that foil-only-ness is already captured by picking "Enchanted" in the
  // Rarity field, this list only needs the two real, evergreen finish
  // values themselves.
  Lorcana: ["Normal", "Foil"],
  // Same independent-axis model as Lorcana above — confirmed via a real
  // swu-db.com card listing (see RARITY_OPTIONS_BY_GAME.SWU) that a base
  // rarity like Rare can independently be Original, Hyperspace, Foil, or
  // Hyperspace Foil, with Showcase and Prestige as further, rarer premium
  // treatments layered the same way. "Prestige Foil" added alongside
  // "Prestige" per explicit staff request — same foiled/non-foiled pairing
  // as Hyperspace/Hyperspace Foil above, not independently re-confirmed via
  // a new API sample. Deliberately excludes the promo/distribution-specific
  // variant names also seen in research (Serialized — which staff instead
  // asked for as a Rarity value, see RARITY_OPTIONS_BY_GAME.SWU — Weekly
  // Play Promo/Foil, Prerelease Promo, Convention Exclusive, Judge Promo) —
  // same "ever-expanding, event-tied vocabulary belongs in the free-text
  // escape hatch" call as Pokemon's Poke Ball pattern exclusion and
  // Yu-Gi-Oh's Parallel Rare exclusion above.
  SWU: ["Normal", "Foil", "Hyperspace", "Hyperspace Foil", "Showcase", "Prestige", "Prestige Foil"],
  // Same rarity-vs-finish split as Yu-Gi-Oh/One Piece, not SWU/Lorcana/
  // Magic: a Riftbound print's base rarity (Common/Uncommon/Rare/Epic)
  // already implies its default foil treatment (Common/Uncommon are
  // plain, Rare/Epic get an inherent foil pattern as part of that rarity's
  // frame style — confirmed via research, not guessed), so there's no
  // independent foil/nonfoil toggle to offer. The genuinely separate axis
  // is instead WHICH of the three real Showcase-rarity print styles a
  // Showcase card is — Alternate Art / Overnumbered / Signature (see
  // RARITY_OPTIONS_BY_GAME.Riftbound for why these live here and not as
  // their own rarity values) — plus a plain "Normal" default for every
  // non-Showcase card.
  Riftbound: ["Normal", "Alternate Art", "Overnumbered", "Signature"],
  // Same rarity-vs-finish split as One Piece/Yu-Gi-Oh/Riftbound above: a
  // Gundam print's base rarity letter (C/U/R/LR/SP/P) already implies its
  // default treatment, so the real separate axis is the "+"/"++" alt-art
  // overlay confirmed via research — "+" is a standard alt-art foil
  // (extended/borderless art, brighter foil), "++" is the scarcest
  // "case hit" pull, confirmed to use a visually distinct GOLD foil
  // treatment rather than just being a rarer copy of the same "+" look.
  // Both exist on every set (an evergreen, non-expanding pair of concepts,
  // unlike Pokemon's per-set Poke Ball patterns), so both get their own
  // entry here rather than being collapsed into one or excluded.
  Gundam: ["Normal", "Alternate Art", "Alternate Art (Case Hit)"],
};

// Three real values now: 'single' (default), 'slab' (grader/grade/cert —
// see detectGrading above), and 'bulk' (a location+game-scoped running
// count, no individual card identity — see buildBulkCatalogItem below).
// Substring match rather than exact, same as the original slab-only
// coercion, so a stray case/whitespace variant from an import column still
// lands on the right value instead of silently collapsing to 'single'.
function normalizeItemType(raw) {
  const t = (raw || "").toString().toLowerCase();
  if (t.indexOf("slab") !== -1) return "slab";
  if (t.indexOf("bulk") !== -1) return "bulk";
  return "single";
}

export function normalizeCard(c) {
  return {
    sku: c.sku || "",
    name: c.name || "Unnamed",
    set: c.set || "",
    game: canonicalizeGame(c.game),
    condition: c.condition || "",
    printing: c.printing || "",
    // A real catalog attribute now (was a transient, never-saved search
    // hint before) — see phase7_rarity_column.sql. Free text, same as
    // condition/printing; RARITY_OPTIONS_BY_GAME is just curated suggestions
    // for the picker, not a hard constraint on what can be saved here.
    rarity: c.rarity || "",
    qty: Number(c.qty) || 0,
    price: parseMoney(c.price),
    notes: c.notes || "",
    imageUrl: c.imageUrl || "",
    itemType: normalizeItemType(c.itemType),
    grader: c.grader || "",
    grade: c.grade || "",
    certNumber: c.certNumber || "",
    sourceUrl: c.sourceUrl || "",
    location: c.location || "",
    imageData: c.imageData || "",
    sold: (c.sold === true || c.sold === "true" || c.sold === "TRUE" || c.sold === "1" || (typeof c.sold === "string" && /^\s*sold\s*$/i.test(c.sold))),
    lastUpdated: c.lastUpdated || Date.now(),
    // Reminder checkboxes for whether this item's listing is up to date on
    // each platform — reset to false whenever a relevant field changes (see
    // the reset logic in App.jsx), not here, since this function also runs on
    // every read from the database and shouldn't wipe stored true values.
    posSynced: !!c.posSynced,
    tcgplayerSynced: !!c.tcgplayerSynced,
    collectrSynced: !!c.collectrSynced,
    // Which platforms this item is actually meant to be listed on — not
    // every item lives everywhere (some are in-store only). Defaults to
    // true so existing rows keep today's "assumed everywhere" behavior.
    posChannel: c.posChannel !== false,
    tcgplayerChannel: c.tcgplayerChannel !== false,
    collectrChannel: c.collectrChannel !== false,
    // NM reference price captured from whichever card candidate staff
    // actually selected in image search — the basis for the computed
    // Market Value shown next to Our Price (`price`). Never guessed;
    // stays null until a search result with a real price gets picked.
    basePrice: parseMoney(c.basePrice),
    // What the shop actually paid for this item, per unit (same per-unit
    // convention as `price` — see computeSalesReport in reportUtils.js,
    // which multiplies both by qty to get a sale's real totals). Never
    // guessed — stays null until staff enter it by hand, or until a
    // Quote-tab trade-in's cost auto-computes from the quote's own real
    // payout (see quoteUtils.js's computeQuoteItemCosts). See CLAUDE.md's
    // "Cost tracking" section.
    cost: parseMoney(c.cost),
    // Dual-image model (Sprint 6): imageUrl/imageData above are the "stock"
    // reference (card search/manual paste); photoUrl/photoData are a real
    // photo (scanner crop or manual upload). activeImage records which one
    // staff want shown — see resolveActiveImage, which falls back to
    // whichever slot isn't blank if the preferred one is.
    photoUrl: c.photoUrl || "",
    photoData: c.photoData || "",
    activeImage: c.activeImage === "stock" ? "stock" : "photo",
  };
}

// Best-guess channel defaults for a new item: match whatever the majority of
// existing items already in this same binder/case use, since staff almost
// always add several cards from the same case in a row and it's already
// been decided where that case lives. Falls back to "everywhere" for a
// brand-new location or when nothing else is known yet.
export function channelDefaultsForLocation(catalog, location) {
  const fallback = { posChannel: true, tcgplayerChannel: true, collectrChannel: true };
  if (!location) return fallback;
  const siblings = catalog.filter(c => c.location === location);
  if (!siblings.length) return fallback;
  const majority = (field) => siblings.filter(c => c[field]).length >= siblings.length / 2;
  return {
    posChannel: majority('posChannel'),
    tcgplayerChannel: majority('tcgplayerChannel'),
    collectrChannel: majority('collectrChannel'),
  };
}

// Bulk is a catalog row (itemType 'bulk') scoped to one (location, game)
// pair rather than one physical print — see phase10_sorting_bulk.sql for
// the full reasoning. findBulkRow locates the existing row for a given
// binder+game, if this isn't the first card sorted there yet.
export function findBulkRow(catalog, location, game) {
  const canonicalGame = canonicalizeGame(game);
  return catalog.find(c => c.itemType === 'bulk' && c.location === location && c.game === canonicalGame) || null;
}

// Builds the catalog row a Sorting-queue item becomes once sorted into
// Bulk: either the existing (location, game) row with its qty incremented
// by this item's qty, or — the first card sorted into that binder+game —
// a brand-new one. A Bulk row carries no per-item identity (no set/
// rarity/condition/price, matching "should not hold an inventory" of
// individual prints) and is never individually listed on any platform —
// posChannel/tcgplayerChannel/collectrChannel are always false here,
// unlike a normal new item's "assumed everywhere" default, since a pile
// of loose bulk cards isn't a sellable SKU on its own.
export function buildBulkCatalogItem(sortingItem, location, existingRow) {
  const game = canonicalizeGame(sortingItem.game);
  const addQty = Number(sortingItem.qty) || 1;
  if (existingRow) {
    return { ...existingRow, qty: existingRow.qty + addQty, lastUpdated: Date.now() };
  }
  return normalizeCard({
    sku: `bulk-${Date.now()}`,
    name: `Bulk — ${game}`,
    game,
    itemType: 'bulk',
    location,
    qty: addQty,
    posChannel: false,
    tcgplayerChannel: false,
    collectrChannel: false,
  });
}

// A ticket only needs stamping on the platforms it was actually relevant to
// at sale time — a channel the item wasn't listed on counts as trivially
// satisfied so it doesn't block "complete" or show up as a stamp to make.
export function isTicketComplete(t) {
  return (!t.posChannel || t.posDone) && (!t.tcgplayerChannel || t.tcgplayerDone) && (!t.collectrChannel || t.collectrDone);
}

// Fields that, when changed, mean a listing may now be wrong on every
// platform — used to decide when to reset the three status checkboxes above.
export const PLATFORM_RESET_FIELDS = ['price', 'qty', 'condition', 'sold'];

export function needsPlatformStatusReset(existing, next) {
  if (!existing) return true; // brand new item
  return PLATFORM_RESET_FIELDS.some(f => existing[f] !== next[f]);
}

export function timeAgo(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + "d ago";
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Default condition-multiplier table (percent of NM) — anchored to
// CrystalCommerce's confirmed 100%/50% NM-to-Damaged default, centered on
// community-cited ranges (see CLAUDE.md). Store-configurable via
// store_settings; this is only the fallback before that loads.
export const DEFAULT_CONDITION_MULTIPLIERS = { NM: 100, LP: 85, MP: 65, HP: 45, DMG: 25 };

// The five recognized condition tiers with their full display names, in
// NM-first order — the Condition field's dropdown (EditModal/ScannerPanel)
// and SettingsModal's editable multiplier rows both read from this one
// list instead of keeping their own separate copies of the same names.
// Each full name is already a recognized alias in CONDITION_ALIASES below
// (e.g. "near mint" → NM), so picking one from the dropdown round-trips
// through canonicalizeCondition with no changes needed there.
export const CONDITION_TIERS = [
  { key: "NM", name: "Near Mint" },
  { key: "LP", name: "Lightly Played" },
  { key: "MP", name: "Moderately Played" },
  { key: "HP", name: "Heavily Played" },
  { key: "DMG", name: "Damaged" },
];
export const CONDITION_OPTIONS = CONDITION_TIERS.map(t => t.name);

const CONDITION_ALIASES = {
  nm: "NM", "near mint": "NM", mint: "NM", m: "NM",
  lp: "LP", "lightly played": "LP", "light play": "LP", "slightly played": "LP", sp: "LP",
  mp: "MP", "moderately played": "MP", "moderate play": "MP",
  hp: "HP", "heavily played": "HP", "heavy play": "HP",
  dmg: "DMG", damaged: "DMG", poor: "DMG", d: "DMG",
};

// Condition stays free text in the form (staff write "NM", "Near Mint",
// "nm" inconsistently) — this maps whatever's typed onto one of the five
// multiplier tiers, or null if it doesn't recognize it at all (a genuinely
// unrecognized condition shouldn't silently get treated as NM/100%).
export function canonicalizeCondition(raw) {
  const c = (raw || "").toString().trim().toLowerCase();
  if (!c) return null;
  return CONDITION_ALIASES[c] || null;
}

// basePrice is the NM reference price; multipliers is the store's
// configured (or default) percent-of-NM table. Returns null rather than
// guessing if either input is missing or the condition isn't recognized.
export function marketValueForCondition(basePrice, condition, multipliers) {
  if (basePrice == null) return null;
  const tier = canonicalizeCondition(condition);
  if (!tier) return null;
  const pct = tier === "NM" ? 100 : (multipliers && multipliers[tier]);
  if (pct == null) return null;
  return Math.round(basePrice * pct) / 100;
}

// "Round price" buttons (Catalog Edit modal, Scanner review rows, Quote line
// items) — round to the nearest whole dollar, up or down, rather than a
// single nearest-dollar rounding, per the actual ask: two explicit
// directions so staff pick which way a price like $13.43 moves instead of
// having that decided for them. Cents are rounded to a real integer first
// (floating-point money math can otherwise land a whole-dollar price like
// 13 on 12.999999999998) before ceil/floor, so an already-whole price is a
// no-op in either direction.
export function roundPriceUp(price) {
  if (price == null || price === "" || !isFinite(price)) return price;
  return Math.ceil(Math.round(price * 100) / 100);
}

export function roundPriceDown(price) {
  if (price == null || price === "" || !isFinite(price)) return price;
  return Math.floor(Math.round(price * 100) / 100);
}

// A url/data pair follows the same convention throughout the app: url ===
// 'local' means the real image lives in the data column (a client-resized
// data: URI); otherwise url is used directly if it's a real http(s) link.
// Returns null if neither is actually populated.
function resolveSrc(url, data) {
  if (url === "local" && data) return data;
  if (url && url.startsWith("http")) return url;
  return null;
}

// Which image slot ("stock" or "photo") should actually be displayed for
// this item. Honors the stored preference (activeImage), but falls back to
// whichever slot actually has something if the preferred one is blank —
// "it defaults to any that is not blank."
export function resolveActiveImage(card) {
  const stockSrc = resolveSrc(card.imageUrl, card.imageData);
  const photoSrc = resolveSrc(card.photoUrl, card.photoData);
  const preferred = card.activeImage === "stock" ? "stock" : "photo";
  if (preferred === "stock") return stockSrc ? "stock" : (photoSrc ? "photo" : "stock");
  return photoSrc ? "photo" : (stockSrc ? "stock" : "photo");
}

// The actual src string (http URL or data: URI) to render for whichever
// slot resolveActiveImage picks, or null if neither slot has anything.
export function activeImageSrc(card) {
  const which = resolveActiveImage(card);
  return which === "stock" ? resolveSrc(card.imageUrl, card.imageData) : resolveSrc(card.photoUrl, card.photoData);
}

export const SORT_COLUMNS = {
  name: c => (c.name || "").toLowerCase(),
  sku: c => (c.sku || "").toLowerCase(),
  qty: c => c.qty,
  price: c => c.price === null || c.price === undefined ? -Infinity : c.price,
  updated: c => c.lastUpdated ? new Date(c.lastUpdated).getTime() : 0,
};

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// A binder page commonly holds several physical copies of the exact same
// print (bulk commons, promos handed out in multiples) — real-world use
// found the scanner leaving these as N separate qty-1 review rows instead
// of one qty-N row, which staff then had to notice and merge by hand.
//
// Deliberately keyed on Name + collector Number together, not Name alone —
// confirmed with the user against a real photo of three visually-identical
// "The One Ring" serialized cards that actually carried three DIFFERENT
// collector numbers (each a genuine one-of-one print, not three copies of
// anything) sitting next to three real physical copies of a promo that all
// shared one number. Merging by name alone would have collapsed the
// serialized ones together too, which is wrong — a different Number on an
// otherwise-identical-looking card usually means a genuinely different
// print, not a duplicate. A row with no Number captured at all is left
// alone rather than merged on name alone, same "don't guess when getting
// it wrong is worse than doing nothing" discipline as everywhere else in
// this file — Number is frequently left blank by the scan (small, blurry
// text), and guessing two blank-Number rows are duplicates risks silently
// losing a real second copy of a genuinely different print.
//
// Only used for the scanner's own review queue, before anything is saved —
// this has nothing to do with matching a newly scanned card against
// something already in the catalog (a separate, unbuilt feature).
// The identity rule behind mergeScanDuplicates, on its own so the stack
// scanner can ask "is this card already in the stack?" one card at a time
// with exactly the same rule. null = not safe to merge (no name or no
// number captured — see mergeScanDuplicates for why Name alone isn't enough).
export function scanDuplicateKey(row) {
  const name = ((row && row.name) || "").trim().toLowerCase();
  // Leading zeros are an OCR/formatting detail, not a different print —
  // "0451" and "451" should still be recognized as the same number.
  const number = ((row && row.number) || "").trim().replace(/^0+(?=\d)/, "");
  return name && number ? `${row.game}::${name}::${number}` : null;
}

export function mergeScanDuplicates(rows) {
  const indexByKey = new Map();
  const merged = [];
  for (const row of rows) {
    const key = scanDuplicateKey(row);

    if (key && indexByKey.has(key)) {
      const i = indexByKey.get(key);
      const existing = merged[i];
      merged[i] = {
        ...existing,
        qty: (existing.qty || 0) + (row.qty || 1),
        position: [existing.position, row.position].filter(Boolean).join(", "),
        // Surfaces the least-confident detection among the merged copies
        // rather than hiding it behind whichever copy happened to scan
        // first — still worth a second look even if only one copy read as
        // "low".
        confidence: (CONFIDENCE_RANK[row.confidence] ?? 1) < (CONFIDENCE_RANK[existing.confidence] ?? 1)
          ? row.confidence : existing.confidence,
      };
      continue;
    }

    merged.push(row);
    if (key) indexByKey.set(key, merged.length - 1);
  }
  return merged;
}
