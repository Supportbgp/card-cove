import { describe, it, expect } from 'vitest';
import {
  parseQuoteDate, parseQuoteStatus, parseCondition, splitCardText, parseQuoteSheet,
  buildImportedQuote, looksAlreadyImported,
} from './quoteImport.js';

// A sheet laid out like the shop's real quote template (rows as XLSX's
// sheet_to_json with header: 1 returns them; column A is unused).
function templateRows({ status = 'Accepted Cash ', payout = 143, priceHeader = 'Price', cards } = {}) {
  return [
    [null, 'Customer Name:', 'John Cena', 'Customer ID:', 12345, 'Phone #:', '555-1234'],
    [null, 'Date Quoted:', 46258, null, null],
    [null, 'Offer Status:', status, 'Payout Amount:', payout],
    [null, null, null, 'Paid Out?', true],
    [null, 'Time taken to Quote:', '20 min', 'Employee:', 'Noah'],
    [null, 'Name of Card', 'Set - PKM #', 'Condition', priceHeader, 'Qty', 'Notes:'],
    ...(cards || [
      [null, "Ethan's Typhlosion - 190/182 - SV10: Destined Rivals (DRI)", null, 'Light P', 40, null, null],
      [null, 'Lapras GX (Full Art) - SM Base Set (SM01)', null, 'NM', 12.5, 2, 'binder 1'],
      [null, 'Pikachu', 'Base Set - 58/102', 'Heavy P', '$3', 1, null],
    ]),
  ];
}

describe('parseQuoteDate', () => {
  it('reads an Excel day number', () => {
    expect(parseQuoteDate(46258)).toBe('2026-08-24');
  });
  it('reads ISO and US date strings', () => {
    expect(parseQuoteDate('2026-08-24')).toBe('2026-08-24');
    expect(parseQuoteDate('8/4/26')).toBe('2026-08-04');
    expect(parseQuoteDate('08/24/2026')).toBe('2026-08-24');
  });
  it('returns blank for nothing or nonsense', () => {
    expect(parseQuoteDate(null)).toBe('');
    expect(parseQuoteDate('soon')).toBe('');
  });
});

describe('parseQuoteStatus', () => {
  it('maps the sheet\'s statuses onto the app\'s offer status', () => {
    expect(parseQuoteStatus('Accepted Cash ').status).toBe('accepted_cash');
    expect(parseQuoteStatus('Accepted Store Credit').status).toBe('accepted_store_credit');
    expect(parseQuoteStatus('Rejected Offer').status).toBe('rejected');
  });
  it('treats blank as still in progress', () => {
    expect(parseQuoteStatus(null)).toEqual({ status: null, unrecognized: '' });
  });
  it('flags a status it doesn\'t know, and imports it as in progress', () => {
    expect(parseQuoteStatus('Thinking about it')).toEqual({ status: null, unrecognized: 'Thinking about it' });
  });
});

describe('parseCondition', () => {
  it('turns shorthand into the app\'s full condition names', () => {
    expect(parseCondition('Light P')).toBe('Lightly Played');
    expect(parseCondition('NM')).toBe('Near Mint');
    expect(parseCondition('Heavy P')).toBe('Heavily Played');
  });
  it('keeps anything it doesn\'t recognize as typed', () => {
    expect(parseCondition('Graded 9')).toBe('Graded 9');
    expect(parseCondition(null)).toBe('');
  });
});

describe('splitCardText', () => {
  it('splits name, collector number and set', () => {
    expect(splitCardText("Ethan's Typhlosion - 190/182 - SV10: Destined Rivals (DRI)")).toEqual({
      name: "Ethan's Typhlosion", number: '190/182', set: 'SV10: Destined Rivals (DRI)',
    });
  });
  it('recognizes promo-style numbers', () => {
    expect(splitCardText('Charizard V - SWSH050 - SWSH Black Star Promos').number).toBe('SWSH050');
    expect(splitCardText('Umbreon - TG05/TG30 - Lost Origin').number).toBe('TG05/TG30');
  });
  it('treats a part without a number as the set', () => {
    expect(splitCardText('Sleight of Hand - Secrets of Strixhaven')).toEqual({
      name: 'Sleight of Hand', number: '', set: 'Secrets of Strixhaven',
    });
  });
  it('leaves a plain name alone', () => {
    expect(splitCardText('Pikachu')).toEqual({ name: 'Pikachu', number: '', set: '' });
  });
});

describe('parseQuoteSheet', () => {
  it('reads the header block and every card row', () => {
    const q = parseQuoteSheet(templateRows(), 'Example 1');
    expect(q).toMatchObject({
      sheetName: 'Example 1', customerName: 'John Cena', customerId: '12345', phone: '555-1234',
      dateQuoted: '2026-08-24', offerStatus: 'accepted_cash', payoutAmount: 143, paidOut: true,
      timeTaken: '20 min', employee: 'Noah',
    });
    expect(q.items).toEqual([
      { name: "Ethan's Typhlosion", set: 'SV10: Destined Rivals (DRI)', number: '190/182', condition: 'Lightly Played', price: 40, qty: 1, notes: '' },
      { name: 'Lapras GX (Full Art)', set: 'SM Base Set (SM01)', number: '', condition: 'Near Mint', price: 12.5, qty: 2, notes: 'binder 1' },
      { name: 'Pikachu', set: 'Base Set', number: '58/102', condition: 'Heavily Played', price: 3, qty: 1, notes: '' },
    ]);
    expect(q.warnings).toEqual([]);
  });

  it('finds Price as the column left of Qty when its header is missing (as on a real sheet)', () => {
    const q = parseQuoteSheet(templateRows({ priceHeader: null }), 'Example 4');
    expect(q.items.map(i => i.price)).toEqual([40, 12.5, 3]);
  });

  it('returns null for an unused copy of the template', () => {
    const rows = [
      [null, 'Customer Name:', null, 'Customer ID:', null, 'Phone #:', null],
      [null, 'Date Quoted:', null],
      [null, 'Offer Status:', null, 'Payout Amount:', null],
      [null, 'Name of Card', 'Set - PKM #', 'Condition', 'Price', 'Qty', 'Notes:'],
    ];
    expect(parseQuoteSheet(rows, 'Template')).toBe(null);
  });

  it('doesn\'t read the next label as a blank field\'s value', () => {
    const rows = templateRows();
    rows[0][2] = null; // Customer Name left blank
    rows[0][3] = 'Customer ID:';
    const q = parseQuoteSheet(rows, 'S');
    expect(q.customerName).toBe('');
  });

  it('warns about missing prices, an unknown status, and an accepted quote with no payout', () => {
    const q = parseQuoteSheet(templateRows({
      status: 'Accepted Cash', payout: null,
      cards: [[null, 'Pikachu', null, 'NM', null, null, null]],
    }), 'S');
    expect(q.warnings).toEqual([
      '1 card(s) have no price.',
      'Accepted, but no payout amount, so the cards get no Cost.',
    ]);
    const odd = parseQuoteSheet(templateRows({ status: 'Maybe' }), 'S');
    expect(odd.offerStatus).toBe(null);
    expect(odd.warnings[0]).toContain('"Maybe"');
  });
});

describe('buildImportedQuote', () => {
  it('builds a new quote with every card given the picked game', () => {
    const quote = buildImportedQuote(parseQuoteSheet(templateRows(), 'Example 1'), 'Pokemon');
    expect(quote).toMatchObject({
      id: null, collectionName: 'John Cena (2026-08-24)', customerName: 'John Cena', dateQuoted: '2026-08-24',
      offerStatus: 'accepted_cash', payoutAmount: 143, paidOut: true, employee: 'Noah', movedToSorting: false,
    });
    expect(quote.intakeNotes).toContain('Example 1');
    expect(quote.items).toHaveLength(3);
    expect(quote.items.every(i => i.game === 'Pokemon' && i.id)).toBe(true);
    expect(quote.items[1]).toMatchObject({ name: 'Lapras GX (Full Art)', qty: 2, price: 12.5, condition: 'Near Mint' });
    expect(quote.items[0].number).toBe('190/182');
  });
});

describe('looksAlreadyImported', () => {
  const parsed = parseQuoteSheet(templateRows(), 'Example 1');
  it('matches the same customer, date and card count', () => {
    expect(looksAlreadyImported(parsed, [
      { customerName: 'john cena ', dateQuoted: '2026-08-24', items: [{}, {}, {}] },
    ])).toBe(true);
  });
  it('doesn\'t match a different date or card count', () => {
    expect(looksAlreadyImported(parsed, [
      { customerName: 'John Cena', dateQuoted: '2026-08-25', items: [{}, {}, {}] },
      { customerName: 'John Cena', dateQuoted: '2026-08-24', items: [{}] },
    ])).toBe(false);
  });
});
