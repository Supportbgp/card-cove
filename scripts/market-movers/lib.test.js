import { describe, it, expect } from 'vitest';
import { parsePrices, findClimbers, productNumber, moverRow, dayBefore, GAME_BY_CATEGORY } from './lib.js';

// Shapes copied from real TCGCSV files (2026-11-25): an archive's
// <date>/3/<groupId>/prices and /tcgplayer/3/<groupId>/products.

describe('parsePrices', () => {
  it('keys market prices by product and finish, skipping blanks', () => {
    const prices = parsePrices({ results: [
      { productId: 83439, marketPrice: 0.77, subTypeName: 'Normal' },
      { productId: 83439, marketPrice: 0.69, subTypeName: 'Reverse Holofoil' },
      { productId: 83474, marketPrice: null, subTypeName: 'Normal' },
    ] });
    expect([...prices]).toEqual([['83439|Normal', 0.77], ['83439|Reverse Holofoil', 0.69]]);
    expect(parsePrices(null).size).toBe(0);
  });
});

describe('findClimbers', () => {
  const before = new Map([['1|Normal', 10], ['2|Normal', 0.2], ['3|Holofoil', 4], ['4|Normal', 2.5], ['6|Normal', 3], ['7|Foil', 0.75], ['8|Normal', 3]]);
  const now = new Map([['1|Normal', 13.4], ['2|Normal', 5], ['3|Holofoil', 4.5], ['4|Normal', 3.1], ['5|Normal', 9], ['6|Normal', 2.9], ['7|Foil', 440.5], ['8|Normal', 6]]);

  it('keeps cards worth $3+ now, $0.50+ before, up 20-400%, biggest dollar gain first', () => {
    expect(findClimbers(before, now)).toEqual([
      { productId: 1, subType: 'Normal', oldPrice: 10, newPrice: 13.4, pct: 34 },
      { productId: 8, subType: 'Normal', oldPrice: 3, newPrice: 6, pct: 100 },
      { productId: 4, subType: 'Normal', oldPrice: 2.5, newPrice: 3.1, pct: 24 },
    ]);
  });
});

describe('product details', () => {
  const card = {
    productId: 83503, name: 'Alakazam E4', url: 'https://www.tcgplayer.com/product/83503/pokemon-rising-rivals-alakazam-e4',
    extendedData: [{ name: 'Number', value: '38/111' }, { name: 'Rarity', value: 'Uncommon' }],
  };

  it('reads the printed number; sealed products have none', () => {
    expect(productNumber(card)).toBe('38/111');
    expect(productNumber({ name: 'Booster Box', extendedData: [] })).toBe('');
  });

  it('builds a market_movers row for a single card only', () => {
    const climber = { productId: 83503, subType: 'Holofoil', oldPrice: 10, newPrice: 13.4, pct: 34 };
    expect(moverRow(climber, card, 'Rising Rivals', 'Pokemon', 'T')).toEqual({
      product_id: 83503, sub_type: 'Holofoil', game: 'Pokemon', name: 'Alakazam E4', name_key: 'alakazam e4',
      set_name: 'Rising Rivals', number: '38/111', old_price: 10, new_price: 13.4, pct_change: 34,
      url: 'https://www.tcgplayer.com/product/83503/pokemon-rising-rivals-alakazam-e4', window_days: 30, updated_at: 'T',
    });
    expect(moverRow(climber, { name: 'Booster Box', extendedData: [] }, 'X', 'Pokemon', 'T')).toBeNull();
    expect(moverRow(climber, undefined, 'X', 'Pokemon', 'T')).toBeNull();
  });

  it('keeps only real TCGplayer links', () => {
    const climber = { productId: 1, subType: 'Normal', oldPrice: 1, newPrice: 2, pct: 100 };
    const row = moverRow(climber, { ...card, url: 'javascript:alert(1)' }, 'S', 'Pokemon', 'T');
    expect(row.url).toBe('');
  });
});

describe('dayBefore and categories', () => {
  it('counts back in whole days across months', () => {
    expect(dayBefore('2026-11-25', 30)).toBe('2026-10-26');
    expect(dayBefore('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('maps every game with a TCGplayer category, leaving Japanese Pokemon out', () => {
    expect(Object.values(GAME_BY_CATEGORY).sort()).toEqual(['Gundam', 'Lorcana', 'Magic', 'One Piece', 'Pokemon', 'Riftbound', 'SWU', 'Yugioh']);
    expect(GAME_BY_CATEGORY[85]).toBeUndefined();
  });
});
