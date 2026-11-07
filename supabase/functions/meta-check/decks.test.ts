import { describe, it, expect } from 'vitest';
import { limitlessDeckCards, topdeckDeckCards, newTally, addDeck, tallyRows, isBasicCard } from './decks.ts';

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
