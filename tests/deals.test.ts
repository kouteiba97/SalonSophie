import { describe, expect, it } from 'vitest';
import {
  adjacentStages,
  byStage,
  DEAL_STAGES,
  pipelineValue,
  type Deal,
} from '@/lib/console/deal-types';
import { dealInput, logMessageInput } from '@/lib/console/schema';

const deal = (overrides: Partial<Deal> = {}): Deal => ({
  id: overrides.id ?? crypto.randomUUID(),
  brandName: overrides.brandName ?? 'Une marque',
  stage: overrides.stage ?? 'pitched',
  valueAmount: overrides.valueAmount === undefined ? 15_000_000 : overrides.valueAmount,
  contactName: overrides.contactName ?? null,
  contactHandle: overrides.contactHandle ?? null,
  nextAction: overrides.nextAction ?? null,
  nextActionDue: overrides.nextActionDue ?? null,
  nextDeliverable: overrides.nextDeliverable ?? null,
  deliverableCount: overrides.deliverableCount ?? 0,
  deliveredCount: overrides.deliveredCount ?? 0,
});

describe('byStage', () => {
  it('always returns all four columns, in board order', () => {
    expect(Object.keys(byStage([]))).toEqual([...DEAL_STAGES]);
  });

  it('puts each deal in its own column', () => {
    const columns = byStage([
      deal({ stage: 'pitched' }),
      deal({ stage: 'delivered' }),
      deal({ stage: 'delivered' }),
    ]);

    expect(columns.pitched).toHaveLength(1);
    expect(columns.negotiating).toHaveLength(0);
    expect(columns.delivered).toHaveLength(2);
  });
});

describe('adjacentStages', () => {
  it('offers one move at each end of the board and two in the middle', () => {
    expect(adjacentStages('pitched')).toEqual({ previous: null, next: 'negotiating' });
    expect(adjacentStages('negotiating')).toEqual({ previous: 'pitched', next: 'contracted' });
    expect(adjacentStages('delivered')).toEqual({ previous: 'contracted', next: null });
  });
});

describe('pipelineValue', () => {
  it('sums the agreed fees', () => {
    const { total, unpriced } = pipelineValue([
      deal({ valueAmount: 15_000_000 }),
      deal({ valueAmount: 5_000_000 }),
    ]);

    expect(total).toBe(20_000_000);
    expect(unpriced).toBe(0);
  });

  it('counts the deals whose fee is not agreed, and leaves them out of the total', () => {
    const { total, unpriced } = pipelineValue([
      deal({ valueAmount: 15_000_000 }),
      deal({ valueAmount: null }),
    ]);

    expect(total).toBe(15_000_000);
    expect(unpriced).toBe(1);
  });

  /**
   * Same rule as the day-line's revenue KPI. A pipeline of unpriced pitches reported as 0 DA
   * reads as worthless; null reads as unpriced, which is what it is.
   */
  it('reports null, not zero, when no fee has been agreed anywhere', () => {
    const { total, unpriced } = pipelineValue([deal({ valueAmount: null }), deal({ valueAmount: null })]);
    expect(total).toBeNull();
    expect(unpriced).toBe(2);
  });

  it('reports null for an empty board', () => {
    expect(pipelineValue([]).total).toBeNull();
  });
});

describe('the deal form’s validation', () => {
  const valid = { brandName: 'Une marque', valueDinars: '', nextActionDue: '' };

  /** The same trap as the atelier's deposit: `Number('')` is 0, and the union would take it. */
  it('keeps an unagreed fee null rather than turning it into zero', () => {
    const parsed = dealInput.safeParse(valid);
    expect(parsed.success && parsed.data.valueDinars).toBeNull();
  });

  it('converts an agreed fee from dinars to centimes', () => {
    const parsed = dealInput.safeParse({ ...valid, valueDinars: '150000' });
    expect(parsed.success && parsed.data.valueDinars).toBe(15_000_000);
  });

  it('still allows a deliberate zero', () => {
    const parsed = dealInput.safeParse({ ...valid, valueDinars: '0' });
    expect(parsed.success && parsed.data.valueDinars).toBe(0);
  });

  it('keeps an empty due date null', () => {
    const parsed = dealInput.safeParse(valid);
    expect(parsed.success && parsed.data.nextActionDue).toBeNull();
  });

  it('accepts a real due date and rejects a malformed one', () => {
    expect(dealInput.safeParse({ ...valid, nextActionDue: '2027-03-01' }).success).toBe(true);
    expect(dealInput.safeParse({ ...valid, nextActionDue: '01/03/2027' }).success).toBe(false);
  });

  it('requires a brand name', () => {
    expect(dealInput.safeParse({ ...valid, brandName: '   ' }).success).toBe(false);
  });
});

describe('the message form’s validation', () => {
  it('refuses an empty body, however it is spelled', () => {
    expect(
      logMessageInput.safeParse({ direction: 'outbound', body: '   ', conversationId: '' }).success,
    ).toBe(false);
  });

  it('treats blank ids as absent rather than as empty strings', () => {
    const parsed = logMessageInput.safeParse({
      clientId: '',
      conversationId: '',
      direction: 'inbound',
      body: 'Bonjour',
    });

    expect(parsed.success && parsed.data.clientId).toBeNull();
    expect(parsed.success && parsed.data.conversationId).toBeNull();
  });

  /** §10: a phone call logged by hand is a first-class conversation, not a degraded one. */
  it('accepts every channel the salon actually uses', () => {
    for (const channel of ['whatsapp', 'instagram', 'phone', 'walk_in', 'other']) {
      const parsed = logMessageInput.safeParse({
        clientId: crypto.randomUUID(),
        channel,
        direction: 'inbound',
        body: 'Bonjour',
      });
      expect(parsed.success && parsed.data.channel).toBe(channel);
    }
  });

  it('falls back to WhatsApp for an unrecognised channel rather than failing the whole form', () => {
    const parsed = logMessageInput.safeParse({
      clientId: crypto.randomUUID(),
      channel: 'carrier-pigeon',
      direction: 'inbound',
      body: 'Bonjour',
    });
    expect(parsed.success && parsed.data.channel).toBe('whatsapp');
  });
});
