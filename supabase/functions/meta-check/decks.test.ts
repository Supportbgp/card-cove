import { describe, it, expect } from 'vitest';
import {
  limitlessDeckCards, topdeckDeckCards, newTally, addDeck, tallyRows, isBasicCard,
  egmanDeckCards, ygometaDeckCards, isYgoAdvancedDeck, mtgoDeckCards, mtgoPathsFor, swuUsageRows,
} from './decks.ts';

// Shapes copied from real responses (Limitless standings, TopDeck.gg
// POST /v2/tournaments with columns: ["decklist"]).

describe('limitlessDeckCards', () => {
  it('reads every section, including single leader/base objects, with codes', () => {
    const cards = limitlessDeckCards({
      leader: { name: 'Monkey.D.Luffy', set: 'OP13', number: '001' },
      character: [{ count: 4, name: 'Nami', set: 'OP13', number: '016' }],
      event: [],
    });
    expect(cards).toEqual([
      { name: 'Monkey.D.Luffy', count: 1, code: 'OP13-1' },
      { name: 'Nami', count: 4, code: 'OP13-16' },
    ]);
  });

  it('handles a missing decklist', () => {
    expect(limitlessDeckCards(null)).toEqual([]);
  });
});

describe('topdeckDeckCards', () => {
  it('prefers the structured deckObj and skips its metadata', () => {
    const cards = topdeckDeckCards({
      decklist: 'ignored',
      deckObj: {
        Commanders: { 'Kinnan, Bonder Prodigy': { id: 'x', count: 1 } },
        Mainboard: { 'Sol Ring': { id: 'y', count: 1 }, Island: { count: 5 } },
        metadata: { game: 'Magic', format: 'EDH', importedFrom: 'moxfield' },
      },
    });
    expect(cards.map(c => c.name)).toEqual(['Kinnan, Bonder Prodigy', 'Sol Ring', 'Island']);
  });

  it("falls back to the text list, unescaping TopDeck's \\n and \\' and skipping runes", () => {
    const text = '~~Legend~~\\n1 Lillia, Bashful Bloom\\n\\n~~Runes~~\\n6 Calm Rune\\n\\n~~Mainboard~~\\n4 Ugin\\\'s Labyrinth\\n2x Charm';
    expect(topdeckDeckCards({ decklist: text })).toEqual([
      { name: 'Lillia, Bashful Bloom', count: 1 },
      { name: "Ugin's Labyrinth", count: 4 },
      { name: 'Charm', count: 2 },
    ]);
  });

  it('reads Yu-Gi-Oh "#main" sections, and ignores a list that is only a link', () => {
    expect(topdeckDeckCards({ decklist: '~~#main~~\\n3 Ash Blossom & Joyous Spring' })).toEqual([{ name: 'Ash Blossom & Joyous Spring', count: 3 }]);
    expect(topdeckDeckCards({ decklist: 'https://moxfield.com/decks/abc' })).toEqual([]);
  });
});

describe('isBasicCard', () => {
  it('leaves out basic energy and basic lands, not special ones', () => {
    expect(isBasicCard('Pokemon', 'Psychic Energy')).toBe(true);
    expect(isBasicCard('Pokemon', 'Basic Fire Energy')).toBe(true);
    expect(isBasicCard('Pokemon', 'Telepathic Psychic Energy')).toBe(false);
    expect(isBasicCard('Magic', 'Snow-Covered Island')).toBe(true);
    expect(isBasicCard('Magic', 'Island Fish Jasconius')).toBe(false);
    expect(isBasicCard('Lorcana', 'Island')).toBe(false);
  });
});

describe('tally', () => {
  it('counts each card once per deck, all its copies, and drops rare ones', () => {
    const t = newTally();
    addDeck(t, 'Magic', [{ name: 'Sol Ring', count: 1 }, { name: 'Island', count: 8 }, { name: 'Brainstorm', count: 4 }]);
    addDeck(t, 'Magic', [{ name: 'Sol Ring', count: 1 }, { name: 'Sol Ring (CMR)', count: 1 }]);
    addDeck(t, 'Magic', []);
    for (let i = 0; i < 20; i++) addDeck(t, 'Magic', [{ name: 'Sol Ring', count: 1 }]);
    expect(t.totalDecks).toBe(22);
    const rows = tallyRows(t);
    expect(rows[0]).toMatchObject({ nameKey: 'sol ring', name: 'Sol Ring', decks: 22, copies: 23, code: '' });
    // Brainstorm: 1 of 22 decks (under 5%); Island: a basic land.
    expect(rows.map(r => r.nameKey)).toEqual(['sol ring']);
  });

  it('counts One Piece cards by code, so two Namis stay apart', () => {
    const t = newTally();
    addDeck(t, 'One Piece', [{ name: 'Nami', count: 4, code: 'OP13-16' }, { name: 'Nami', count: 2, code: 'OP01-16' }]);
    expect(tallyRows(t).map(r => r.code).sort()).toEqual(['OP01-16', 'OP13-16']);
  });
});

// Shapes copied from real responses (2026-11-25): Egman's deckbuilder,
// Yu-Gi-Oh! Meta /top-decks, MTGODecklistCache, SWU Meta Stats /cards.
describe('egmanDeckCards', () => {
  it('reads CODE:COUNT pairs from the deck link and names them by code', () => {
    const names = new Map([['GD05-69', 'Strike Freedom'], ['ST12-13', 'Zaku']]);
    const url = 'https://deckbuilder.egmanevents.com/?deck=GD05-069:4,ST12-013:1,bad,GD09-001:2&type=gundam';
    expect(egmanDeckCards(url, names)).toEqual([
      { name: 'Strike Freedom', count: 4, code: 'GD05-69' },
      { name: 'Zaku', count: 1, code: 'ST12-13' },
      { name: 'GD09-001', count: 2, code: 'GD09-1' },
    ]);
  });

  it('also reads pairs separated by "|" (a few real links)', () => {
    const url = 'https://deckbuilder.egmanevents.com/?deck=GD05-068:1|GD04-038:4,ST01-015:2&type=gundam';
    expect(egmanDeckCards(url, new Map()).map(c => [c.code, c.count])).toEqual([['GD05-68', 1], ['GD04-38', 4], ['ST01-15', 2]]);
  });

  it('returns nothing for a missing or broken link', () => {
    expect(egmanDeckCards(undefined, new Map())).toEqual([]);
    expect(egmanDeckCards('not a url', new Map())).toEqual([]);
  });
});

describe('Yu-Gi-Oh! Meta decks', () => {
  const deck = {
    main: [{ card: { name: 'Ash Blossom & Joyous Spring', usdPrice: 5 }, amount: 3 }],
    extra: [{ card: { name: 'S:P Little Knight' }, amount: 1 }],
    side: [{ card: { name: 'Droll & Lock Bird' }, amount: 2 }],
    ocg: false, genesys: false, illegal: false, incomplete: false,
  };

  it('reads main, extra and side', () => {
    expect(ygometaDeckCards(deck).map(c => [c.name, c.count])).toEqual([
      ['Ash Blossom & Joyous Spring', 3], ['S:P Little Knight', 1], ['Droll & Lock Bird', 2],
    ]);
  });

  it('keeps only TCG Advanced decks', () => {
    expect(isYgoAdvancedDeck(deck)).toBe(true);
    expect(isYgoAdvancedDeck({ ...deck, ocg: true })).toBe(false);
    expect(isYgoAdvancedDeck({ ...deck, genesys: true })).toBe(false);
    expect(isYgoAdvancedDeck({ ...deck, illegal: true })).toBe(false);
    expect(isYgoAdvancedDeck({ ...deck, incomplete: true })).toBe(false);
  });
});

describe('MTGO results', () => {
  it('reads the main deck and sideboard', () => {
    const d = { Mainboard: [{ Count: 4, CardName: 'Amulet of Vigor' }], Sideboard: [{ Count: 2, CardName: 'Ba Sing Se' }] };
    expect(mtgoDeckCards(d)).toEqual([{ name: 'Amulet of Vigor', count: 4 }, { name: 'Ba Sing Se', count: 2 }]);
  });

  it("fetches only well-formed paths of the job's format inside the window", () => {
    const paths = [
      '2026/11/01/modern-challenge-32-2026-11-0112857398.json',
      '2026/11/01/legacy-challenge-16-2026-11-0112857400.json',
      '2026/10/01/modern-league-2026-10-0111161.json',
      '../../secrets.json',
      'https://evil.example/2026/11/01/modern-x.json',
      '2026/11/01/modern-x.json?y=1',
      42,
    ];
    expect(mtgoPathsFor(paths, 'modern', Date.UTC(2026, 9, 27))).toEqual(['2026/11/01/modern-challenge-32-2026-11-0112857398.json']);
    expect(mtgoPathsFor('not a list', 'modern', 0)).toEqual([]);
  });
});

describe('swuUsageRows', () => {
  it('turns per-card usage into rows, estimating copies, and drops rare cards', () => {
    const cards = [
      { name: 'Pre Vizsla | Strong-Willed Ruler', usage: { appearances: 350, pct1: 5, pct2: 10, pct3: 20 } },
      { name: 'Rare Card', usage: { appearances: 10, pct1: 1, pct2: 0, pct3: 0 } },
      { name: 'Pre Vizsla | Strong-Willed Ruler', usage: { appearances: 1, pct1: 0, pct2: 0, pct3: 0 } },
    ];
    expect(swuUsageRows(cards, 1000)).toEqual([
      { nameKey: 'pre vizsla - strong-willed ruler', code: '', name: 'Pre Vizsla | Strong-Willed Ruler', decks: 350, copies: 850 },
    ]);
    expect(swuUsageRows(cards, 0)).toEqual([]);
  });
});
