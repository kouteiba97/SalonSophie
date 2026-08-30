import 'server-only';
import { cache } from 'react';

import { getSupabaseSessionClient } from '@/lib/supabase/session';
import { isDemoMode } from './demo';

/**
 * Flags somebody raised, and the shortages the data implies.
 *
 * Two different things on purpose. A **flag** is what a person said — it is a row, it persists
 * until an owner clears it, and only a human can create one. A **shortage** is a query over stock
 * levels: it cannot go stale, and there is nothing to clear because the moment the shelf is
 * refilled it stops being true.
 *
 * Storing the second kind as rows is the classic mistake — the console then warns about a bottle
 * that was restocked last week, and people learn to ignore the warnings.
 */

export interface RaisedAlert {
  id: string;
  kind: 'stock_low' | 'equipment' | 'other';
  productName: string | null;
  note: string | null;
  raisedBy: string | null;
  createdAt: string;
}

interface AlertRow {
  id: string;
  kind: RaisedAlert['kind'];
  note: string | null;
  created_at: string;
  products: { name: string } | null;
  users: { full_name: string } | null;
}

const DEMO_ALERTS: RaisedAlert[] = [
  {
    id: 'demo-alert-1',
    kind: 'stock_low',
    productName: 'Coloration 7.3',
    note: 'Il reste deux tubes.',
    raisedBy: 'Nour',
    createdAt: '2026-08-30T08:20:00Z',
  },
];

export const getOpenAlerts = cache(async (): Promise<RaisedAlert[]> => {
  if (isDemoMode()) return DEMO_ALERTS;

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('alerts')
    .select('id, kind, note, created_at, products ( name ), users:raised_by ( full_name )')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .returns<AlertRow[]>();

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    productName: row.products?.name ?? null,
    note: row.note,
    raisedBy: row.users?.full_name ?? null,
    createdAt: row.created_at,
  }));
});
