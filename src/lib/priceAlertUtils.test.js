import { describe, it, expect } from 'vitest';
import { alertsBySku, formatPctChange, formatMoney, alertConditionNote } from './priceAlertUtils.js';

describe('alertsBySku', () => {
  it('keys alerts by sku, keeping the most recent if a sku somehow has two', () => {
    const map = alertsBySku([
      { id: 'old', sku: 'a', detectedAt: '2026-10-01T00:00:00Z' },
      { id: 'new', sku: 'a', detectedAt: '2026-10-14T00:00:00Z' },
      { id: 'b1', sku: 'b', detectedAt: '2026-10-02T00:00:00Z' },
    ]);
    expect(map.get('a').id).toBe('new');
    expect(map.get('b').id).toBe('b1');
    expect(map.size).toBe(2);
  });

  it('handles an empty or missing list', () => {
    expect(alertsBySku([]).size).toBe(0);
    expect(alertsBySku(undefined).size).toBe(0);
  });
});

describe('formatting', () => {
  it('shows a signed, rounded percentage', () => {
    expect(formatPctChange(67.1)).toBe('+67%');
    expect(formatPctChange(-5.6)).toBe('-6%');
    expect(formatPctChange(null)).toBe('');
  });

  it('shows money to two decimals, or a dash when missing', () => {
    expect(formatMoney(417.78)).toBe('$417.78');
    expect(formatMoney(25)).toBe('$25.00');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('alertConditionNote', () => {
  it('explains a condition-adjusted market price (real report: a Damaged Fossil Gengar compared against NM)', () => {
    expect(alertConditionNote({ condition: 'DMG', marketNmPrice: 223.38 })).toBe('est. for Damaged · NM $223.38');
    expect(alertConditionNote({ condition: 'LP', marketNmPrice: 10 })).toBe('est. for Lightly Played · NM $10.00');
  });

  it('says plainly when the comparison was NM to NM', () => {
    expect(alertConditionNote({ condition: 'NM', marketNmPrice: 50 })).toBe('Near Mint');
  });

  it('tells staff when the item had no Condition, so it was compared as Near Mint', () => {
    expect(alertConditionNote({ condition: 'NONE', marketNmPrice: 50 })).toBe('no Condition set on this item — compared as Near Mint');
  });

  it('flags an older alert that compared against NM regardless of condition', () => {
    expect(alertConditionNote({ condition: null })).toBe('compared as Near Mint (older alert)');
  });
});
