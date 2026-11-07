import { describe, it, expect } from 'vitest';
import {
  hotNameKey, cardCode, buildHotIndex, hotReasonsForCard, reasonSources, topMetaCards, rowToMetaCard, reasonsOfKind,
} from './hotCards.js';
import { hotNameKey as edgeHotNameKey, cardCode as edgeCardCode } from '../../supabase/functions/meta-check/decks.ts';

const NOW = Date.UTC(2026, 10, 6);
const daysAgo = (n) => NOW - n * 86400000;

function meta(overrides = {}) {
  return rowToMetaCard({
    source: 'topdeck', game: 'Magic', format: 'EDH', name: 'Sol Ring', name_key: 'sol ring', code: '',
    decks: 700, total_decks: 1000, copies: 700, events: 40, window_days: 30, updated_at: '2026-11-06T13:40:00Z',
    ...overrides,
  });
}

describe('hotNameKey', () => {
  it('ignores case, accents, curly apostrophes and the notes staff type into a name', () => {
    expect(hotNameKey('Pokémon Trader')).toBe('pokemon trader');
    expect(hotNameKey('Lillie’s Clefairy ex')).toBe("lillie's clefairy ex");
    expect(hotNameKey('Sol Ring (Commander Legends) [Foil]')).toBe('sol ring');
    expect(hotNameKey('Charizard 4/102')).toBe('charizard');
    expect(hotNameKey('Snorlax - 051')).toBe('snorlax');
    expect(hotNameKey('Virizion-EX')).toBe('virizion ex');
    // A digit that's part of the name stays.
    expect(hotNameKey('Porygon2')).toBe('porygon2');
  });

  it('matches a double-faced card by its front face', () => {
    expect(hotNameKey('Delver of Secrets // Insectile Aberration')).toBe('delver of secrets');
  });

  it('is the same function meta-check uses for meta_cards.name_key', () => {
    for (const n of ['Pokémon Trader', 'Sol Ring (CMR)', 'Charizard 4/102', 'Virizion-EX', 'A // B', "Boss’s Orders", 'Porygon2', 'Mewtwo - 052']) {
      expect(edgeHotNameKey(n)).toBe(hotNameKey(n));
    }
  });
});

describe('cardCode', () => {
  it('builds a code from set + number, ignoring leading zeros', () => {
    expect(cardCode('op13', '016')).toBe('OP13-16');
    expect(cardCode('', 'OP13-016')).toBe('OP13-16');
    expect(cardCode('OP13', '')).toBe('');
    expect(edgeCardCode('OP13', '016')).toBe('OP13-16');
    expect(edgeCardCode('', 'gd05-069')).toBe(cardCode('', 'gd05-069'));
  });
});

describe('buildHotIndex / hotReasonsForCard', () => {
  it('flags a card played in enough decks, with its share and format', () => {
    const index = buildHotIndex({ meta: [meta()], now: NOW });
    const reasons = hotReasonsForCard({ name: 'Sol Ring', game: 'Magic' }, index);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ kind: 'meta', source: 'topdeck', share: 70 });
    expect(reasons[0].text).toBe('In 70% of Magic Commander decks (700 of 1000, last 30 days)');
    expect(reasonSources(reasons)).toEqual(['topdeck']);
  });

  it('needs enough decklists and a real share before claiming anything', () => {
    const index = buildHotIndex({
      meta: [
        meta({ name: 'Mox Opal', name_key: 'mox opal', decks: 9, total_decks: 10 }),
        meta({ name: 'Island Fish', name_key: 'island fish', decks: 50, total_decks: 1000 }),
      ],
      now: NOW,
    });
    expect(hotReasonsForCard({ name: 'Mox Opal', game: 'Magic' }, index)).toEqual([]);
    expect(hotReasonsForCard({ name: 'Island Fish', game: 'Magic' }, index)).toEqual([]);
  });

  it('keeps only the best format per source', () => {
    const index = buildHotIndex({ meta: [meta(), meta({ format: 'Legacy', decks: 30, total_decks: 100 })], now: NOW });
    const reasons = hotReasonsForCard({ name: 'Sol Ring', game: 'Magic' }, index);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].share).toBe(70);
  });

  it("doesn't match a card from another game", () => {
    const index = buildHotIndex({ meta: [meta()], now: NOW });
    expect(hotReasonsForCard({ name: 'Sol Ring', game: 'Pokemon' }, index)).toEqual([]);
    // No game picked yet: any game counts.
    expect(hotReasonsForCard({ name: 'Sol Ring', game: '' }, index)).toHaveLength(1);
  });

  it('matches One Piece tournament play by card code only', () => {
    const index = buildHotIndex({
      meta: [meta({ source: 'limitless', game: 'One Piece', format: '', name: 'Nami', name_key: 'nami', code: 'OP13-16', decks: 120, total_decks: 400 })],
      now: NOW,
    });
    expect(hotReasonsForCard({ name: 'Nami', game: 'One Piece' }, index)).toEqual([]);
    expect(hotReasonsForCard({ name: 'Nami', game: 'One Piece', set: 'OP09', number: '016' }, index)).toEqual([]);
    const reasons = hotReasonsForCard({ name: 'Nami', game: 'One Piece', set: 'OP13', number: '016' }, index);
    expect(reasons[0].text).toBe('OP13-16: in 30% of One Piece decks (120 of 400, last 30 days)');
    expect(hotReasonsForCard({ name: 'Nami', game: '', number: 'OP13-016' }, index)).toHaveLength(1);
  });

  it('counts recent sales, leaving out refunds and old sales', () => {
    const sales = [
      { name: 'Charizard ex', game: 'Pokemon', qtySold: 2, salePrice: 40, soldAt: daysAgo(5), refundedAt: null },
      { name: 'charizard ex', game: 'Pokemon', qtySold: 1, salePrice: 45, soldAt: daysAgo(2), refundedAt: null },
      { name: 'Charizard ex', game: 'Pokemon', qtySold: 5, salePrice: 30, soldAt: daysAgo(45), refundedAt: null },
      { name: 'Gengar', game: 'Pokemon', qtySold: 3, salePrice: 10, soldAt: daysAgo(2), refundedAt: daysAgo(1) },
    ];
    const index = buildHotIndex({ sales, now: NOW });
    const reasons = hotReasonsForCard({ name: 'Charizard ex', game: 'Pokemon' }, index);
    expect(reasons).toEqual([expect.objectContaining({ kind: 'sales', copies: 3, text: 'We sold 3 in the last 30 days, last at $45.00' })]);
    expect(hotReasonsForCard({ name: 'Gengar', game: 'Pokemon' }, index)).toEqual([]);
    expect(reasonsOfKind(index, 'sales')).toHaveLength(1);
  });

  it('flags a price climb of at least 20%, the biggest one per card', () => {
    const movers = [
      { sku: 'a', name: 'Mew ex', game: 'Pokemon', firstPrice: 10, lastPrice: 12, pctChange: 20 },
      { sku: 'b', name: 'Mew ex', game: 'Pokemon', firstPrice: 10, lastPrice: 15, pctChange: 50 },
      { sku: 'c', name: 'Pikachu', game: 'Pokemon', firstPrice: 10, lastPrice: 11, pctChange: 10 },
    ];
    const index = buildHotIndex({ movers, now: NOW });
    const reasons = hotReasonsForCard({ name: 'Mew ex', game: 'Pokemon' }, index);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].text).toBe('Market price up 50% this month ($10.00 → $15.00)');
    expect(hotReasonsForCard({ name: 'Pikachu', game: 'Pokemon' }, index)).toEqual([]);
  });

  it('puts hot-list entries first; an entry with no game matches every game', () => {
    const index = buildHotIndex({
      meta: [meta()],
      hotList: [{ id: 'h1', game: '', name: 'Sol Ring', reason: 'Commander staple' }],
      now: NOW,
    });
    const reasons = hotReasonsForCard({ name: 'Sol Ring', game: 'Magic' }, index);
    expect(reasons.map(r => r.kind)).toEqual(['list', 'meta']);
    expect(reasons[0].text).toBe('Hot list: Commander staple');
  });

  it('returns nothing for a blank name or no index', () => {
    const index = buildHotIndex({ meta: [meta()], now: NOW });
    expect(hotReasonsForCard({ name: '  ', game: 'Magic' }, index)).toEqual([]);
    expect(hotReasonsForCard({ name: 'Sol Ring' }, undefined)).toEqual([]);
  });
});

describe('topMetaCards', () => {
  it("lists one game's most-played cards, best share first", () => {
    const rows = topMetaCards([
      meta(),
      meta({ name: 'Mana Crypt', name_key: 'mana crypt', decks: 800 }),
      meta({ format: 'Legacy', decks: 90, total_decks: 100 }),
      meta({ game: 'Pokemon', name: 'Ultra Ball', name_key: 'ultra ball' }),
    ], 'Magic');
    expect(rows.map(r => [r.name, r.share, r.format])).toEqual([['Sol Ring', 90, 'Legacy'], ['Mana Crypt', 80, 'EDH']]);
  });
});
