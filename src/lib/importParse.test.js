import { describe, it, expect, vi } from 'vitest';
import {
  guessHeader, isLikelyImageUrl, looksNumeric, guessGameFromSheetName,
  runWithConcurrency, parseCsvFile, FIELD_TARGETS,
} from './importParse.js';

// Note: loadXlsxSheet/loadBinderPageFormat/readWorkbook (the .xlsx-specific
// parsing paths) aren't covered here — they need a real workbook fixture and
// FileReader roundtrip to test meaningfully, and have been exercised via
// manual testing instead (see CLAUDE.md). Everything below is the part of
// importParse.js that's pure logic and cheap to verify directly.

describe('FIELD_TARGETS: Cost', () => {
  const cost = FIELD_TARGETS.find(f => f.key === 'cost');
  it('is a mappable column', () => {
    expect(cost.label).toBe('Cost ($)');
  });
  it('picks up the usual spellings of a cost column', () => {
    expect(guessHeader(cost.aliases, ['Name', 'Price', 'Cost'])).toBe('Cost');
    expect(guessHeader(cost.aliases, ['Name', 'Unit Cost'])).toBe('Unit Cost');
    expect(guessHeader(cost.aliases, ['Name', 'Purchase Price'])).toBe('Purchase Price');
  });
  it("doesn't mistake the Price column for it", () => {
    expect(guessHeader(cost.aliases, ['Name', 'Price', 'Market Price'])).toBe('');
  });
});

describe('guessHeader', () => {
  it('finds a header matching one of the aliases, case-insensitively', () => {
    expect(guessHeader(['name', 'card name'], ['SKU', 'Card Name', 'Price'])).toBe('Card Name');
  });
  it('returns an empty string when nothing matches', () => {
    expect(guessHeader(['name'], ['SKU', 'Price'])).toBe('');
  });
});

describe('isLikelyImageUrl', () => {
  it('recognizes common image extensions', () => {
    expect(isLikelyImageUrl('https://example.com/card.jpg')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/card.PNG')).toBe(true);
    expect(isLikelyImageUrl('https://example.com/card.jpg?w=200')).toBe(true);
  });
  it('recognizes the TCGplayer CDN host regardless of extension', () => {
    expect(isLikelyImageUrl('https://tcgplayer-cdn.tcgplayer.com/foo/bar')).toBe(true);
  });
  it('rejects a normal product page link', () => {
    expect(isLikelyImageUrl('https://www.tcgplayer.com/product/12345')).toBe(false);
  });
  it('rejects blank input', () => {
    expect(isLikelyImageUrl('')).toBe(false);
    expect(isLikelyImageUrl(null)).toBe(false);
  });
});

describe('looksNumeric', () => {
  it('accepts plain numbers and money-formatted strings', () => {
    expect(looksNumeric('42')).toBe(true);
    expect(looksNumeric('$1,234.50')).toBe(true);
  });
  it('rejects text and blank strings', () => {
    expect(looksNumeric('Card Name')).toBe(false);
    expect(looksNumeric('')).toBe(false);
    expect(looksNumeric(null)).toBe(false);
  });
});

describe('guessGameFromSheetName', () => {
  it('matches known game keywords regardless of case', () => {
    expect(guessGameFromSheetName('MTG Singles')).toBe('Magic');
    expect(guessGameFromSheetName('pokemon binder 1')).toBe('Pokemon');
    expect(guessGameFromSheetName('Yu-Gi-Oh Cards')).toBe('Yugioh');
    expect(guessGameFromSheetName('Star Wars stuff')).toBe('SWU');
  });
  it('returns an empty string when nothing matches', () => {
    expect(guessGameFromSheetName('Sheet1')).toBe('');
  });
});

describe('runWithConcurrency', () => {
  it('processes every item exactly once', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const seen = [];
    await runWithConcurrency(items, 4, async (item) => { seen.push(item); });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });
  it('never runs more than `limit` workers at once', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let active = 0, maxActive = 0;
    await runWithConcurrency(items, 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });
  it('handles a limit larger than the item count without error', async () => {
    const seen = [];
    await runWithConcurrency([1, 2], 10, async (item) => { seen.push(item); });
    expect(seen.sort()).toEqual([1, 2]);
  });
});

describe('parseCsvFile', () => {
  function makeFile(content) {
    return new File([content], 'test.csv', { type: 'text/csv' });
  }

  it('parses a well-formed CSV into row objects keyed by header', async () => {
    const file = makeFile('Name,Qty,Price\nCharizard,3,45.00\nBlastoise,1,20\n');
    const result = await parseCsvFile(file);
    expect(result.headers).toEqual(['Name', 'Qty', 'Price']);
    expect(result.rows).toEqual([
      { Name: 'Charizard', Qty: '3', Price: '45.00' },
      { Name: 'Blastoise', Qty: '1', Price: '20' },
    ]);
  });

  it('rejects a file with no rows instead of resolving with an empty result', async () => {
    const file = makeFile('Name,Qty,Price\n');
    await expect(parseCsvFile(file)).rejects.toThrow('No rows found');
  });
});
