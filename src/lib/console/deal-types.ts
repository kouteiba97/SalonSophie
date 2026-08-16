import type { Centimes } from '@/lib/money';

/**
 * The brand-deal board's shape and its arithmetic — no database, no `server-only`.
 *
 * Split out of `deals.ts` because the kanban card is a Client Component and needs the stage list
 * at runtime to know which way a card can move. Importing that from the repository would drag
 * `server-only` into the browser bundle, which is exactly the import the build refuses.
 *
 * Being pure also makes the pipeline total testable, and that total has the same trap as the
 * day-line's revenue: summing unpriced deals as zero.
 */

export const DEAL_STAGES = ['pitched', 'negotiating', 'contracted', 'delivered'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  brandName: string;
  stage: DealStage;
  /** Centimes, or null when the fee has not been agreed yet. */
  valueAmount: Centimes | null;
  contactName: string | null;
  contactHandle: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  /** The earliest deliverable still outstanding — §13 asks for it on the card. */
  nextDeliverable: { description: string; dueOn: string | null } | null;
  deliverableCount: number;
  deliveredCount: number;
}

/** Groups deals into the four columns, always returning all four even when empty. */
export function byStage(deals: Deal[]): Record<DealStage, Deal[]> {
  return {
    pitched: deals.filter((d) => d.stage === 'pitched'),
    negotiating: deals.filter((d) => d.stage === 'negotiating'),
    contracted: deals.filter((d) => d.stage === 'contracted'),
    delivered: deals.filter((d) => d.stage === 'delivered'),
  };
}

/**
 * The board's total, counting only deals with an agreed fee.
 *
 * Null rather than zero when nothing is priced — the same rule the day-line's revenue KPI
 * follows, and for the same reason: a pipeline reported as 0 DA reads as worthless rather than
 * as unpriced.
 */
export function pipelineValue(deals: Deal[]): { total: Centimes | null; unpriced: number } {
  const priced = deals.filter((d) => d.valueAmount !== null);
  return {
    total: priced.length > 0 ? priced.reduce((sum, d) => sum + (d.valueAmount ?? 0), 0) : null,
    unpriced: deals.length - priced.length,
  };
}

/** Where a card can go from where it is. The ends of the board have one move, not two. */
export function adjacentStages(stage: DealStage): { previous: DealStage | null; next: DealStage | null } {
  const index = DEAL_STAGES.indexOf(stage);
  return {
    previous: index > 0 ? DEAL_STAGES[index - 1] : null,
    next: index < DEAL_STAGES.length - 1 ? DEAL_STAGES[index + 1] : null,
  };
}
