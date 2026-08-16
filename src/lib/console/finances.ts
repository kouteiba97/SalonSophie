import 'server-only';
import { cache } from 'react';

import type { Centimes } from '@/lib/money';
import { callRpc } from '@/lib/supabase/server';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import {
  demoCashFlow,
  demoDataGaps,
  demoExpenseSummary,
  demoRevenueByLine,
  demoServicePerformance,
  isDemoMode,
} from './demo';
import type { Period } from './period';

/**
 * "See and follow the money flow, and which of the three businesses is bringing more money."
 *
 * Every read here is one of wave 1's reporting functions, all of them `security invoker`.
 * That is load-bearing: payments, invoices and expenses are owner-only under RLS, so reception
 * calling any of these gets an empty result rather than the ledger. A reporting layer is the
 * classic place a `security definer` quietly widens access to everything.
 *
 * All amounts are centimes (§7).
 */

/** The three businesses sharing one address, plus the creator brand's invoices. */
export interface LineRevenue {
  line: string;
  revenue: Centimes;
  transactions: number;
}

export interface CashFlowDay {
  onDate: string;
  revenue: Centimes;
  spend: Centimes;
}

export interface ServiceRevenue {
  serviceSlug: string;
  serviceName: string;
  categoryName: string;
  bookings: number;
  revenue: Centimes;
}

export interface ExpenseGroup {
  category: string;
  /** 'shared' when the cost belongs to the business rather than to one line — rent, electricity. */
  line: string;
  total: Centimes;
  entries: number;
}

export interface DataGap {
  gap: string;
  missing: number;
}

/** Postgres `bigint` arrives as a string over PostgREST once it could exceed 2^53. */
const toCentimes = (value: number | string | null): Centimes =>
  value === null ? 0 : typeof value === 'number' ? value : Number(value);

export const getRevenueByLine = cache(async (period: Period): Promise<LineRevenue[]> => {
  if (isDemoMode()) return demoRevenueByLine(period);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<
    { line: string; revenue: number | string; transactions: number }[]
  >(supabase, 'revenue_by_line', { p_from: period.from, p_to: period.to });

  if (error || !data) return [];

  return data.map((row) => ({
    line: row.line,
    revenue: toCentimes(row.revenue),
    transactions: row.transactions,
  }));
});

export const getCashFlow = cache(async (period: Period): Promise<CashFlowDay[]> => {
  if (isDemoMode()) return demoCashFlow(period);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<
    { on_date: string; revenue: number | string; spend: number | string }[]
  >(supabase, 'cash_flow', { p_from: period.from, p_to: period.to });

  if (error || !data) return [];

  return data.map((row) => ({
    onDate: row.on_date,
    revenue: toCentimes(row.revenue),
    spend: toCentimes(row.spend),
  }));
});

export const getServicePerformance = cache(async (period: Period): Promise<ServiceRevenue[]> => {
  if (isDemoMode()) return demoServicePerformance(period);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<
    {
      service_slug: string;
      service_name: string;
      category_name: string;
      bookings: number;
      revenue: number | string;
    }[]
  >(supabase, 'service_performance', { p_from: period.from, p_to: period.to });

  if (error || !data) return [];

  return data.map((row) => ({
    serviceSlug: row.service_slug,
    serviceName: row.service_name,
    categoryName: row.category_name,
    bookings: row.bookings,
    revenue: toCentimes(row.revenue),
  }));
});

export const getExpenseSummary = cache(async (period: Period): Promise<ExpenseGroup[]> => {
  if (isDemoMode()) return demoExpenseSummary(period);

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<
    { category: string; line: string; total: number | string; entries: number }[]
  >(supabase, 'expense_summary', { p_from: period.from, p_to: period.to });

  if (error || !data) return [];

  return data.map((row) => ({
    category: row.category,
    line: row.line,
    total: toCentimes(row.total),
    entries: row.entries,
  }));
});

/**
 * What the console still does not know.
 *
 * Not a footnote on this screen: an unknown product cost is the reason no margin appears below,
 * and unknown durations are the reason bookings arrive as requests. Surfacing the counts turns
 * "we are waiting on Nour and Sophie" into a number that goes down as they fill things in.
 */
export const getDataGaps = cache(async (): Promise<DataGap[]> => {
  if (isDemoMode()) return demoDataGaps();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await callRpc<{ gap: string; missing: number }[]>(
    supabase,
    'data_gaps',
    {},
  );

  if (error || !data) return [];
  return data.filter((row) => row.missing > 0);
});
