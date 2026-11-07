// Hot cards (CLAUDE.md "Hot cards"): tells staff, while quoting, that a
// card is sought after, and why. Four signals, each matched by game + name:
//   * meta:  played in a good share of recent tournament decklists
//            (meta_cards, rebuilt daily from Limitless and TopDeck.gg)
//   * sales: we sold several copies recently (sales)
//   * price: its market price climbed (price_movers, from the daily price check)
//   * list:  staff put it on the hot list by hand (hot_cards)

// A meta claim needs enough decklists behind it, and a real share of them.
export const META_MIN_DECKS = 20;
export const META_MIN_SHARE_PCT = 10;
// "Selling fast": at least this many copies sold in the last SALES_WINDOW_DAYS.
export const SALES_MIN_COPIES = 3;
export const SALES_WINDOW_DAYS = 30;
// "Price climbing": up at least this much over the price_movers window.
export const PRICE_MIN_RISE_PCT = 20;

export const META_SOURCES = {
  limitless: { label: 'Limitless', url: 'https://play.limitlesstcg.com' },
  topdeck: { label: 'TopDeck.gg', url: 'https://topdeck.gg' },
};

// The same name normalization meta-check uses for meta_cards.name_key
// (duplicated there, per this repo's no-shared-code-with-Edge-Functions
// convention): case, accents and curly apostrophes don't matter, a
// double-faced card matches by its front face, and the notes staff type
// into a name ("(Full Art)", "[W Stamped]", "4/102", "- 051") are ignored.
export function hotNameKey(name) {
  let n = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  n = n.replace(/[‘’]/g, "'").toLowerCase();
  const face = n.indexOf(' // ');
  if (face > 0) n = n.slice(0, face);
  n = n.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  // A number after a space or dash only, so "Porygon2" stays itself.
  n = n.replace(/(\s+|\s*-\s*)#?\d+(\/\d+)?$/, '').trim();
  // Black & White-era "Virizion-EX" vs later "Dialga EX".
  n = n.replace(/-(ex|gx)\b/g, ' $1');
  return n.replace(/\s+/g, ' ').trim();
}

// Games where one name covers many different cards (One Piece has dozens
// of "Nami"s): tournament play is matched by the printed card code
// ("OP13-016"), so a quote row needs its number filled in. Same as
// meta-check's CODE_GAMES (supabase/functions/meta-check/decks.ts).
export const CODE_GAMES = new Set(['One Piece', 'Gundam']);

// "OP13" + "016" -> "OP13-16"; also takes a full code as the number
// ("OP13-016"). Leading zeros don't matter. Same as meta-check's cardCode.
export function cardCode(set, number) {
  const num = String(number ?? '').trim().toUpperCase();
  const full = num.match(/^([A-Z0-9]+)-0*(\w+)$/);
  if (full) return `${full[1]}-${full[2]}`;
  const st = String(set ?? '').trim().toUpperCase();
  const n = num.replace(/^0+(?=\w)/, '');
  return st && n ? `${st}-${n}` : '';
}

function metaKey(game, nameKey, code) {
  return CODE_GAMES.has(game) ? `${game}|${nameKey}#${code || ''}` : `${game}|${nameKey}`;
}

function key(game, name) {
  return `${game || ''}|${hotNameKey(name)}`;
}

export function rowToMetaCard(r) {
  return {
    source: r.source, game: r.game || '', format: r.format || '', name: r.name || '',
    nameKey: r.name_key || hotNameKey(r.name), code: r.code || '', decks: Number(r.decks) || 0,
    totalDecks: Number(r.total_decks) || 0, copies: Number(r.copies) || 0,
    events: Number(r.events) || 0, windowDays: Number(r.window_days) || 0,
    updatedAt: r.updated_at || null,
  };
}

export function rowToHotCard(r) {
  return {
    id: r.id, game: r.game || '', name: r.name || '', reason: r.reason || '',
    addedBy: r.added_by || '', createdAt: r.created_at || null,
  };
}

export function hotCardToRow(h) {
  return {
    game: h.game || '',
    name: String(h.name ?? '').trim(),
    reason: String(h.reason ?? '').trim(),
    added_by: String(h.addedBy ?? '').trim(),
  };
}

export function rowToPriceMover(r) {
  return {
    sku: r.sku, name: r.name || '', game: r.game || '',
    firstPrice: Number(r.first_price), lastPrice: Number(r.last_price),
    firstAt: r.first_at || null, lastAt: r.last_at || null, pctChange: Number(r.pct_change),
  };
}

export function metaSharePct(m) {
  return m.totalDecks > 0 ? Math.round((m.decks / m.totalDecks) * 100) : 0;
}

export function formatLabel(format) {
  if (!format) return '';
  if (format === 'EDH') return 'Commander';
  if (format === 'STANDARD') return 'Standard';
  return format.charAt(0) + format.slice(1);
}

// One lookup built from all four signals; quote rows ask it per card.
export function buildHotIndex({ meta = [], hotList = [], sales = [], movers = [], now = Date.now() } = {}) {
  const index = new Map();
  const add = (k, reason) => {
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(reason);
  };

  // Meta: the best qualifying format per source.
  const bestMeta = new Map();
  for (const m of meta) {
    if (m.totalDecks < META_MIN_DECKS) continue;
    const share = metaSharePct(m);
    if (share < META_MIN_SHARE_PCT) continue;
    const k = metaKey(m.game, m.nameKey, m.code);
    const prev = bestMeta.get(`${k}|${m.source}`);
    if (!prev || share > prev.share) bestMeta.set(`${k}|${m.source}`, { k, share, m });
  }
  for (const { k, share, m } of bestMeta.values()) {
    const fmt = formatLabel(m.format);
    add(k, {
      kind: 'meta', source: m.source, share,
      text: `${m.code ? `${m.code}: in` : 'In'} ${share}% of ${m.game}${fmt ? ` ${fmt}` : ''} decks (${m.decks} of ${m.totalDecks}, last ${m.windowDays} days)`,
    });
  }

  // Sales: copies sold recently, refunds left out (they came back).
  const since = now - SALES_WINDOW_DAYS * 86400000;
  const sold = new Map();
  for (const s of sales) {
    if (s.refundedAt || !s.name) continue;
    if ((s.soldAt || 0) < since) continue;
    const k = key(s.game, s.name);
    const prev = sold.get(k) || { copies: 0, lastPrice: null, lastAt: 0, name: s.name, game: s.game || '' };
    prev.copies += Number(s.qtySold) || 0;
    if ((s.soldAt || 0) >= prev.lastAt) { prev.lastAt = s.soldAt || 0; prev.lastPrice = s.salePrice; }
    sold.set(k, prev);
  }
  for (const [k, v] of sold) {
    if (v.copies < SALES_MIN_COPIES) continue;
    const last = v.lastPrice == null ? '' : `, last at $${Number(v.lastPrice).toFixed(2)}`;
    add(k, { kind: 'sales', name: v.name, game: v.game, copies: v.copies, text: `We sold ${v.copies} in the last ${SALES_WINDOW_DAYS} days${last}` });
  }

  // Price: the biggest rise among our tracked copies of the card.
  const rise = new Map();
  for (const p of movers) {
    if (!Number.isFinite(p.pctChange) || p.pctChange < PRICE_MIN_RISE_PCT) continue;
    const k = key(p.game, p.name);
    if (!rise.has(k) || p.pctChange > rise.get(k).pctChange) rise.set(k, p);
  }
  for (const [k, p] of rise) {
    add(k, {
      kind: 'price', name: p.name, game: p.game, pct: p.pctChange,
      text: `Market price up ${Math.round(p.pctChange)}% this month ($${p.firstPrice.toFixed(2)} → $${p.lastPrice.toFixed(2)})`,
    });
  }

  for (const h of hotList) {
    add(key(h.game, h.name), { kind: 'list', text: h.reason ? `Hot list: ${h.reason}` : 'On the hot list', hotId: h.id });
  }
  return index;
}

const KIND_ORDER = { list: 0, meta: 1, sales: 2, price: 3 };

// Reasons a card is hot, list entries first. A quote row with no game yet
// still gets a heads-up, from any game with the same card name (except
// tournament play in code-matched games, which needs the card's code).
// The index grouped by name key, built once per index (quote rows ask on
// every render).
const byNameCache = new WeakMap();
function entriesByName(index) {
  let byName = byNameCache.get(index);
  if (!byName) {
    byName = new Map();
    for (const [k, reasons] of index) {
      const bar = k.indexOf('|');
      const rest = k.slice(bar + 1);
      const hash = rest.indexOf('#');
      const nameKey = hash >= 0 ? rest.slice(0, hash) : rest;
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push({ game: k.slice(0, bar), code: hash >= 0 ? rest.slice(hash + 1) : null, reasons });
    }
    byNameCache.set(index, byName);
  }
  return byName;
}

export function hotReasonsForCard(card, index) {
  if (!card || !index || !hotNameKey(card.name)) return [];
  const nameKey = hotNameKey(card.name);
  const code = cardCode(card.set, card.number);
  const reasons = [];
  for (const e of entriesByName(index).get(nameKey) || []) {
    if (card.game && e.game !== card.game && e.game !== '') continue;
    // Code-matched entry (One Piece/Gundam tournament play): needs the card's code.
    if (e.code !== null && (!code || e.code !== code)) continue;
    reasons.push(...e.reasons);
  }
  return reasons.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

// Which outside sources a set of reasons came from, so the notice can
// credit them (TopDeck.gg's terms require a visible credit and link).
export function reasonSources(reasons) {
  return [...new Set(reasons.filter(r => r.kind === 'meta').map(r => r.source))]
    .filter(s => META_SOURCES[s]);
}

// The most-played cards for one game, best share first, for the Hot cards
// window. One row per card (its best qualifying format/source).
export function topMetaCards(meta, game, limit = 40) {
  const best = new Map();
  for (const m of meta) {
    if (m.game !== game || m.totalDecks < META_MIN_DECKS) continue;
    const share = metaSharePct(m);
    if (share < META_MIN_SHARE_PCT) continue;
    const k = `${m.nameKey}#${m.code}`;
    if (!best.has(k) || share > best.get(k).share) best.set(k, { ...m, share });
  }
  return [...best.values()].sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)).slice(0, limit);
}

// Every reason of one kind ('sales' or 'price'), biggest first, for the
// Hot cards window.
export function reasonsOfKind(index, kind) {
  const out = [];
  for (const reasons of index.values()) for (const r of reasons) if (r.kind === kind) out.push(r);
  const size = r => (kind === 'sales' ? r.copies : r.pct);
  return out.sort((a, b) => size(b) - size(a));
}

// Latest meta-check run per source, for "updated ..." in the window.
export function metaUpdatedAt(meta) {
  const out = {};
  for (const m of meta) {
    if (!m.updatedAt) continue;
    if (!out[m.source] || m.updatedAt > out[m.source]) out[m.source] = m.updatedAt;
  }
  return out;
}
