import { describe, it, expect } from 'vitest';
import { computeSalesReport, presetDateRange, customDateRangeToBounds, computeLossAmount, lossReasonLabel, LOSS_REASONS } from './reportUtils.js';

describe('computeSalesReport', () => {
  it('sums revenue and units across all sales', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 2, salePrice: 10 },
      { game: 'Magic', qtySold: 1, salePrice: 50 },
    ];
    const report = computeSalesReport(sales);
    expect(report.units).toBe(3);
    expect(report.revenue).toBe(70);
  });

  it('breaks totals down by game, sorted by revenue descending', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 1, salePrice: 5 },
      { game: 'Magic', qtySold: 1, salePrice: 100 },
      { game: 'Pokemon', qtySold: 1, salePrice: 5 },
    ];
    const report = computeSalesReport(sales);
    expect(report.byGame).toEqual([
      { game: 'Magic', units: 1, revenue: 100, cost: 0, losses: 0, profit: 100 },
      { game: 'Pokemon', units: 2, revenue: 10, cost: 0, losses: 0, profit: 10 },
    ]);
  });

  it('groups a blank game under "Unknown" rather than dropping it', () => {
    const report = computeSalesReport([{ game: '', qtySold: 1, salePrice: 5 }]);
    expect(report.byGame).toEqual([{ game: 'Unknown', units: 1, revenue: 5, cost: 0, losses: 0, profit: 5 }]);
  });

  it('still counts units for a sale with a null salePrice, contributing 0 revenue', () => {
    const report = computeSalesReport([{ game: 'Pokemon', qtySold: 3, salePrice: null }]);
    expect(report.units).toBe(3);
    expect(report.revenue).toBe(0);
  });

  it('returns zeroed totals and no game rows for an empty array', () => {
    expect(computeSalesReport([])).toEqual({ revenue: 0, units: 0, cost: 0, losses: 0, profit: 0, costUnknownCount: 0, refundedCount: 0, refundedRevenue: 0, byGame: [] });
  });

  it('is a no-op-safe default for null/undefined input', () => {
    expect(computeSalesReport(null)).toEqual({ revenue: 0, units: 0, cost: 0, losses: 0, profit: 0, costUnknownCount: 0, refundedCount: 0, refundedRevenue: 0, byGame: [] });
    expect(computeSalesReport(undefined)).toEqual({ revenue: 0, units: 0, cost: 0, losses: 0, profit: 0, costUnknownCount: 0, refundedCount: 0, refundedRevenue: 0, byGame: [] });
  });

  it('rounds to the cent despite floating-point noise', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 1, salePrice: 0.1 },
      { game: 'Pokemon', qtySold: 1, salePrice: 0.2 },
    ];
    const report = computeSalesReport(sales);
    expect(report.revenue).toBe(0.3);
  });

  it('sums cost (per-unit × qty) and computes profit as revenue minus cost', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 2, salePrice: 10, cost: 4 },
      { game: 'Magic', qtySold: 1, salePrice: 100, cost: 60 },
    ];
    const report = computeSalesReport(sales);
    expect(report.revenue).toBe(120);
    expect(report.cost).toBe(68); // (4*2) + (60*1)
    expect(report.profit).toBe(52);
    expect(report.costUnknownCount).toBe(0);
  });

  it('treats a null cost as unknown — contributes 0 to cost, counted in costUnknownCount, never guessed as 0 profit-wise', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 1, salePrice: 10, cost: null },
      { game: 'Pokemon', qtySold: 1, salePrice: 10, cost: 3 },
    ];
    const report = computeSalesReport(sales);
    expect(report.cost).toBe(3);
    expect(report.costUnknownCount).toBe(1);
    expect(report.profit).toBe(17);
  });

  it('breaks cost/profit down by game too', () => {
    const sales = [
      { game: 'Pokemon', qtySold: 1, salePrice: 10, cost: 4 },
      { game: 'Magic', qtySold: 1, salePrice: 100, cost: 60 },
    ];
    const report = computeSalesReport(sales);
    expect(report.byGame).toEqual([
      { game: 'Magic', units: 1, revenue: 100, cost: 60, losses: 0, profit: 40 },
      { game: 'Pokemon', units: 1, revenue: 10, cost: 4, losses: 0, profit: 6 },
    ]);
  });
});

describe('presetDateRange', () => {
  it('returns the current calendar month\'s [start, start-of-next-month) bounds', () => {
    const now = new Date(2026, 2, 15); // March 15, 2026 (local)
    const range = presetDateRange('month', now);
    expect(new Date(range.from)).toEqual(new Date(2026, 2, 1));
    expect(new Date(range.to)).toEqual(new Date(2026, 3, 1));
  });

  it('returns the current calendar year\'s [start, start-of-next-year) bounds', () => {
    const now = new Date(2026, 2, 15);
    const range = presetDateRange('year', now);
    expect(new Date(range.from)).toEqual(new Date(2026, 0, 1));
    expect(new Date(range.to)).toEqual(new Date(2027, 0, 1));
  });

  it('defaults to the month preset for an unrecognized value', () => {
    const now = new Date(2026, 2, 15);
    expect(presetDateRange('bogus', now)).toEqual(presetDateRange('month', now));
  });
});

describe('customDateRangeToBounds', () => {
  it('makes the end date inclusive by bumping the upper bound to the start of the next day', () => {
    const range = customDateRangeToBounds('2026-01-01', '2026-01-31');
    expect(new Date(range.from)).toEqual(new Date(2026, 0, 1));
    expect(new Date(range.to)).toEqual(new Date(2026, 1, 1));
  });

  it('returns null when either date is blank', () => {
    expect(customDateRangeToBounds('', '2026-01-31')).toBeNull();
    expect(customDateRangeToBounds('2026-01-01', '')).toBeNull();
    expect(customDateRangeToBounds('', '')).toBeNull();
  });
});

describe('computeSalesReport: lost / stolen cards', () => {
  const sales = [
    { id: 's1', game: 'Lorcana', qtySold: 1, salePrice: 25, cost: 17 },
    { id: 's2', game: 'Pokemon', qtySold: 2, salePrice: 10, cost: 4 },
  ];

  it('subtracts losses from Profit, overall and per game', () => {
    const r = computeSalesReport(sales, [{ game: 'Pokemon', lossAmount: 6 }, { game: 'Magic', lossAmount: 3.5 }]);
    expect(r.revenue).toBe(45);
    expect(r.cost).toBe(25);
    expect(r.losses).toBe(9.5);
    expect(r.profit).toBe(10.5);
    expect(r.byGame.find(g => g.game === 'Pokemon')).toMatchObject({ revenue: 20, cost: 8, losses: 6, profit: 6 });
    // A game with only a loss still gets a row.
    expect(r.byGame.find(g => g.game === 'Magic')).toMatchObject({ units: 0, revenue: 0, losses: 3.5, profit: -3.5 });
  });

  it('leaves a refunded sale out of revenue, cost and units (the loss carries its cost)', () => {
    const refunded = [{ ...sales[0], refundedAt: Date.now() }, sales[1]];
    const r = computeSalesReport(refunded, [{ game: 'Lorcana', lossAmount: 17 }]);
    expect(r.revenue).toBe(20);
    expect(r.cost).toBe(8);
    expect(r.units).toBe(2);
    expect(r.losses).toBe(17);
    expect(r.profit).toBe(-5);
    expect(r.refundedCount).toBe(1);
    expect(r.refundedRevenue).toBe(25);
  });

  it("doesn't count a refunded sale with no cost as an unknown-cost sale", () => {
    const r = computeSalesReport([{ game: 'X', qtySold: 1, salePrice: 5, cost: null, refundedAt: 1 }]);
    expect(r.costUnknownCount).toBe(0);
  });

  it('works with no losses passed (the old call shape)', () => {
    expect(computeSalesReport(sales).losses).toBe(0);
  });
});

describe('computeLossAmount', () => {
  it('is Cost x qty, to the cent', () => {
    expect(computeLossAmount(17, 1)).toBe(17);
    expect(computeLossAmount('4.335', 3)).toBe(13.01);
    expect(computeLossAmount(0, 2)).toBe(0);
  });
  it('is null without a usable cost or qty', () => {
    expect(computeLossAmount(null, 1)).toBe(null);
    expect(computeLossAmount('', 1)).toBe(null);
    expect(computeLossAmount(-1, 1)).toBe(null);
    expect(computeLossAmount(5, 0)).toBe(null);
  });
});

describe('lossReasonLabel', () => {
  it('labels every reason, and falls back to Other', () => {
    expect(LOSS_REASONS.map(r => lossReasonLabel(r.key))).toEqual(['Lost in shipment', 'Lost in store', 'Stolen', 'Damaged', 'Other']);
    expect(lossReasonLabel('weird')).toBe('Other');
  });
});
