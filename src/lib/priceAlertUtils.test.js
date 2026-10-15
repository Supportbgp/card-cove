import { describe, it, expect } from 'vitest';
import { alertsBySku, formatPctChange, formatMoney } from './priceAlertUtils.js';

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
