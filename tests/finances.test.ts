import { describe, expect, it } from 'vitest';
import {
  daysInPeriod,
  periodFromPreset,
  resolvePeriod,
  type Period,
} from '@/lib/console/period';
import {
  cashFlowTotals,
  peakDayMovement,
  revenueRanking,
  REVENUE_LINES,
} from '@/lib/console/money-flow';
import {
  demoCashFlow,
  demoExpenseSummary,
  demoRevenueByLine,
  demoServicePerformance,
} from '@/lib/console/demo';

/**
 * The finances screen's arithmetic, with nothing else in it.
 *
 * Two kinds of bug live here and neither is visible in a screenshot. Month boundaries are off by
 * one day and quietly change what a period reports; and a total that treats "no data" as a
 * confident zero reads as a bad month rather than as an unanswered question.
 *
 * The reporting SQL itself is exercised in tests/db — this file proves the judgement above it.
 */

const period = (from: string, to: string): Period => ({ from, to, preset: 'custom' });

describe('period presets', () => {
  it('runs this month from the 1st to the last day, not to today', () => {
    // A month-to-date window would make every month look worse than the last until the 28th.
    expect(periodFromPreset('month', '2026-08-16')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      preset: 'month',
    });
  });

  it('handles a short month', () => {
    expect(periodFromPreset('month', '2026-02-10').to).toBe('2026-02-28');
  });

  it('handles February in a leap year', () => {
    expect(periodFromPreset('month', '2028-02-10').to).toBe('2028-02-29');
  });

  it('crosses the year when last month is December', () => {
    // The case that breaks: January's previous month is not month 0 of the same year.
    expect(periodFromPreset('last-month', '2027-01-09')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
      preset: 'last-month',
    });
  });

  it('takes a whole year', () => {
    expect(periodFromPreset('year', '2026-08-16')).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      preset: 'year',
    });
  });
});

describe('reading the period from the URL', () => {
  it('defaults to this month', () => {
    expect(resolvePeriod({}, '2026-08-16').preset).toBe('month');
  });

  it('prefers explicit dates over a preset, as the more specific request', () => {
    const resolved = resolvePeriod(
      { from: '2026-03-01', to: '2026-03-15', period: 'year' },
      '2026-08-16',
    );
    expect(resolved).toEqual({ from: '2026-03-01', to: '2026-03-15', preset: 'custom' });
  });

  it('reads dates typed backwards as the range between them', () => {
    expect(resolvePeriod({ from: '2026-03-15', to: '2026-03-01' }, '2026-08-16')).toEqual({
      from: '2026-03-01',
      to: '2026-03-15',
      preset: 'custom',
    });
  });

  it('falls back to a screen rather than an error on nonsense', () => {
    expect(resolvePeriod({ from: 'hier', to: '??' }, '2026-08-16').preset).toBe('month');
    expect(resolvePeriod({ period: 'decade' }, '2026-08-16').preset).toBe('month');
  });

  it('ignores a half-supplied range', () => {
    // One date alone cannot describe a period; it should not silently become "since then".
    expect(resolvePeriod({ from: '2026-03-01' }, '2026-08-16').preset).toBe('month');
  });

  it('counts both ends of the period, matching the reporting SQL', () => {
    // Every reporting function filters `between p_from and p_to` — inclusive at both ends.
    expect(daysInPeriod(period('2026-08-01', '2026-08-31'))).toBe(31);
    expect(daysInPeriod(period('2026-08-16', '2026-08-16'))).toBe(1);
  });
});

describe('totals', () => {
  it('adds what came in and what was recorded going out', () => {
    const totals = cashFlowTotals([
      { onDate: '2026-08-01', revenue: 150_000, spend: 3_500_000 },
      { onDate: '2026-08-02', revenue: 220_000, spend: 0 },
    ]);

    expect(totals).toEqual({ revenue: 370_000, spend: 3_500_000, net: -3_130_000 });
  });

  it('lets the balance go negative rather than clamping it', () => {
    // A month whose rent lands before its takings is a real month, and reads as one.
    expect(cashFlowTotals([{ onDate: '2026-08-01', revenue: 0, spend: 900_000 }]).net).toBe(
      -900_000,
    );
  });

  it('is all zeros for an empty period', () => {
    expect(cashFlowTotals([])).toEqual({ revenue: 0, spend: 0, net: 0 });
  });
});

describe('which business earns', () => {
  it('keeps every line, including the ones that earned nothing', () => {
    /*
     * `revenue_by_line` returns rows only where money moved, so a quiet bridal month would vanish
     * from the list — and "which earns most" cannot be answered from a list missing a competitor.
     */
    const ranked = revenueRanking([
      { line: 'salon', revenue: 400_000, transactions: 10 },
      { line: 'creator', revenue: 600_000, transactions: 1 },
    ]);

    expect(ranked.map((r) => r.line).sort()).toEqual([...REVENUE_LINES].sort());
    expect(ranked[0].line).toBe('creator');
    expect(ranked.find((r) => r.line === 'bridal')).toMatchObject({
      revenue: 0,
      transactions: 0,
      share: 0,
    });
  });

  it('computes each share of the period total', () => {
    const ranked = revenueRanking([
      { line: 'salon', revenue: 750_000, transactions: 3 },
      { line: 'bridal', revenue: 250_000, transactions: 1 },
    ]);

    expect(ranked.find((r) => r.line === 'salon')?.share).toBeCloseTo(0.75);
    expect(ranked.find((r) => r.line === 'bridal')?.share).toBeCloseTo(0.25);
  });

  it('never divides by zero when nothing was earned', () => {
    const ranked = revenueRanking([]);
    expect(ranked).toHaveLength(REVENUE_LINES.length);
    expect(ranked.every((r) => r.share === 0)).toBe(true);
  });
});

describe('scaling the chart', () => {
  it('returns null for a period with no movement', () => {
    // A chart scaled to zero draws every bar full width, which reads as a record month.
    expect(peakDayMovement([])).toBeNull();
    expect(peakDayMovement([{ onDate: '2026-08-01', revenue: 0, spend: 0 }])).toBeNull();
  });

  it('takes the largest of either direction', () => {
    const peak = peakDayMovement([
      { onDate: '2026-08-01', revenue: 120_000, spend: 3_500_000 },
      { onDate: '2026-08-02', revenue: 90_000, spend: 0 },
    ]);
    expect(peak).toBe(3_500_000);
  });
});

describe('the demo period', () => {
  it('fills whatever window is asked for, so every preset has a chart', () => {
    const august = demoCashFlow({ from: '2026-08-01', to: '2026-08-31' });
    expect(august).toHaveLength(31);
    expect(august[0].onDate).toBe('2026-08-01');
    expect(august.at(-1)?.onDate).toBe('2026-08-31');
    expect(peakDayMovement(august)).not.toBeNull();
  });

  it('leaves a line absent so the ranking has to fill it in', () => {
    const august = { from: '2026-08-01', to: '2026-08-31' };
    const lines = demoRevenueByLine(august).map((line) => line.line);

    expect(lines).not.toContain('makeup');
    expect(revenueRanking(demoRevenueByLine(august))).toHaveLength(REVENUE_LINES.length);
  });

  it('reconciles every panel against the same period', () => {
    /*
     * The first pass hand-wrote each panel and the screen showed 84 320 DA earned by line above
     * 24 680 DA of cash flow — three correct-looking panels contradicting each other, which is
     * worse than no demo data at all. Everything is derived from one source now, and this is what
     * keeps it that way.
     */
    const august = { from: '2026-08-01', to: '2026-08-31' };
    const flow = cashFlowTotals(demoCashFlow(august));

    const byLine = demoRevenueByLine(august).reduce((total, line) => total + line.revenue, 0);
    const spending = demoExpenseSummary(august).reduce((total, row) => total + row.total, 0);
    const salon = demoRevenueByLine(august).find((line) => line.line === 'salon');
    const services = demoServicePerformance(august).reduce((total, s) => total + s.revenue, 0);

    // Rounding each line's share leaves at most a centime or two against the total.
    expect(Math.abs(byLine - flow.revenue)).toBeLessThan(100);
    expect(spending).toBe(flow.spend);
    // Services are part of the salon's takings and can never exceed them.
    expect(services).toBeLessThanOrEqual(salon?.revenue ?? 0);
  });

  it('never reports revenue with no transaction behind it', () => {
    const lines = demoRevenueByLine({ from: '2026-08-01', to: '2026-08-31' });
    expect(lines.every((line) => line.revenue === 0 || line.transactions > 0)).toBe(true);
  });
});
