// Decklist parsing and tallying for meta-check (CLAUDE.md "Hot cards").
// No Deno-only APIs, so the Vitest suite tests it directly (decks.test.ts);
// index.ts is the only importer.

export type DeckCard = { name: string; count: number; code?: string };

// Games where one name covers many different cards (One Piece has dozens
// of "Nami"s), so a card is counted by its printed code ("OP13-016"), not
// its name. Duplicated in src/lib/hotCards.js (CODE_GAMES); keep in sync.
export const CODE_GAMES = new Set(["One Piece", "Gundam"]);

// "OP13" + "016" -> "OP13-16"; also takes a full code as the number
// ("OP13-016"). Leading zeros don't matter. Same as hotCards.js cardCode.
export function cardCode(set: unknown, number: unknown): string {
  const num = String(number ?? "").trim().toUpperCase();
  const full = num.match(/^([A-Z0-9]+)-0*(\w+)$/);
  if (full) return `${full[1]}-${full[2]}`;
  const st = String(set ?? "").trim().toUpperCase();
  const n = num.replace(/^0+(?=\w)/, "");
  return st && n ? `${st}-${n}` : "";
}

// Same normalization as the app's hotNameKey (src/lib/hotCards.js),
// duplicated per this repo's no-shared-code-with-Edge-Functions convention.
// Keep the two identical: a quote row matches meta_cards by this key.
export function hotNameKey(name: unknown): string {
  let n = String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  n = n.replace(/[‘’]/g, "'").toLowerCase();
  const face = n.indexOf(" // ");
  if (face > 0) n = n.slice(0, face);
  n = n.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  n = n.replace(/\s*-?\s*#?\d+(\/\d+)?$/, "").trim();
  n = n.replace(/-(ex|gx)\b/g, " $1");
  return n.replace(/\s+/g, " ").trim();
}

// Cards every deck plays by the rules of the game, not by choice: they'd
// show up as "in 90% of decks" and tell staff nothing.
const POKEMON_BASIC_ENERGY = /^(basic )?(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy) energy$/i;
const MAGIC_BASIC_LAND = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i;
// Deck sections that are resources, not card choices (Riftbound's runes),
// or not part of the deck at all.
const SKIPPED_SECTIONS = new Set(["runes", "rune deck", "maybeboard", "maybe board", "tokens", "metadata"]);

export function isBasicCard(game: string, name: string): boolean {
  if (game === "Pokemon") return POKEMON_BASIC_ENERGY.test(name.trim());
  if (game === "Magic") return MAGIC_BASIC_LAND.test(name.trim());
  return false;
}

function addCard(out: DeckCard[], name: unknown, count: unknown, code = "") {
  const n = String(name ?? "").trim();
  const c = Math.max(1, Math.trunc(Number(count) || 1));
  if (n) out.push(code ? { name: n, count: c, code } : { name: n, count: c });
}

// Limitless: { section: [{ count, name, set, number }], leader: { name, ... } }.
export function limitlessDeckCards(decklist: unknown): DeckCard[] {
  const out: DeckCard[] = [];
  if (!decklist || typeof decklist !== "object") return out;
  for (const [section, value] of Object.entries(decklist as Record<string, unknown>)) {
    if (SKIPPED_SECTIONS.has(section.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const c of value) {
        if (c && typeof c === "object") addCard(out, (c as any).name, (c as any).count, cardCode((c as any).set, (c as any).number));
      }
    } else if (value && typeof value === "object" && "name" in (value as any)) {
      addCard(out, (value as any).name, 1, cardCode((value as any).set, (value as any).number));
    }
  }
  return out;
}

// TopDeck.gg: structured deckObj { section: { "Card Name": { count } } }
// when available, else the decklist text ("~~Mainboard~~\n4 Brainstorm").
// A decklist that's only a link (to an outside deck site) has no cards.
export function topdeckDeckCards(player: { decklist?: unknown; deckObj?: unknown }): DeckCard[] {
  const out: DeckCard[] = [];
  const obj = player?.deckObj;
  if (obj && typeof obj === "object") {
    for (const [section, cards] of Object.entries(obj as Record<string, unknown>)) {
      if (SKIPPED_SECTIONS.has(section.toLowerCase())) continue;
      if (!cards || typeof cards !== "object" || Array.isArray(cards)) continue;
      for (const [name, info] of Object.entries(cards as Record<string, unknown>)) {
        // Real cards carry a count; anything else (stray metadata) isn't a card.
        if (info && typeof info === "object" && Number.isFinite(Number((info as any).count))) {
          addCard(out, name, (info as any).count);
        }
      }
    }
    if (out.length) return out;
  }
  const text = typeof player?.decklist === "string" ? player.decklist : "";
  if (!text || /^\s*https?:\/\//i.test(text)) return out;
  let skipping = false;
  // TopDeck's text uses literal "\n" and "\'" escapes.
  const unescaped = text.replace(/\\n/g, "\n").replace(/\\(['"])/g, "$1");
  for (const raw of unescaped.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const section = line.match(/^~~\s*#?(.*?)\s*~~$/);
    if (section) { skipping = SKIPPED_SECTIONS.has(section[1].toLowerCase()); continue; }
    if (skipping) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (m) addCard(out, m[2], m[1]);
  }
  return out;
}

export type Tally = {
  totalDecks: number;
  cards: Map<string, { name: string; nameKey: string; code: string; decks: number; copies: number }>;
};

export function newTally(): Tally {
  return { totalDecks: 0, cards: new Map() };
}

// Counts one decklist: each card once toward "decks that play it", all its
// copies toward "copies". An empty list (nothing parsed) isn't counted.
export function addDeck(tally: Tally, game: string, cards: DeckCard[]) {
  const byCode = CODE_GAMES.has(game);
  const seen = new Map<string, { name: string; nameKey: string; code: string; count: number }>();
  for (const c of cards) {
    if (isBasicCard(game, c.name)) continue;
    const nameKey = hotNameKey(c.name);
    if (!nameKey) continue;
    const code = byCode ? (c.code || "") : "";
    const key = `${nameKey}#${code}`;
    const prev = seen.get(key);
    if (prev) prev.count += c.count;
    else seen.set(key, { name: c.name, nameKey, code, count: c.count });
  }
  if (cards.length === 0) return;
  tally.totalDecks += 1;
  for (const [key, c] of seen) {
    const entry = tally.cards.get(key) || { name: c.name, nameKey: c.nameKey, code: c.code, decks: 0, copies: 0 };
    entry.decks += 1;
    entry.copies += c.count;
    tally.cards.set(key, entry);
  }
}

// The rows to store: cards in at least minSharePct of the decks (the app
// only shows 10%+; keeping 5%+ leaves room to change that without a rerun),
// most-played first, capped.
export function tallyRows(tally: Tally, minSharePct = 5, cap = 400) {
  if (tally.totalDecks === 0) return [];
  const min = (tally.totalDecks * minSharePct) / 100;
  return [...tally.cards.entries()]
    .filter(([, c]) => c.decks >= min)
    .sort((a, b) => b[1].decks - a[1].decks)
    .slice(0, cap)
    .map(([, c]) => ({ nameKey: c.nameKey, code: c.code, name: c.name, decks: c.decks, copies: c.copies }));
}
