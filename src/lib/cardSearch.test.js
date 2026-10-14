import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('./supabase.js', () => ({
  supabaseClient: { functions: { invoke: (...args) => invokeMock(...args) } },
}));

const {
  searchScryfall, searchPokemon, searchYugioh, searchLorcana,
  searchOnePiece, searchRiftbound, searchGundam, searchSwu, searchCardImage,
  tcgplayerSearchUrl, ebaySoldSearchUrl, priceChartingSearchUrl,
  __resetPokemonQueryCacheForTests, pokemonRarityFromTcgdex,
} = await import('./cardSearch.js');

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  global.fetch = vi.fn();
  invokeMock.mockReset();
  // Pokemon queries are cached across calls (see cardSearch.js) so a real
  // session doesn't refetch an identical query twice — reset it here so
  // tests stay isolated from each other regardless of whether two of them
  // happen to build the same query string.
  __resetPokemonQueryCacheForTests();
});

describe('searchScryfall', () => {
  it('returns the exact-name result on the first try without falling back', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{ name: 'Sol Ring', set_name: 'Commander', collector_number: '1', image_uris: { normal: 'https://x/sol.jpg' }, prices: { usd: '3.00' }, purchase_uris: { tcgplayer: 'https://tcg/sol' } }],
    }));
    const results = await searchScryfall('Sol Ring');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{
      url: 'https://x/sol.jpg', label: 'Sol Ring (Commander) #1', price: 3, listingUrl: 'https://tcg/sol', rarity: '',
      set: 'Commander', number: '1',
    }]);
  });

  it('finds a card via a trailing "(1234)" collector-number search, tried before the literal parenthetical text — number is the strongest disambiguator, so its tier now runs first', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Bruce Banner', set_name: 'SLD', collector_number: '1234', image_uris: { normal: 'https://x/bb.jpg' } }] }));
    const results = await searchScryfall('Bruce Banner (1234)');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('number%3A1234');
    expect(results[0].url).toBe('https://x/bb.jpg');
  });

  it('retries with the number unpadded if the padded version finds nothing', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [] })) // padded number, empty
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Card', set_name: 'SET', collector_number: '7', image_uris: { normal: 'https://x/c.jpg' } }] })); // unpadded, matches
    const results = await searchScryfall('Card (007)');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('number%3A7');
    expect(results[0].url).toBe('https://x/c.jpg');
  });

  it('falls back to a broad stripped-name search for a parenthetical with no number', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [] })) // exact phrase with "(Borderless)", empty
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Bruce Banner', set_name: 'SLD', collector_number: '2', image_uris: { normal: 'https://x/bb2.jpg' } }] }));
    const results = await searchScryfall('Bruce Banner (Borderless)');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(global.fetch.mock.calls[1][0])).toContain('Bruce Banner');
    expect(results[0].url).toBe('https://x/bb2.jpg');
  });

  it('returns an empty array rather than throwing when nothing matches at all', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const results = await searchScryfall('Totally Made Up Card');
    expect(results).toEqual([]);
  });

  it('returns an empty array (not an error) on a plain 404 — Scryfall\'s real "zero results" response, not a failure', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ details: 'no cards found' }) });
    const results = await searchScryfall('Totally Made Up Card');
    expect(results).toEqual([]);
  });

  it('tries an explicit numberHint before the broad name search, same "number is the strongest disambiguator" priority as Pokemon', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{ name: 'Bruce Banner', set_name: 'Secret Lair Drop', collector_number: '42', image_uris: { normal: 'https://x/bb42.jpg' } }],
    }));
    const results = await searchScryfall('Bruce Banner', '', '', '42');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('number:42');
    expect(results[0].url).toBe('https://x/bb42.jpg');
  });

  it('falls back to a loose (non-exact) name match still scoped by Number when the exact-name tier finds nothing — real report: the scan OCR\'d "Sauron, Dark Lord" for the actual "Sauron, the Dark Lord", so an exact-name requirement silently lost the Number constraint entirely and landed on the wrong (common) print', async () => {
    // Number has no leading zero here so there's exactly one exact-match
    // attempt (no separate padded/unpadded sub-tier) before falling to the
    // loose tier — keeps this test isolated to the exact-vs-loose behavior
    // it's actually checking, not the unrelated padding logic.
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [] })) // exact name + number: no card is literally named "Sauron, Dark Lord"
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Sauron, the Dark Lord', set_name: 'Tales of Middle-earth', collector_number: '744', image_uris: { normal: 'https://x/sauron-alt.jpg' } }] })); // loose name + number
    const results = await searchScryfall('Sauron, Dark Lord', '', '', '744');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const secondQuery = decodeURIComponent(global.fetch.mock.calls[1][0]);
    expect(secondQuery).not.toContain('!"'); // not an exact-match query this time
    expect(secondQuery).toContain('number:744');
    expect(results[0].url).toBe('https://x/sauron-alt.jpg');
  });

  it('only drops the Number constraint entirely (the fully unscoped broad-name tier) once BOTH the exact-name and loose-name number-scoped tiers find nothing', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [] })) // exact name + number
      .mockResolvedValueOnce(jsonResponse({ data: [] })) // loose name + number
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Bruce Banner', set_name: 'SLD', collector_number: '2', image_uris: { normal: 'https://x/bb.jpg' } }] })); // broad, unscoped tier
    const results = await searchScryfall('Bruce Banner', '', '', '999');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(results[0].url).toBe('https://x/bb.jpg');
  });

  it('never turns setHint into a set: filter — Scryfall\'s set:/s:/e: operators only match a short set CODE, not the full set name this app actually stores', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Sol Ring', set_name: 'Commander', collector_number: '1', image_uris: { normal: 'https://x/sol.jpg' } }] }));
    await searchScryfall('Sol Ring', 'Commander Legends');
    const q = decodeURIComponent(global.fetch.mock.calls[0][0]);
    expect(q).not.toContain('set:');
    expect(q).not.toContain('e:');
    expect(q).not.toContain('Commander Legends');
  });

  it('retries once on a transient 5xx, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Sol Ring', set_name: 'Commander', collector_number: '1', image_uris: { normal: 'https://x/sol.jpg' } }] }));

      const promise = searchScryfall('Sol Ring');
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(results[0].url).toBe('https://x/sol.jpg');
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws once the retry is exhausted on the last tier, instead of reporting "no matches"', async () => {
    vi.useFakeTimers();
    try {
      global.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
      const promise = searchScryfall('Totally Made Up Card');
      const assertion = expect(promise).rejects.toThrow('502');
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates a persistent 5xx on the numberHint tier — falls through to the broad name tier instead of aborting the whole search', async () => {
    vi.useFakeTimers();
    try {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) }) // number tier, 1st attempt
        .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) }) // number tier retry — budget exhausted
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Bruce Banner', set_name: 'SLD', collector_number: '2', image_uris: { normal: 'https://x/bb.jpg' } }] })); // broad tier succeeds

      const promise = searchScryfall('Bruce Banner', '', '', '999');
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(results[0].url).toBe('https://x/bb.jpg');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back through usd -> usd_foil -> usd_etched -> usd_glossy when the nonfoil price is missing', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{ name: 'Foil-Only Card', set_name: 'SLD', collector_number: '1', image_uris: { normal: 'https://x/f.jpg' }, prices: { usd: null, usd_foil: '19.99', usd_etched: null } }],
    }));
    const results = await searchScryfall('Foil-Only Card');
    expect(results[0].price).toBe(19.99);
  });

  it('prefers a plain usd price over foil/etched/glossy when it is present', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{ name: 'Sol Ring', set_name: 'Commander', collector_number: '1', image_uris: { normal: 'https://x/sol.jpg' }, prices: { usd: '3.00', usd_foil: '9.00' } }],
    }));
    const results = await searchScryfall('Sol Ring');
    expect(results[0].price).toBe(3);
  });
});

describe('searchPokemon (TCGdex)', () => {
  // Real response shapes, trimmed from live TCGdex responses (2026-10-14).
  const IMG = (serie, set, n) => `https://assets.tcgdex.net/en/${serie}/${set}/${n}`;
  const brief = (id, name, localId, setName, rarity, serie = 'sv', image) => ({
    id, localId, name, rarity, set: { id: id.split('-')[0], name: setName },
    image: image === undefined ? IMG(serie, id.split('-')[0], localId) : image,
  });
  const fullCard = (tcgplayer) => ({ pricing: { tcgplayer } });

  // Routes the GraphQL search (POST) and single-card lookups (GET) the way
  // the real API does, so each test only describes the data it cares about.
  function mockTcgdex({ search = {}, cards = {} }) {
    global.fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/graphql')) {
        const name = JSON.parse(init.body).variables.name;
        const hit = search[name];
        if (hit instanceof Error) return { ok: false, status: 503, json: async () => ({}) };
        return jsonResponse({ data: { cards: hit || [] } });
      }
      const id = decodeURIComponent(url.split('/cards/')[1]);
      if (cards[id] === undefined) return { ok: false, status: 404, json: async () => ({ error: 'Endpoint or id not found' }) };
      return jsonResponse(cards[id]);
    });
  }
  const searchCalls = () => global.fetch.mock.calls.filter(([u]) => u.endsWith('/graphql'));

  it('searches TCGdex\'s GraphQL endpoint by name, then prices each candidate from its full card object', async () => {
    mockTcgdex({
      search: { Charizard: [brief('base1-4', 'Charizard', '4', 'Base Set', 'Rare', 'base')] },
      cards: { 'base1-4': fullCard({ unit: 'USD', holofoil: { productId: 42382, lowPrice: 489.99, midPrice: 587.98, highPrice: 3499.1, marketPrice: 990.98 } }) },
    });
    const results = await searchPokemon('Charizard');
    expect(searchCalls()).toHaveLength(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.tcgdex.net/v2/graphql');
    expect(results).toEqual([{
      url: 'https://assets.tcgdex.net/en/base/base1/4/high.webp',
      label: 'Charizard (Base Set) #4',
      price: 990.98,
      listingUrl: 'https://www.tcgplayer.com/product/42382',
      rarity: 'Rare', set: 'Base Set', number: '4',
    }]);
  });

  it('sends a possessive name verbatim (no Lucene sanitizing needed anymore), normalizing a curly apostrophe — TCGdex returns nothing for "’"', async () => {
    mockTcgdex({ search: { "Lillie's Clefairy ex": [brief('me02.5-280', "Lillie's Clefairy ex", '280', 'Ascended Heroes', 'Special illustration rare', 'me')] } });
    const results = await searchPokemon('Lillie’s Clefairy ex');
    expect(JSON.parse(searchCalls()[0][1].body).variables.name).toBe("Lillie's Clefairy ex");
    expect(results[0].number).toBe('280');
  });

  it('drops TCG Pocket (digital-only) cards and cards with no image', async () => {
    mockTcgdex({
      search: { 'Giratina ex': [
        brief('A2b-035', 'Giratina ex', '035', 'Shining Revelry', 'Four Diamond', 'tcgp'),
        brief('svp-1', 'Giratina ex', '1', 'SVP Black Star Promos', 'Promo', 'sv', null),
        brief('sv01-1', 'Giratina ex', '1', 'Scarlet & Violet', 'Double rare'),
      ] },
    });
    const results = await searchPokemon('Giratina ex');
    expect(results.map(r => r.set)).toEqual(['Scarlet & Violet']);
  });

  it('ranks an exact name match above cards that merely contain the name', async () => {
    mockTcgdex({ search: { Charizard: [
      brief('gym2-2', "Blaine's Charizard", '2', 'Gym Challenge', 'Rare', 'gym'),
      brief('base1-4', 'Charizard', '4', 'Base Set', 'Rare', 'base'),
    ] } });
    const results = await searchPokemon('Charizard');
    expect(results.map(r => r.label)).toEqual(['Charizard (Base Set) #4', "Blaine's Charizard (Gym Challenge) #2"]);
  });

  it('narrows by number + exact set name, stripping a "/total" denominator and leading zeros — and an exact set beats a loose one ("Base Set" vs "Base Set 2")', async () => {
    mockTcgdex({ search: { Charizard: [
      brief('base4-4', 'Charizard', '4', 'Base Set 2', 'Rare', 'base'),
      brief('base1-4', 'Charizard', '4', 'Base Set', 'Rare', 'base'),
      brief('base1-40', 'Charizard', '40', 'Base Set', 'Rare', 'base'),
    ] } });
    const results = await searchPokemon('Charizard', 'Base Set', '', '004/102');
    expect(results.map(r => r.label)).toEqual(['Charizard (Base Set) #4']);
  });

  it('prefers number over set when only one of them matches — the scan\'s set guess is the less reliable signal', async () => {
    mockTcgdex({ search: { "Lillie's Clefairy ex": [
      brief('sv09-056', "Lillie's Clefairy ex", '056', 'Journey Together', 'Double rare'),
      brief('me02.5-280', "Lillie's Clefairy ex", '280', 'Ascended Heroes', 'Special illustration rare', 'me'),
    ] } });
    const results = await searchPokemon("Lillie's Clefairy ex", 'Scarlet & Violet', '', '280');
    expect(results.map(r => r.number)).toEqual(['280']);
  });

  it('ignores hints that match nothing instead of zeroing out the search', async () => {
    mockTcgdex({ search: { Pikachu: [brief('base1-58', 'Pikachu', '58', 'Base Set', 'Common', 'base')] } });
    const results = await searchPokemon('Pikachu', 'Some Wrong Set', '', '999');
    expect(results).toHaveLength(1);
  });

  it('falls back to a first-word prefix search, using the dropped trailing code as a number hint ("Charizard EX XY121")', async () => {
    mockTcgdex({ search: {
      'Charizard EX XY121': [],
      'Charizard*': [
        brief('xy2-12', 'Charizard EX', '12', 'Flashfire', 'Ultra Rare', 'xy'),
        brief('xyp-XY121', 'Charizard EX', 'XY121', 'XY Black Star Promos', 'Promo', 'xy'),
      ],
    } });
    const results = await searchPokemon('Charizard EX XY121');
    expect(searchCalls().map(([, init]) => JSON.parse(init.body).variables.name)).toEqual(['Charizard EX XY121', 'Charizard*']);
    expect(results.map(r => r.number)).toEqual(['XY121']);
  });

  it('reuses an identical in-flight search instead of firing a duplicate request — same card, multiple copies on a page', async () => {
    mockTcgdex({ search: { Charizard: [brief('base1-4', 'Charizard', '4', 'Base Set', 'Rare', 'base')] } });
    const [r1, r2] = await Promise.all([searchPokemon('Charizard'), searchPokemon('Charizard')]);
    expect(searchCalls()).toHaveLength(1);
    expect(global.fetch.mock.calls.filter(([u]) => u.includes('/cards/'))).toHaveLength(1);
    expect(r1[0].url).toBe(r2[0].url);
  });

  it('caps candidates at 20, so a broad name costs at most 20 pricing requests', async () => {
    const many = Array.from({ length: 30 }, (_, i) => brief(`sv01-${i + 1}`, 'Pikachu', String(i + 1), 'Scarlet & Violet', 'Common'));
    mockTcgdex({ search: { Pikachu: many } });
    const results = await searchPokemon('Pikachu');
    expect(results).toHaveLength(20);
    expect(global.fetch.mock.calls.filter(([u]) => u.includes('/cards/'))).toHaveLength(20);
  });

  it('still returns a candidate (unpriced) when its single-card pricing lookup fails', async () => {
    mockTcgdex({ search: { Pikachu: [brief('base1-58', 'Pikachu', '58', 'Base Set', 'Common', 'base')] } });
    const results = await searchPokemon('Pikachu');
    expect(results[0]).toMatchObject({ price: null, listingUrl: null, number: '58' });
  });

  it('retries a search once after a transient 5xx, then throws instead of reporting "no matches"', async () => {
    vi.useFakeTimers();
    try {
      mockTcgdex({ search: { Charizard: new Error('down') } });
      const promise = searchPokemon('Charizard');
      const assertion = expect(promise).rejects.toThrow('503');
      await vi.runAllTimersAsync();
      await assertion;
      expect(searchCalls()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a failing first tier as empty and still tries the first-word fallback', async () => {
    vi.useFakeTimers();
    try {
      mockTcgdex({ search: {
        'Pikachu VMAX': new Error('down'),
        'Pikachu*': [brief('swsh4-44', 'Pikachu VMAX', '44', 'Vivid Voltage', 'Holo Rare VMAX', 'swsh')],
      } });
      const promise = searchPokemon('Pikachu VMAX');
      await vi.runAllTimersAsync();
      const results = await promise;
      expect(results[0]).toMatchObject({ number: '44', rarity: 'Rare Holo VMAX' });
    } finally {
      vi.useRealTimers();
    }
  });

  describe('pricing', () => {
    async function priceOf(tcgplayer) {
      mockTcgdex({
        search: { 'Mega Gengar ex': [brief('me02.5-269', 'Mega Gengar ex', '269', 'Ascended Heroes', 'Ultra Rare', 'me')] },
        cards: { 'me02.5-269': fullCard(tcgplayer) },
      });
      return (await searchPokemon('Mega Gengar ex'))[0];
    }

    it('falls back to a listing-based (low/high) price when a low-volume card has no sold-listing (market/mid) data', async () => {
      const r = await priceOf({ holofoil: { productId: 1, marketPrice: null, midPrice: null, lowPrice: 40, highPrice: 120 } });
      expect(r.price).toBe(80);
    });

    it('prefers mid over a low/high average, and market over mid', async () => {
      expect((await priceOf({ holofoil: { productId: 1, midPrice: 95, lowPrice: 40, highPrice: 120 } })).price).toBe(95);
      __resetPokemonQueryCacheForTests();
      expect((await priceOf({ holofoil: { productId: 1, marketPrice: 33.46, midPrice: 95 } })).price).toBe(33.46);
    });

    it('prefers the normal variant over reverse holo, and accepts the docs\' "reverse"/"holo" spellings as well as the live API\'s "reverse-holofoil"/"holofoil"', async () => {
      expect((await priceOf({ 'reverse-holofoil': { productId: 2, marketPrice: 0.2 }, normal: { productId: 1, marketPrice: 0.12 } })).price).toBe(0.12);
      __resetPokemonQueryCacheForTests();
      expect((await priceOf({ reverse: { productId: 2, marketPrice: 0.23 } })).price).toBe(0.23);
      __resetPokemonQueryCacheForTests();
      expect((await priceOf({ holo: { productId: 3, marketPrice: 5 } })).listingUrl).toBe('https://www.tcgplayer.com/product/3');
    });

    it('returns no price for a card TCGdex has no TCGPlayer data for, without failing the search', async () => {
      const r = await priceOf(undefined);
      expect(r).toMatchObject({ price: null, listingUrl: null });
    });
  });
});

describe('pokemonRarityFromTcgdex', () => {
  it('translates TCGdex\'s rarity names into the app\'s existing vocabulary', () => {
    expect(pokemonRarityFromTcgdex('Double rare', 'sv').rarity).toBe('Double Rare');
    expect(pokemonRarityFromTcgdex('Special illustration rare', 'sv').rarity).toBe('Special Illustration Rare');
    expect(pokemonRarityFromTcgdex('Hyper rare', 'sv').rarity).toBe('Hyper Rare');
    expect(pokemonRarityFromTcgdex('Holo Rare', 'ex').rarity).toBe('Rare Holo');
    expect(pokemonRarityFromTcgdex('Holo Rare V', 'swsh').rarity).toBe('Rare Holo V');
    expect(pokemonRarityFromTcgdex('Secret Rare', 'sm').rarity).toBe('Rare Secret');
    expect(pokemonRarityFromTcgdex('Rare Holo LV.X', 'dp').rarity).toBe('Rare Holo LV.X');
    expect(pokemonRarityFromTcgdex('Promo', 'xy').rarity).toBe('Promo');
    expect(pokemonRarityFromTcgdex('None', 'base').rarity).toBe('');
  });

  it('maps "Ultra Rare" only where it\'s unambiguous (Scarlet & Violet, Sword & Shield)', () => {
    expect(pokemonRarityFromTcgdex('Ultra Rare', 'sv')).toEqual({ rarity: 'Ultra Rare', aliases: [] });
    expect(pokemonRarityFromTcgdex('Ultra Rare', 'swsh')).toEqual({ rarity: 'Rare Ultra', aliases: [] });
  });

  it('leaves an ambiguous "Ultra Rare" blank (so a pick never overwrites Rarity) but keeps the plausible values for hint matching', () => {
    // Confirmed live: xy7-57 (regular-art) and xy7-93 (full-art) Giratina EX
    // both report "Ultra Rare"; so does Mega Gengar ex's Mega Attack Rare print.
    expect(pokemonRarityFromTcgdex('Ultra Rare', 'xy')).toEqual({ rarity: '', aliases: ['Rare Ultra', 'Rare Holo EX', 'Rare Holo GX'] });
    expect(pokemonRarityFromTcgdex('Ultra Rare', 'me')).toEqual({ rarity: '', aliases: ['Ultra Rare', 'Mega Attack Rare'] });
  });

  it('lets a rarity hint still match an ambiguous print through its aliases', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url.endsWith('/graphql')) {
        return jsonResponse({ data: { cards: [
          { id: 'me02.5-125', localId: '125', name: 'Mega Gengar ex', rarity: 'Double rare', image: 'https://assets.tcgdex.net/en/me/me02.5/125', set: { id: 'me02.5', name: 'Ascended Heroes' } },
          { id: 'me02.5-269', localId: '269', name: 'Mega Gengar ex', rarity: 'Ultra Rare', image: 'https://assets.tcgdex.net/en/me/me02.5/269', set: { id: 'me02.5', name: 'Ascended Heroes' } },
        ] } });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    const results = await searchPokemon('Mega Gengar ex', '', 'Mega Attack Rare');
    expect(results[0]).toMatchObject({ number: '269', rarity: '' });
  });
});

describe('tcgplayerSearchUrl', () => {
  it('builds a real, game-agnostic TCGPlayer search URL from name + set', () => {
    expect(tcgplayerSearchUrl('Mega Gengar ex', 'Ascended Heroes'))
      .toBe('https://www.tcgplayer.com/search/all/product?q=Mega%20Gengar%20ex%20Ascended%20Heroes&view=grid');
  });

  it('omits the set when blank rather than leaving a trailing space in the query', () => {
    expect(tcgplayerSearchUrl('Charizard', '')).toBe('https://www.tcgplayer.com/search/all/product?q=Charizard&view=grid');
  });
});

describe('ebaySoldSearchUrl', () => {
  it('builds a real, game-agnostic eBay sold+completed listings search URL from name + set', () => {
    expect(ebaySoldSearchUrl('Mega Gengar ex', 'Ascended Heroes'))
      .toBe('https://www.ebay.com/sch/i.html?_nkw=Mega%20Gengar%20ex%20Ascended%20Heroes&LH_Sold=1&LH_Complete=1');
  });

  it('omits the set when blank rather than leaving a trailing space in the query', () => {
    expect(ebaySoldSearchUrl('Charizard', '')).toBe('https://www.ebay.com/sch/i.html?_nkw=Charizard&LH_Sold=1&LH_Complete=1');
  });
});

describe('priceChartingSearchUrl', () => {
  it('builds a game-agnostic PriceCharting search URL from name + set', () => {
    expect(priceChartingSearchUrl('Mega Gengar ex', 'Ascended Heroes'))
      .toBe('https://www.pricecharting.com/search-products?type=prices&q=Mega%20Gengar%20ex%20Ascended%20Heroes');
  });

  it('omits the set when blank rather than leaving a trailing space in the query', () => {
    expect(priceChartingSearchUrl('Charizard', '')).toBe('https://www.pricecharting.com/search-products?type=prices&q=Charizard');
  });
});

describe('searchYugioh', () => {
  it('uses the full name first', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{ name: 'Blue-Eyes White Dragon', card_images: [{ image_url: 'https://x/bewd.jpg' }], card_prices: [{ tcgplayer_price: '12.00' }] }],
    }));
    const results = await searchYugioh('Blue-Eyes White Dragon');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ url: 'https://x/bewd.jpg', label: 'Blue-Eyes White Dragon', price: 12 });
  });

  it('drops the last word and retries if the full name finds nothing', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Blue-Eyes White Dragon', card_images: [{ image_url: 'https://x/bewd.jpg' }] }] }));
    const results = await searchYugioh('Blue-Eyes White Dragon Alternate');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(global.fetch.mock.calls[1][0])).toContain('Blue-Eyes White Dragon');
    expect(results[0].url).toBe('https://x/bewd.jpg');
  });

  it('reports a real card_sets rarity/set label instead of leaving them blank', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{
        name: 'Tornado Dragon',
        card_images: [{ image_url: 'https://x/tornado.jpg' }],
        card_sets: [{ set_name: 'Battles of Legend: Relentless Revenge', set_code: 'BLRR-EN084', set_rarity: 'Secret Rare', set_price: '4.08' }],
      }],
    }));
    const results = await searchYugioh('Tornado Dragon');
    expect(results[0]).toMatchObject({ rarity: 'Secret Rare', set: 'Battles of Legend: Relentless Revenge', price: 4.08 });
  });

  it('picks the card_sets entry matching numberHint (the printed set code) over the first one, since it is the strongest signal', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{
        name: 'Tornado Dragon',
        card_images: [{ image_url: 'https://x/tornado.jpg' }],
        card_sets: [
          { set_name: 'Battles of Legend: Relentless Revenge', set_code: 'BLRR-EN084', set_rarity: 'Secret Rare', set_price: '4.08' },
          { set_name: 'Duel Devastator', set_code: 'DUDE-EN019', set_rarity: 'Ultra Rare', set_price: '1.4' },
        ],
      }],
    }));
    const results = await searchYugioh('Tornado Dragon', '', '', 'DUDE-EN019');
    expect(results[0]).toMatchObject({ rarity: 'Ultra Rare', set: 'Duel Devastator', price: 1.4 });
  });

  it('falls back to setHint, then rarityHint, then the first entry, when numberHint does not match anything', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      data: [{
        name: 'Tornado Dragon',
        card_images: [{ image_url: 'https://x/tornado.jpg' }],
        card_sets: [
          { set_name: 'Battles of Legend: Relentless Revenge', set_code: 'BLRR-EN084', set_rarity: 'Secret Rare', set_price: '4.08' },
          { set_name: 'Duel Devastator', set_code: 'DUDE-EN019', set_rarity: 'Ultra Rare', set_price: '1.4' },
        ],
      }],
    }));
    const results = await searchYugioh('Tornado Dragon', 'Duel Devastator', '', '');
    expect(results[0]).toMatchObject({ rarity: 'Ultra Rare', set: 'Duel Devastator' });
  });

  it('retries once on a transient 5xx, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Blue-Eyes White Dragon', card_images: [{ image_url: 'https://x/bewd.jpg' }] }] }));

      const promise = searchYugioh('Blue-Eyes White Dragon');
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(results[0].url).toBe('https://x/bewd.jpg');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an empty array (not a throw) on a persistent non-5xx failure — this API\'s "no results" signal is not confirmed, so it is not treated as an error', async () => {
    // A single-word name so there's no "drop the last word" fallback tier
    // to also account for — isolates this test to the one query's status
    // handling.
    global.fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    const results = await searchYugioh('Nonexistentcardxyz');
    expect(results).toEqual([]);
  });
});

describe('searchLorcana', () => {
  it('maps Lorcast results including the version/set/number/rarity label, structured fields, and a real listingUrl', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      results: [{
        name: 'Mickey Mouse', version: 'Brave Little Tailor',
        set: { name: 'The First Chapter', code: '1' }, collector_number: '18', rarity: 'Uncommon',
        image_uris: { digital: { normal: 'https://x/mickey.jpg' } },
        prices: { usd: '25.00' },
        purchase_uris: { tcgplayer: 'https://tcg/mickey' },
      }],
    }));
    const results = await searchLorcana('Mickey Mouse');
    expect(results).toEqual([{
      url: 'https://x/mickey.jpg',
      label: 'Mickey Mouse - Brave Little Tailor (The First Chapter #18 · Uncommon)',
      price: 25, listingUrl: 'https://tcg/mickey', rarity: 'Uncommon', set: '1', number: '18',
    }]);
  });

  it('falls back to usd_foil when usd is null, same nonfoil-first fallback as Scryfall', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      results: [{ name: 'Owl', image_uris: { digital: { normal: 'https://x/owl.jpg' } }, prices: { usd: null, usd_foil: '0.22' } }],
    }));
    const results = await searchLorcana('Owl');
    expect(results[0].price).toBe(0.22);
  });

  it('tries name + set + collector-number together first, using the real s:/cn: query operators', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ results: [{ name: 'Lilo', image_uris: { digital: { normal: 'https://x/lilo.jpg' } } }] }));
    await searchLorcana('Lilo', '6', '', '154/204');
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('Lilo s:6 cn:154');
  });

  it('falls through to a name-only search when the most specific tier finds nothing', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ results: [] })) // set+number tier
      .mockResolvedValueOnce(jsonResponse({ results: [] })) // number-alone tier
      .mockResolvedValueOnce(jsonResponse({ results: [] })) // set-alone tier
      .mockResolvedValueOnce(jsonResponse({ results: [{ name: 'Lilo', image_uris: { digital: { normal: 'https://x/lilo.jpg' } } }] }));
    const results = await searchLorcana('Lilo', '6', '', '999');
    expect(global.fetch).toHaveBeenCalledTimes(4);
    const lastQuery = decodeURIComponent(global.fetch.mock.calls[3][0]).split('q=')[1];
    expect(lastQuery).toBe('Lilo');
    expect(results[0].url).toBe('https://x/lilo.jpg');
  });

  it('reorders by rarityHint without dropping results, normalizing the real API\'s "Super_rare" formatting quirk', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      results: [
        { name: 'Elsa', rarity: 'Rare', image_uris: { digital: { normal: 'https://x/elsa-r.jpg' } } },
        { name: 'Elsa', rarity: 'Super_rare', image_uris: { digital: { normal: 'https://x/elsa-sr.jpg' } } },
      ],
    }));
    const results = await searchLorcana('Elsa', '', 'Super Rare', '');
    expect(results[0].url).toBe('https://x/elsa-sr.jpg');
    expect(results).toHaveLength(2);
  });

  it('retries once on a transient 5xx, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce(jsonResponse({ results: [{ name: 'Stitch', image_uris: { digital: { normal: 'https://x/stitch.jpg' } } }] }));

      const promise = searchLorcana('Stitch');
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(results[0].url).toBe('https://x/stitch.jpg');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an empty array (not a throw) on a persistent non-5xx failure — this API\'s "no results" signal is not confirmed, so it is not treated as an error', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    const results = await searchLorcana('Nonexistentcardxyz');
    expect(results).toEqual([]);
  });
});

describe('proxy-backed searches (One Piece / Riftbound / Gundam / SWU)', () => {
  it('calls card-lookup-proxy with the right provider name and forwards the query/setHint', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [{ url: 'https://x/op.jpg', label: 'Luffy' }] }, error: null });
    const results = await searchOnePiece('Luffy', 'OP01');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'onepiece', query: 'Luffy', setHint: 'OP01', rarityHint: '', numberHint: '' } });
    expect(results).toEqual([{ url: 'https://x/op.jpg', label: 'Luffy' }]);
  });

  it('forwards a numberHint for One Piece', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchOnePiece('Luffy', 'OP01', '', '001');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'onepiece', query: 'Luffy', setHint: 'OP01', rarityHint: '', numberHint: '001' } });
  });

  it.each([
    ['riftbound', searchRiftbound],
    ['gundam', searchGundam],
    ['swu', searchSwu],
  ])('%s dispatches with the matching provider name', async (provider, fn) => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await fn('Some Card');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider, query: 'Some Card', setHint: '', rarityHint: '', numberHint: '' } });
  });

  it('forwards setHint/rarityHint for SWU (applied server-side as a soft narrowing filter, not a query operator)', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchSwu('Vader', 'Spark of Rebellion', 'Legendary');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'swu', query: 'Vader', setHint: 'Spark of Rebellion', rarityHint: 'Legendary', numberHint: '' } });
  });

  it('forwards a numberHint for Riftbound, same as One Piece', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchRiftbound('Sett', 'OGN', '', '310');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'riftbound', query: 'Sett', setHint: 'OGN', rarityHint: '', numberHint: '310' } });
  });

  it('forwards a numberHint for Gundam, same as One Piece/Riftbound', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchGundam('Wing Gundam', 'GD01', '', '001');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'gundam', query: 'Wing Gundam', setHint: 'GD01', rarityHint: '', numberHint: '001' } });
  });

  it('returns an empty array (not an error) when the proxy call fails', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    const results = await searchOnePiece('Luffy');
    expect(results).toEqual([]);
  });
});

describe('searchCardImage dispatcher', () => {
  it('returns null for a game with no search implementation, without touching the network', async () => {
    const results = await searchCardImage('Sports Singles', 'Some Card');
    expect(results).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns [] immediately for a blank name, without touching the network', async () => {
    const results = await searchCardImage('Magic', '');
    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dispatches Magic to Scryfall', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await searchCardImage('Magic', 'Sol Ring');
    expect(global.fetch.mock.calls[0][0]).toContain('api.scryfall.com');
  });

  it('forwards a numberHint through to Scryfall for Magic, same as Pokemon', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ data: [{ name: 'Bruce Banner', set_name: 'SLD', collector_number: '42', image_uris: { normal: 'https://x/bb.jpg' } }] }));
    await searchCardImage('Magic', 'Bruce Banner', '', '', '42');
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('number:42');
  });

  it('dispatches Lorcana to Lorcast, forwarding setHint/numberHint as real s:/cn: query operators', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ results: [{ name: 'Lilo', image_uris: { digital: { normal: 'https://x/lilo.jpg' } } }] }));
    await searchCardImage('Lorcana', 'Lilo', '6', '', '154');
    expect(global.fetch.mock.calls[0][0]).toContain('api.lorcast.com');
    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('Lilo s:6 cn:154');
  });

  it('dispatches Riftbound to the proxy, forwarding a numberHint', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchCardImage('Riftbound', 'Sett', 'OGN', '', '310');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'riftbound', query: 'Sett', setHint: 'OGN', rarityHint: '', numberHint: '310' } });
  });

  it('dispatches Gundam to the proxy, forwarding a numberHint', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchCardImage('Gundam', 'Wing Gundam', 'GD01', '', '001');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'gundam', query: 'Wing Gundam', setHint: 'GD01', rarityHint: '', numberHint: '001' } });
  });

  it('dispatches One Piece to the proxy with the "onepiece" provider', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchCardImage('One Piece', 'Luffy', 'OP01');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'onepiece', query: 'Luffy', setHint: 'OP01', rarityHint: '', numberHint: '' } });
  });

  it('forwards a numberHint through to the proxy for One Piece, same as Magic/Pokemon', async () => {
    invokeMock.mockResolvedValueOnce({ data: { results: [] }, error: null });
    await searchCardImage('One Piece', 'Luffy', 'OP01', '', '001');
    expect(invokeMock).toHaveBeenCalledWith('card-lookup-proxy', { body: { provider: 'onepiece', query: 'Luffy', setHint: 'OP01', rarityHint: '', numberHint: '001' } });
  });
});
