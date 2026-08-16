import 'server-only';
import { cache } from 'react';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import type { Deal, DealStage } from './deal-types';
import { demoDeals, isDemoMode } from './demo';

/**
 * Sophie's creator business — §13's four-column kanban, read from the database.
 *
 * Owner-only, and that restriction is the one non-negotiable #5 names in so many words:
 * "reception can't see brand deals". It is enforced by `brand_deals_owner_all`, not by this
 * file — which is why a reception session reading through here gets an empty board rather than
 * a filtered one.
 *
 * The board's shape and arithmetic live in `deal-types.ts`, which the Client Component can
 * import without dragging `server-only` into the browser bundle.
 */

interface DealRow {
  id: string;
  brand_name: string;
  stage: DealStage;
  value_amount: number | null;
  contact_name: string | null;
  contact_handle: string | null;
  next_action: string | null;
  next_action_due: string | null;
  deliverables: { description: string; due_on: string | null; delivered_at: string | null }[] | null;
}

export const getDeals = cache(async (): Promise<Deal[]> => {
  if (isDemoMode()) return demoDeals();

  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('brand_deals')
    .select(
      `id, brand_name, stage, value_amount, contact_name, contact_handle,
       next_action, next_action_due,
       deliverables ( description, due_on, delivered_at )`,
    )
    .order('next_action_due', { ascending: true, nullsFirst: false })
    .returns<DealRow[]>();

  if (error) {
    // Reception hits this. An empty board is the correct answer for them, not an error page.
    return [];
  }

  return (data ?? []).map((row): Deal => {
    const deliverables = row.deliverables ?? [];
    const outstanding = deliverables
      .filter((d) => d.delivered_at === null)
      // Undated deliverables sort last: a date is a commitment, and commitments come first.
      .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));

    return {
      id: row.id,
      brandName: row.brand_name,
      stage: row.stage,
      valueAmount: row.value_amount,
      contactName: row.contact_name,
      contactHandle: row.contact_handle,
      nextAction: row.next_action,
      nextActionDue: row.next_action_due,
      nextDeliverable: outstanding[0]
        ? { description: outstanding[0].description, dueOn: outstanding[0].due_on }
        : null,
      deliverableCount: deliverables.length,
      deliveredCount: deliverables.filter((d) => d.delivered_at !== null).length,
    };
  });
});
