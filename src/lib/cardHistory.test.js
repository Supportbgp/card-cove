import { describe, it, expect } from 'vitest';
import { rowToHistory, describeHistory, formatHistoryValue } from './cardHistory.js';

describe('describeHistory', () => {
  it('reads a move, qty and price change, most useful fields first', () => {
    const e = rowToHistory({
      id: 1, sku: 'k1', name: 'Kangaskhan EX', action: 'update', changed_at: '2026-11-10T15:00:00Z',
      changes: {
        price: { from: 25, to: 30 }, qty: { from: 1, to: 0 }, sold: { from: false, to: true },
        location: { from: 'Card Show Binder', to: 'Power Packs' }, image_data: { changed: true },
      },
    });
    expect(describeHistory(e)).toEqual([
      'Binder / case: Card Show Binder → Power Packs',
      'Qty: 1 → 0',
      'Sold: No → Yes',
      'Our price: $25.00 → $30.00',
      'Stock image changed',
    ]);
  });

  it('sums up an added or deleted card in one line', () => {
    expect(describeHistory({ action: 'insert', changes: { location: 'Binder A', qty: 2, price: 3.5 } }))
      .toEqual(['Added (in Binder A, qty 2, $3.50)']);
    expect(describeHistory({ action: 'delete', changes: { qty: 0, sold: true } }))
      .toEqual(['Deleted (qty 0, sold)']);
  });

  it('shows blanks and booleans plainly', () => {
    expect(formatHistoryValue('notes', '')).toBe('(blank)');
    expect(formatHistoryValue('cost', null)).toBe('(blank)');
    expect(formatHistoryValue('pos_synced', true)).toBe('Yes');
  });
});
