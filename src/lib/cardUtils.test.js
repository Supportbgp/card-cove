import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseMoney, detectGrading, normalizeCard, GAME_TAG_CLASS,
  channelDefaultsForLocation, isTicketComplete, needsPlatformStatusReset,
  timeAgo, canonicalizeCondition, marketValueForCondition, roundPriceUp, roundPriceDown,
  resolveActiveImage, activeImageSrc, SORT_COLUMNS, DEFAULT_CONDITION_MULTIPLIERS,
  RARITY_OPTIONS_BY_GAME, CONDITION_TIERS, CONDITION_OPTIONS, PRINTING_OPTIONS_BY_GAME,
  mergeScanDuplicates, scanDuplicateKey, findBulkRow, buildBulkCatalogItem,
} from './cardUtils.js';

describe('parseMoney', () => {
  it('treats blank/null/undefined as no price, not zero', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
  it('passes a real number through unchanged', () => {
    expect(parseMoney(12.5)).toBe(12.5);
    expect(parseMoney(0)).toBe(0);
  });
  it('strips $ and , from spreadsheet-style strings', () => {
    expect(parseMoney('$1,234.50')).toBe(1234.5);
    expect(parseMoney('  42  ')).toBe(42);
  });
  it('returns null for garbage rather than NaN', () => {
    expect(parseMoney('not a price')).toBeNull();
  });
});

describe('detectGrading', () => {
  it('leaves an ungraded name alone as a single', () => {
    expect(detectGrading('Charizard')).toEqual({ name: 'Charizard', itemType: 'single', grader: '', grade: '' });
  });
  it('detects a plain grade and strips it from the name', () => {
    expect(detectGrading('Charizard PSA 10')).toEqual({ name: 'Charizard', itemType: 'slab', grader: 'PSA', grade: '10' });
  });
  it('detects a qualified grade (Gem Mint, Black Label, etc.)', () => {
    expect(detectGrading('Black Lotus BGS Gem Mint 9.5')).toEqual({
      name: 'Black Lotus', itemType: 'slab', grader: 'BGS', grade: 'Gem Mint 9.5',
    });
  });
  it('normalizes "Beckett" casing', () => {
    expect(detectGrading('Card Beckett 9')).toEqual({ name: 'Card', itemType: 'slab', grader: 'Beckett', grade: '9' });
  });
  it('strips a trailing dash left over after removing the grade text', () => {
    expect(detectGrading('Card - PSA 10')).toEqual({ name: 'Card', itemType: 'slab', grader: 'PSA', grade: '10' });
  });
});

describe('normalizeCard', () => {
  it('canonicalizes known game aliases', () => {
    expect(normalizeCard({ game: 'MTG' }).game).toBe('Magic');
    expect(normalizeCard({ game: 'pokémon' }).game).toBe('Pokemon');
    expect(normalizeCard({ game: 'yu-gi-oh!' }).game).toBe('Yugioh');
  });
  it('falls back to "Other" for a blank game, and passthrough for an unrecognized one', () => {
    expect(normalizeCard({ game: '' }).game).toBe('Other');
    expect(normalizeCard({ game: 'Flesh and Blood' }).game).toBe('Flesh and Blood');
  });
  it('coerces every documented "sold" spelling to a real boolean', () => {
    expect(normalizeCard({ sold: true }).sold).toBe(true);
    expect(normalizeCard({ sold: 'true' }).sold).toBe(true);
    expect(normalizeCard({ sold: 'TRUE' }).sold).toBe(true);
    expect(normalizeCard({ sold: '1' }).sold).toBe(true);
    expect(normalizeCard({ sold: 'Sold' }).sold).toBe(true);
    expect(normalizeCard({ sold: false }).sold).toBe(false);
    expect(normalizeCard({ sold: '' }).sold).toBe(false);
    expect(normalizeCard({}).sold).toBe(false);
  });
  it('defaults every channel to true unless explicitly false', () => {
    const card = normalizeCard({});
    expect(card.posChannel).toBe(true);
    expect(card.tcgplayerChannel).toBe(true);
    expect(card.collectrChannel).toBe(true);
    expect(normalizeCard({ posChannel: false }).posChannel).toBe(false);
  });
  it('defaults itemType to "single" unless the string contains "slab" or "bulk"', () => {
    expect(normalizeCard({}).itemType).toBe('single');
    expect(normalizeCard({ itemType: 'Slab' }).itemType).toBe('slab');
    expect(normalizeCard({ itemType: 'single' }).itemType).toBe('single');
    expect(normalizeCard({ itemType: 'Bulk' }).itemType).toBe('bulk');
  });
  it('parses price and basePrice through parseMoney', () => {
    const card = normalizeCard({ price: '$5.00', basePrice: '$10.00' });
    expect(card.price).toBe(5);
    expect(card.basePrice).toBe(10);
  });
  it('parses cost through parseMoney and leaves it null when not provided', () => {
    expect(normalizeCard({ cost: '$3.50' }).cost).toBe(3.5);
    expect(normalizeCard({}).cost).toBeNull();
  });
  it('defaults activeImage to "photo" unless explicitly "stock"', () => {
    expect(normalizeCard({}).activeImage).toBe('photo');
    expect(normalizeCard({ activeImage: 'stock' }).activeImage).toBe('stock');
    expect(normalizeCard({ activeImage: 'garbage' }).activeImage).toBe('photo');
  });
});

describe('GAME_TAG_CLASS', () => {
  it('only maps to real accent tokens', () => {
    const allowed = new Set([
      'tag-teal', 'tag-green', 'tag-amber', 'tag-rust', 'tag-purple', 'tag-blue',
      'tag-gundam', 'tag-riftbound', 'tag-swu', 'tag-lorcana',
    ]);
    for (const cls of Object.values(GAME_TAG_CLASS)) {
      expect(allowed.has(cls)).toBe(true);
    }
  });

  it('gives every game its own distinct tag class — no two games share a color', () => {
    const values = Object.values(GAME_TAG_CLASS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('RARITY_OPTIONS_BY_GAME', () => {
  it('lists real Pokemon rarity strings for both the modern and older eras, no duplicates', () => {
    const pokemon = RARITY_OPTIONS_BY_GAME.Pokemon;
    expect(pokemon).toContain('Illustration Rare');
    expect(pokemon).toContain('Special Illustration Rare');
    expect(pokemon).toContain('Rare Secret');
    expect(new Set(pokemon).size).toBe(pokemon.length);
  });

  it('includes the real "Promo" rarity for Pokemon — confirmed via pokemontcg.io\'s own /rarities endpoint and a real WOTC Black Star Promo card', () => {
    expect(RARITY_OPTIONS_BY_GAME.Pokemon).toContain('Promo');
  });

  it('lists the real Scryfall rarity values for Magic plus "Promo" (added by explicit staff request despite not being a real Scryfall rarity value), no duplicates', () => {
    const magic = RARITY_OPTIONS_BY_GAME.Magic;
    expect(magic).toEqual(['Common', 'Uncommon', 'Rare', 'Mythic Rare', 'Special', 'Bonus', 'Promo']);
    expect(new Set(magic).size).toBe(magic.length);
  });

  it('lists real Yu-Gi-Oh rarity tiers plus "Promo" (added by explicit staff request), no duplicates, excluding niche Parallel Rare variants', () => {
    const yugioh = RARITY_OPTIONS_BY_GAME.Yugioh;
    expect(yugioh).toContain('Secret Rare');
    expect(yugioh).toContain('Ultra Rare');
    expect(yugioh).toContain('Starlight Rare');
    expect(yugioh).toContain('Promo');
    expect(new Set(yugioh).size).toBe(yugioh.length);
    expect(yugioh.some(o => /parallel/i.test(o))).toBe(false);
  });

  it('lists the real One Piece rarity codes (mapped to full names) plus "Promo" (added by explicit staff request), no duplicates, excluding Parallel/Alternate Art (a separate printing overlay, not a rarity tier)', () => {
    const onePiece = RARITY_OPTIONS_BY_GAME['One Piece'];
    expect(onePiece).toEqual([
      'Common', 'Uncommon', 'Rare', 'Super Rare', 'Secret Rare',
      'Leader', 'Special Rare', 'Treasure Rare', 'Manga Rare', 'Promo',
    ]);
    expect(new Set(onePiece).size).toBe(onePiece.length);
    expect(onePiece.some(o => /parallel|alternate art/i.test(o))).toBe(false);
  });

  it('lists the six official Lorcana rarity tiers plus "Epic" (added by explicit staff confirmation) and the real "Promo" value, no duplicates', () => {
    const lorcana = RARITY_OPTIONS_BY_GAME.Lorcana;
    expect(lorcana).toEqual(['Common', 'Uncommon', 'Rare', 'Super Rare', 'Epic', 'Legendary', 'Enchanted', 'Promo']);
    expect(new Set(lorcana).size).toBe(lorcana.length);
  });

  it('lists the four SWU pull-structure rarities plus "Special", "Serialized" (added by explicit staff request, reversing its earlier Printing-list exclusion), and "Promo", excluding Hyperspace/Showcase/Prestige (a separate finish axis)', () => {
    const swu = RARITY_OPTIONS_BY_GAME.SWU;
    expect(swu).toEqual(['Common', 'Uncommon', 'Rare', 'Legendary', 'Special', 'Serialized', 'Promo']);
    expect(new Set(swu).size).toBe(swu.length);
    expect(swu.some(o => /hyperspace|showcase|prestige/i.test(o))).toBe(false);
  });

  it('lists the six real Riftbound rarities including Showcase/Promo, excluding Alternate Art/Overnumbered/Signature (sub-flavors of Showcase, not their own rarity)', () => {
    const riftbound = RARITY_OPTIONS_BY_GAME.Riftbound;
    expect(riftbound).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Promo']);
    expect(new Set(riftbound).size).toBe(riftbound.length);
    expect(riftbound.some(o => /alternate art|overnumbered|signature/i.test(o))).toBe(false);
  });

  it('lists the six real Gundam rarity codes (mapped to full names) including Special/Promo, excluding the "+"/"++" alt-art overlay suffixes (a separate printing axis, not a rarity)', () => {
    const gundam = RARITY_OPTIONS_BY_GAME.Gundam;
    expect(gundam).toEqual(['Common', 'Uncommon', 'Rare', 'Legend Rare', 'Special', 'Promo']);
    expect(new Set(gundam).size).toBe(gundam.length);
    expect(gundam.some(o => /\+/.test(o))).toBe(false);
  });

  it('has no entry for Sports Singles — a deliberate, permanent exclusion (no card database exists for it at all), not a "not researched yet" gap', () => {
    expect(RARITY_OPTIONS_BY_GAME['Sports Singles']).toBeUndefined();
  });
});

describe('channelDefaultsForLocation', () => {
  it('defaults to everywhere for a brand-new or blank location', () => {
    expect(channelDefaultsForLocation([], 'Binder A')).toEqual({ posChannel: true, tcgplayerChannel: true, collectrChannel: true });
    expect(channelDefaultsForLocation([{ location: 'Binder A', posChannel: false }], '')).toEqual({ posChannel: true, tcgplayerChannel: true, collectrChannel: true });
  });
  it('follows the majority of existing items in the same location', () => {
    const catalog = [
      { location: 'Binder A', posChannel: true, tcgplayerChannel: false, collectrChannel: true },
      { location: 'Binder A', posChannel: true, tcgplayerChannel: false, collectrChannel: false },
      { location: 'Binder B', posChannel: false, tcgplayerChannel: true, collectrChannel: true },
    ];
    expect(channelDefaultsForLocation(catalog, 'Binder A')).toEqual({
      posChannel: true, tcgplayerChannel: false, collectrChannel: true,
    });
  });
  it('ignores items from other locations entirely', () => {
    const catalog = [{ location: 'Binder B', posChannel: false, tcgplayerChannel: false, collectrChannel: false }];
    expect(channelDefaultsForLocation(catalog, 'Binder A')).toEqual({ posChannel: true, tcgplayerChannel: true, collectrChannel: true });
  });
});

describe('findBulkRow', () => {
  it('finds the existing bulk row for a given location + game', () => {
    const catalog = [
      { itemType: 'bulk', location: 'Red binder', game: 'Pokemon', qty: 40 },
      { itemType: 'single', location: 'Red binder', game: 'Pokemon', qty: 1 },
      { itemType: 'bulk', location: 'Blue binder', game: 'Pokemon', qty: 5 },
    ];
    expect(findBulkRow(catalog, 'Red binder', 'Pokemon')).toEqual(catalog[0]);
  });
  it('returns null when no bulk row exists yet for that location + game', () => {
    expect(findBulkRow([], 'Red binder', 'Pokemon')).toBeNull();
  });
  it('canonicalizes the game before comparing, same as normalizeCard', () => {
    const catalog = [{ itemType: 'bulk', location: 'Red binder', game: 'Magic', qty: 10 }];
    expect(findBulkRow(catalog, 'Red binder', 'MTG')).toEqual(catalog[0]);
  });
});

describe('buildBulkCatalogItem', () => {
  it('creates a new bulk row with no channels when none exists yet', () => {
    const card = buildBulkCatalogItem({ game: 'Pokemon', qty: 3 }, 'Red binder', null);
    expect(card.itemType).toBe('bulk');
    expect(card.location).toBe('Red binder');
    expect(card.game).toBe('Pokemon');
    expect(card.qty).toBe(3);
    expect(card.posChannel).toBe(false);
    expect(card.tcgplayerChannel).toBe(false);
    expect(card.collectrChannel).toBe(false);
  });
  it('increments an existing bulk row\'s qty instead of creating a second one', () => {
    const existing = { sku: 'bulk-1', itemType: 'bulk', location: 'Red binder', game: 'Pokemon', qty: 40, posChannel: false, tcgplayerChannel: false, collectrChannel: false };
    const card = buildBulkCatalogItem({ game: 'Pokemon', qty: 5 }, 'Red binder', existing);
    expect(card.sku).toBe('bulk-1');
    expect(card.qty).toBe(45);
  });
  it('treats a blank/missing qty as 1, same as everywhere else in this app', () => {
    const card = buildBulkCatalogItem({ game: 'Pokemon' }, 'Red binder', null);
    expect(card.qty).toBe(1);
  });
});

describe('isTicketComplete', () => {
  it('is complete once every enrolled channel is done', () => {
    expect(isTicketComplete({ posChannel: true, posDone: true, tcgplayerChannel: false, collectrChannel: false })).toBe(true);
  });
  it('is incomplete if an enrolled channel is not done', () => {
    expect(isTicketComplete({ posChannel: true, posDone: false, tcgplayerChannel: false, collectrChannel: false })).toBe(false);
  });
  it('a channel the item was never enrolled in never blocks completion', () => {
    expect(isTicketComplete({ posChannel: false, posDone: false, tcgplayerChannel: false, tcgplayerDone: false, collectrChannel: false, collectrDone: false })).toBe(true);
  });
});

describe('needsPlatformStatusReset', () => {
  it('always resets for a brand-new item', () => {
    expect(needsPlatformStatusReset(null, { price: 5 })).toBe(true);
  });
  it('resets when a reset-triggering field changes', () => {
    expect(needsPlatformStatusReset({ price: 5, qty: 1, condition: 'NM', sold: false }, { price: 6, qty: 1, condition: 'NM', sold: false })).toBe(true);
    expect(needsPlatformStatusReset({ price: 5, qty: 1, condition: 'NM', sold: false }, { price: 5, qty: 2, condition: 'NM', sold: false })).toBe(true);
    expect(needsPlatformStatusReset({ price: 5, qty: 1, condition: 'NM', sold: false }, { price: 5, qty: 1, condition: 'NM', sold: true })).toBe(true);
  });
  it('does not reset when only an unrelated field changes', () => {
    expect(needsPlatformStatusReset({ price: 5, qty: 1, condition: 'NM', sold: false, notes: 'a' }, { price: 5, qty: 1, condition: 'NM', sold: false, notes: 'b' })).toBe(false);
  });
});

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers());

  it('handles a falsy timestamp', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(0)).toBe('—');
  });
  it('labels today and yesterday specially', () => {
    const now = new Date('2026-08-10T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(timeAgo(now - 1000)).toBe('Today');
    expect(timeAgo(now - 86400000)).toBe('Yesterday');
  });
  it('counts days for the rest of the week', () => {
    const now = new Date('2026-08-10T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(timeAgo(now - 3 * 86400000)).toBe('3d ago');
  });
});

describe('CONDITION_TIERS / CONDITION_OPTIONS', () => {
  it('every option round-trips through canonicalizeCondition onto its own tier key — the Condition dropdown must never offer a name the app itself can\'t recognize', () => {
    for (const { key, name } of CONDITION_TIERS) {
      expect(canonicalizeCondition(name)).toBe(key);
    }
  });

  it('CONDITION_OPTIONS is just the full names, NM-first', () => {
    expect(CONDITION_OPTIONS).toEqual(['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged']);
  });
});

describe('PRINTING_OPTIONS_BY_GAME', () => {
  it('offers the five real, evergreen printing/finish categories for Pokemon, excluding set-specific reverse-holo patterns and Shadowless (a Set distinction, not a finish one)', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Pokemon).toEqual([
      'Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition Normal', '1st Edition Holofoil',
    ]);
    expect(PRINTING_OPTIONS_BY_GAME.Pokemon).not.toContain('Shadowless');
    expect(PRINTING_OPTIONS_BY_GAME.Pokemon.some(o => /poke ?ball|master ?ball/i.test(o))).toBe(false);
  });

  it('offers the four real Scryfall finish values for Magic, excluding frame/border treatments like Showcase/Extended Art/Borderless (a separate attribute, not a finish)', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Magic).toEqual(['Nonfoil', 'Foil', 'Etched', 'Glossy']);
    expect(PRINTING_OPTIONS_BY_GAME.Magic.some(o => /showcase|extended|borderless|full art/i.test(o))).toBe(false);
  });

  it('offers the real edition options for Yu-Gi-Oh (its finish is implied by rarity, not independent, so edition is the real printing distinction)', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Yugioh).toEqual(['1st Edition', 'Unlimited Edition', 'Limited Edition']);
  });

  it('offers Normal/Alternate Art for One Piece — its rarity tier already implies foil treatment, so the real independent axis is the star-marked alt-art overlay, not a foil/nonfoil toggle', () => {
    expect(PRINTING_OPTIONS_BY_GAME['One Piece']).toEqual(['Normal', 'Alternate Art']);
  });

  it('offers Normal/Foil for Lorcana — unlike Yu-Gi-Oh/One Piece, rarity and finish are genuinely independent here (every non-Enchanted rarity has both a foil and non-foil printing)', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Lorcana).toEqual(['Normal', 'Foil']);
  });

  it('offers the real SWU treatment names including Prestige Foil (added by explicit staff request), excluding promo/distribution-specific variants like Serialized (moved to Rarity instead, by staff request) or Judge Promo', () => {
    const swu = PRINTING_OPTIONS_BY_GAME.SWU;
    expect(swu).toEqual(['Normal', 'Foil', 'Hyperspace', 'Hyperspace Foil', 'Showcase', 'Prestige', 'Prestige Foil']);
    expect(swu.some(o => /serial|promo|judge|convention/i.test(o))).toBe(false);
  });

  it('offers Normal plus the three real Showcase-rarity print styles for Riftbound — its finish is implied by rarity, not independent', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Riftbound).toEqual(['Normal', 'Alternate Art', 'Overnumbered', 'Signature']);
  });

  it('offers Normal plus the two real "+"/"++" alt-art overlay tiers for Gundam — its finish is implied by rarity, not independent', () => {
    expect(PRINTING_OPTIONS_BY_GAME.Gundam).toEqual(['Normal', 'Alternate Art', 'Alternate Art (Case Hit)']);
  });

  it('has no entry for Sports Singles, same as RARITY_OPTIONS_BY_GAME', () => {
    expect(PRINTING_OPTIONS_BY_GAME['Sports Singles']).toBeUndefined();
  });
});

describe('canonicalizeCondition', () => {
  it('maps known aliases onto the five tiers', () => {
    expect(canonicalizeCondition('nm')).toBe('NM');
    expect(canonicalizeCondition('Near Mint')).toBe('NM');
    expect(canonicalizeCondition('LP')).toBe('LP');
    expect(canonicalizeCondition('heavily played')).toBe('HP');
    expect(canonicalizeCondition('damaged')).toBe('DMG');
  });
  it('returns null for blank or unrecognized text rather than guessing', () => {
    expect(canonicalizeCondition('')).toBeNull();
    expect(canonicalizeCondition(null)).toBeNull();
    expect(canonicalizeCondition('Sealed')).toBeNull();
  });
});

describe('marketValueForCondition', () => {
  it('returns null if there is no base price to work from', () => {
    expect(marketValueForCondition(null, 'NM', DEFAULT_CONDITION_MULTIPLIERS)).toBeNull();
  });
  it('returns null for an unrecognized condition rather than assuming NM', () => {
    expect(marketValueForCondition(100, 'Sealed', DEFAULT_CONDITION_MULTIPLIERS)).toBeNull();
  });
  it('NM is always 100% regardless of the multiplier table', () => {
    expect(marketValueForCondition(100, 'NM', {})).toBe(100);
  });
  it('applies the store-configured percentage for other tiers', () => {
    expect(marketValueForCondition(100, 'LP', DEFAULT_CONDITION_MULTIPLIERS)).toBe(85);
    expect(marketValueForCondition(100, 'HP', DEFAULT_CONDITION_MULTIPLIERS)).toBe(45);
  });
  it('rounds to the cent', () => {
    expect(marketValueForCondition(33.33, 'LP', DEFAULT_CONDITION_MULTIPLIERS)).toBeCloseTo(28.33, 2);
  });
});

describe('roundPriceUp / roundPriceDown', () => {
  it('round to the next/previous whole dollar', () => {
    expect(roundPriceUp(13.43)).toBe(14);
    expect(roundPriceDown(13.43)).toBe(13);
  });
  it('leave an already-whole price unchanged in either direction', () => {
    expect(roundPriceUp(13)).toBe(13);
    expect(roundPriceDown(13)).toBe(13);
  });
  it('are immune to floating-point noise on an already-whole price', () => {
    expect(roundPriceUp(12.999999999998)).toBe(13);
    expect(roundPriceDown(13.000000000002)).toBe(13);
  });
  it('pass through null/blank/non-finite unchanged rather than crash', () => {
    expect(roundPriceUp(null)).toBeNull();
    expect(roundPriceDown(null)).toBeNull();
    expect(roundPriceUp('')).toBe('');
    expect(roundPriceUp(NaN)).toBeNaN();
  });
});

describe('resolveActiveImage / activeImageSrc', () => {
  const stockOnly = { imageUrl: 'https://example.com/stock.jpg', imageData: '', photoUrl: '', photoData: '', activeImage: 'photo' };
  const photoOnly = { imageUrl: '', imageData: '', photoUrl: 'local', photoData: 'data:image/jpeg;base64,abc', activeImage: 'photo' };
  const both = {
    imageUrl: 'https://example.com/stock.jpg', imageData: '',
    photoUrl: 'local', photoData: 'data:image/jpeg;base64,abc',
    activeImage: 'photo',
  };

  it('prefers photo by default, falling back to stock if photo is blank', () => {
    expect(resolveActiveImage(stockOnly)).toBe('stock');
    expect(activeImageSrc(stockOnly)).toBe('https://example.com/stock.jpg');
  });
  it('falls back to photo if stock is blank and stock was preferred', () => {
    const card = { ...photoOnly, activeImage: 'stock' };
    expect(resolveActiveImage(card)).toBe('photo');
    expect(activeImageSrc(card)).toBe('data:image/jpeg;base64,abc');
  });
  it('honors an explicit preference when both slots exist', () => {
    expect(resolveActiveImage({ ...both, activeImage: 'stock' })).toBe('stock');
    expect(resolveActiveImage({ ...both, activeImage: 'photo' })).toBe('photo');
  });
  it('returns null when neither slot has anything', () => {
    const empty = { imageUrl: '', imageData: '', photoUrl: '', photoData: '', activeImage: 'photo' };
    expect(activeImageSrc(empty)).toBeNull();
  });
  it('treats a non-http imageUrl that is not "local" as blank', () => {
    const weird = { imageUrl: 'garbage', imageData: '', photoUrl: '', photoData: '', activeImage: 'stock' };
    expect(activeImageSrc(weird)).toBeNull();
  });
});

describe('SORT_COLUMNS', () => {
  it('sorts name/sku case-insensitively', () => {
    expect(SORT_COLUMNS.name({ name: 'ZEBRA' })).toBe('zebra');
    expect(SORT_COLUMNS.sku({ sku: 'ABC' })).toBe('abc');
  });
  it('sorts a null price below every real price', () => {
    expect(SORT_COLUMNS.price({ price: null })).toBe(-Infinity);
    expect(SORT_COLUMNS.price({ price: 5 })).toBe(5);
  });
});

describe('scanDuplicateKey', () => {
  it('identifies the same print by game + name + number, ignoring case, spacing and leading zeros', () => {
    const a = scanDuplicateKey({ game: 'Pokemon', name: 'Charizard ', number: '004' });
    const b = scanDuplicateKey({ game: 'Pokemon', name: 'charizard', number: '4' });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it('returns null (never merge) without both a name and a number', () => {
    expect(scanDuplicateKey({ game: 'Pokemon', name: 'Charizard', number: '' })).toBeNull();
    expect(scanDuplicateKey({ game: 'Pokemon', name: '', number: '4' })).toBeNull();
  });

  it('keeps different games apart', () => {
    expect(scanDuplicateKey({ game: 'Magic', name: 'X', number: '1' }))
      .not.toBe(scanDuplicateKey({ game: 'Pokemon', name: 'X', number: '1' }));
  });
});

describe('mergeScanDuplicates', () => {
  function row(overrides = {}) {
    return { id: Math.random(), name: 'The One Ring', game: 'Magic', number: '', position: '', qty: 1, confidence: 'medium', ...overrides };
  }

  it('merges rows with the same name + collector number into one qty-N row', () => {
    const rows = [
      row({ id: 1, number: '0451', position: 'row2-col1' }),
      row({ id: 2, number: '0451', position: 'row2-col3' }),
      row({ id: 3, number: '0451', position: 'row3-col1' }),
    ];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(3);
    expect(merged[0].id).toBe(1); // keeps the first occurrence's identity/fields
    expect(merged[0].position).toBe('row2-col1, row2-col3, row3-col1');
  });

  it('does NOT merge rows that share a name but have different collector numbers — a real photo case: three visually-identical serialized "The One Ring" cards, each a genuine one-of-one print', () => {
    const rows = [
      row({ id: 1, number: '0380' }),
      row({ id: 2, number: '0246' }),
      row({ id: 3, number: '0791' }),
    ];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(3);
    expect(merged.every(r => r.qty === 1)).toBe(true);
  });

  it('does not merge rows with a blank Number, even if the name matches — nothing confirms they are actually the same print', () => {
    const rows = [row({ id: 1, number: '' }), row({ id: 2, number: '' })];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(2);
  });

  it('ignores leading zeros when comparing numbers ("0451" and "451" are the same print)', () => {
    const rows = [row({ id: 1, number: '0451' }), row({ id: 2, number: '451' })];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(2);
  });

  it('does not merge across different games even if name + number coincidentally match', () => {
    const rows = [row({ id: 1, game: 'Magic', number: '1' }), row({ id: 2, game: 'Pokemon', number: '1' })];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(2);
  });

  it('name matching is case/whitespace-insensitive', () => {
    const rows = [row({ id: 1, name: '  The One Ring  ', number: '451' }), row({ id: 2, name: 'the one ring', number: '451' })];
    const merged = mergeScanDuplicates(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(2);
  });

  it('surfaces the lowest confidence among the merged copies', () => {
    const rows = [row({ id: 1, number: '451', confidence: 'high' }), row({ id: 2, number: '451', confidence: 'low' })];
    const merged = mergeScanDuplicates(rows);
    expect(merged[0].confidence).toBe('low');
  });
});
