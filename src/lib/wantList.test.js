import { describe, it, expect } from 'vitest';
import {
  rowToWant, wantToRow, wantDetailLine, wantPriceLabel, wantStockMatches, wantsForCard, wantedByLine,
} from './wantList.js';

const row = {
  id: 'w1', game: 'Pokemon', name: 'Charizard', set_name: 'Base Set', number: '4', rarity: 'Rare Holo',
  printing: '', condition: 'Near Mint', image_url: 'https://img/x.png', max_price: '250', customer_name: 'Jake',
  customer_contact: '555-0100', responsible: 'Noah', notes: 'Any copy', show_public: false, status: 'open',
  created_at: '2026-11-01T00:00:00.000Z', closed_at: null,
};

describe('row mapping', () => {
  it('maps a row both ways', () => {
    const w = rowToWant(row);
    expect(w).toMatchObject({
      set: 'Base Set', maxPrice: 250, customerName: 'Jake', customerContact: '555-0100',
      responsible: 'Noah', showPublic: false, status: 'open',
    });
    expect(wantToRow(w)).toEqual({
      game: 'Pokemon', name: 'Charizard', set_name: 'Base Set', number: '4', rarity: 'Rare Holo', printing: '',
      condition: 'Near Mint', image_url: 'https://img/x.png', max_price: 250, customer_name: 'Jake',
      customer_contact: '555-0100', responsible: 'Noah', notes: 'Any copy', show_public: false,
    });
  });

  it('treats a public-view row as open and shown, and a blank price as none', () => {
    const w = rowToWant({ id: 'w2', name: 'Mew' });
    expect(w.status).toBe('open');
    expect(w.showPublic).toBe(true);
    expect(w.maxPrice).toBeNull();
    expect(wantToRow({ name: ' Mew ', maxPrice: '' }).max_price).toBeNull();
    expect(wantToRow({ name: ' Mew ', maxPrice: '' }).name).toBe('Mew');
  });
});

describe('labels', () => {
  it('builds the detail and price lines', () => {
    const w = rowToWant(row);
    expect(wantDetailLine(w)).toBe('Base Set · #4 · Rare Holo · Near Mint');
    expect(wantPriceLabel(w)).toBe('Up to $250.00');
    expect(wantPriceLabel({ maxPrice: null })).toBe('No price given');
  });

  it('lists who wants a card', () => {
    expect(wantedByLine([
      { customerName: 'Jake', maxPrice: 40 },
      { customerName: '', maxPrice: null },
    ])).toBe('Jake (up to $40.00), a customer');
  });
});

describe('matching', () => {
  const wants = [
    { id: 'a', game: 'Pokemon', name: 'Charizard', status: 'open' },
    { id: 'b', game: 'Magic', name: 'Charizard', status: 'open' },
    { id: 'c', game: 'Pokemon', name: 'charizard ', status: 'fulfilled' },
  ];

  it('finds open requests by name and game', () => {
    expect(wantsForCard({ name: 'charizard', game: 'Pokemon' }, wants).map(w => w.id)).toEqual(['a']);
  });

  it('matches by name alone while the card has no game yet', () => {
    expect(wantsForCard({ name: 'Charizard', game: '' }, wants).map(w => w.id)).toEqual(['a', 'b']);
  });

  it('matches nothing for a blank name', () => {
    expect(wantsForCard({ name: ' ' }, wants)).toEqual([]);
    expect(wantsForCard({ name: 'Charizard' }, undefined)).toEqual([]);
  });

  it('finds in-stock copies for a request', () => {
    const catalog = [
      { sku: '1', game: 'Pokemon', name: 'Charizard', qty: 2, sold: false, itemType: 'single' },
      { sku: '2', game: 'Pokemon', name: 'Charizard', qty: 0, sold: true, itemType: 'single' },
      { sku: '3', game: 'Pokemon', name: 'Charizard', qty: 5, sold: false, itemType: 'bulk' },
      { sku: '4', game: 'Magic', name: 'Charizard', qty: 1, sold: false, itemType: 'single' },
    ];
    expect(wantStockMatches(wants[0], catalog).map(c => c.sku)).toEqual(['1']);
  });
});
