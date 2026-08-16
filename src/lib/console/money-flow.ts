import type { Centimes } from '@/lib/money';
import type { CashFlowDay, LineRevenue } from './finances';

/**
 * The arithmetic behind the finances screen, with nothing else in it.
 *
 * Pure and tested, because two of these encode a judgement rather than a sum, and both are the
 * kind of thing that reads as correct while being wrong in the direction of flattering the
 * numbers.
 */

/** Every way the business earns. `creator` invoices are not appointments, hence the union. */
export const REVENUE_LINES = ['salon', 'bridal', 'makeup', 'creator'] as const;
export type RevenueLine = (typeof REVENUE_LINES)[number];

export interface LineShare extends LineRevenue {
  /** 0..1 of the period's total. Zero when nothing was earned at all — never NaN. */
  share: number;
}

export interface FlowTotals {
  revenue: Centimes;
  /**
   * Only what somebody entered.
   *
   * The salon's real costs are not all in this number and cannot be: most products have no unit
   * cost (§6), rent may not have been recorded this month, and nobody is paid through this app.
   * That is why the screen shows a *balance of recorded movements* and no margin or profit
   * percentage — a margin computed against partial costs is not an estimate, it is a flattering
   * fiction with a decimal point on it.
   */
  spend: Centimes;
  /** Revenue minus recorded spend. Negative is a real answer and must render as one. */
  net: Centimes;
}

export function cashFlowTotals(days: CashFlowDay[]): FlowTotals {
  const revenue = days.reduce((total, day) => total + day.revenue, 0);
  const spend = days.reduce((total, day) => total + day.spend, 0);
  return { revenue, spend, net: revenue - spend };
}

/**
 * Which business earns most — §1's question, and the reason this screen exists.
 *
 * Every line appears, including the ones that earned nothing. `revenue_by_line` returns rows only
 * where money moved, so a bare mapping would silently drop the bridal line in a month with no
 * weddings — and "which earns most" cannot be answered from a list that omits the answer's
 * competitors. A zero is a fact here: nothing was taken, and the period says so.
 */
export function revenueRanking(lines: LineRevenue[]): LineShare[] {
  const found = new Map(lines.map((line) => [line.line, line]));
  const total = lines.reduce((sum, line) => sum + line.revenue, 0);

  return REVENUE_LINES.map((name) => {
    const row = found.get(name);
    const revenue = row?.revenue ?? 0;
    return {
      line: name,
      revenue,
      transactions: row?.transactions ?? 0,
      share: total > 0 ? revenue / total : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

/**
 * The busiest day's total movement, for scaling the bars.
 *
 * Returns null rather than 0 for an empty period, so a caller cannot divide by it: a chart scaled
 * to zero draws every bar full width, which reads as a record month.
 */
export function peakDayMovement(days: CashFlowDay[]): Centimes | null {
  const peak = days.reduce((max, day) => Math.max(max, day.revenue, day.spend), 0);
  return peak > 0 ? peak : null;
}
