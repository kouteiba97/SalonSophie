/**
 * @vitest-environment node
 *
 * The inbox and the brand-deal pipeline — Phase 6, against real Postgres.
 *
 * The conversation state is derived by a trigger rather than set by callers, so these tests are
 * about one property: after any sequence of messages, does `is_answered` still describe reality?
 * The console alerts on that count, and an alert that is sometimes wrong is worse than none.
 *
 * The brand-deal cases are the other half of non-negotiable #5. "Reception can't see brand deals"
 * is the line the brief names explicitly, and it is only true if RLS says so when reception
 * actually asks.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, type TestDb } from './harness';

let db: TestDb;

const OWNER = 'c0000000-0000-4000-8000-000000000001';
const RECEPTION = 'c0000000-0000-4000-8000-000000000002';
const STYLIST = 'c0000000-0000-4000-8000-000000000003';

async function makeClient(name: string, phone: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.clients (tenant_id, full_name, phone)
     values ((select id from public.tenants limit 1), $1, $2) returning id`,
    [name, phone],
  );
  return res.rows[0].id;
}

function logMessage(
  actor: string,
  opts: {
    clientId?: string | null;
    channel?: string;
    direction: 'inbound' | 'outbound';
    body: string;
    conversationId?: string | null;
  },
): Promise<string> {
  return asUser(db, actor, async () => {
    const res = await db.query<{ log_message: string }>(
      `select public.log_message($1, $2::public.message_channel, $3::public.message_direction,
                                 $4, $5, null)`,
      [
        opts.clientId ?? null,
        opts.channel ?? 'whatsapp',
        opts.direction,
        opts.body,
        opts.conversationId ?? null,
      ],
    );
    return res.rows[0].log_message;
  });
}

function conversation(id: string) {
  return db.query<{ is_answered: boolean; last_message_at: string | null; channel: string }>(
    `select is_answered, last_message_at, channel::text as channel
       from public.conversations where id = $1`,
    [id],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, { id: OWNER, role: 'owner', name: 'Sophie', staffSlug: 'sophie' });
  await createUser(db, { id: RECEPTION, role: 'reception', name: 'Reception' });
  await createUser(db, { id: STYLIST, role: 'stylist', name: 'Nour', staffSlug: 'nour' });
}, 120_000);

describe('log_message', () => {
  it('opens a conversation on the first inbound message and leaves it unanswered', async () => {
    const client = await makeClient('Amel Benali', '0553366712');
    const id = await logMessage(RECEPTION, {
      clientId: client,
      direction: 'inbound',
      body: 'Bonjour, avez-vous une place samedi ?',
    });

    const row = await conversation(id);
    expect(row.rows[0].is_answered).toBe(false);
    expect(row.rows[0].last_message_at).not.toBeNull();
  });

  it('marks the conversation answered once the salon replies', async () => {
    const client = await makeClient('Lina Ait', '0661234501');
    const id = await logMessage(RECEPTION, {
      clientId: client,
      direction: 'inbound',
      body: 'Vous êtes ouvertes vendredi ?',
    });
    await logMessage(RECEPTION, { conversationId: id, direction: 'outbound', body: 'Oui, à 14h.' });

    const row = await conversation(id);
    expect(row.rows[0].is_answered).toBe(true);
  });

  /** A new question always reopens the thread, whatever was said before it. */
  it('reopens an answered conversation when the client writes again', async () => {
    const client = await makeClient('Sara Mekki', '0661234502');
    const id = await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Bonjour' });
    await logMessage(RECEPTION, { conversationId: id, direction: 'outbound', body: 'Bonjour !' });
    await logMessage(RECEPTION, { conversationId: id, direction: 'inbound', body: 'Et le prix ?' });

    const row = await conversation(id);
    expect(row.rows[0].is_answered).toBe(false);
  });

  /**
   * The case the trigger recomputes for rather than assuming. Somebody writing up yesterday's
   * calls this morning must not mark a thread answered when a newer question arrived overnight.
   */
  it('is decided by the latest message, not the one just written', async () => {
    const client = await makeClient('Nadia Cherif', '0661234503');
    const id = await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Question' });

    // Backdated reply: sent before the question it appears to answer.
    await asUser(db, RECEPTION, () =>
      db.query(
        `insert into public.messages (tenant_id, conversation_id, direction, body, sent_at)
         select tenant_id, id, 'outbound'::public.message_direction, 'Réponse tardive',
                now() - interval '2 days'
           from public.conversations where id = $1`,
        [id],
      ),
    );

    const row = await conversation(id);
    // The client's question is still the most recent thing said, so the thread stays open.
    expect(row.rows[0].is_answered).toBe(false);
  });

  it('keeps one thread per client per channel', async () => {
    const client = await makeClient('Yasmine Adel', '0661234504');
    const first = await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Un' });
    const second = await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Deux' });

    expect(second).toBe(first);
  });

  it('separates channels, because they are separate places to reply', async () => {
    const client = await makeClient('Rym Haddad', '0661234505');
    const whatsapp = await logMessage(RECEPTION, {
      clientId: client,
      direction: 'inbound',
      body: 'Sur WhatsApp',
    });
    const instagram = await logMessage(RECEPTION, {
      clientId: client,
      channel: 'instagram',
      direction: 'inbound',
      body: 'En DM',
    });

    expect(instagram).not.toBe(whatsapp);
  });

  /** §10: the core works with zero social integration, so a phone call is a real conversation. */
  it('logs a walk-in or a phone call with no external id at all', async () => {
    const client = await makeClient('Hana Bouzid', '0661234506');
    const id = await logMessage(RECEPTION, {
      clientId: client,
      channel: 'phone',
      direction: 'inbound',
      body: 'Appel: demande un devis mariée',
    });

    const row = await conversation(id);
    expect(row.rows[0].channel).toBe('phone');
  });

  it('refuses an empty message', async () => {
    const client = await makeClient('Ines Saidi', '0661234507');
    await expect(
      logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: '   ' }),
    ).rejects.toThrow(/message_empty/);
  });

  it('refuses an unknown client', async () => {
    await expect(
      logMessage(RECEPTION, {
        clientId: '00000000-0000-4000-8000-000000000000',
        direction: 'inbound',
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/message_unknown_client/);
  });

  it('records who sent an outbound message, and nobody for an inbound one', async () => {
    const client = await makeClient('Meriem Slimani', '0661234508');
    const id = await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Salut' });
    await logMessage(RECEPTION, { conversationId: id, direction: 'outbound', body: 'Bonjour !' });

    const rows = await asUser(db, RECEPTION, () =>
      db.query<{ direction: string; sent_by: string | null }>(
        `select direction::text as direction, sent_by from public.messages
          where conversation_id = $1 order by sent_at`,
        [id],
      ),
    );

    expect(rows.rows[0].sent_by).toBeNull();
    expect(rows.rows[1].sent_by).toBe(RECEPTION);
  });

  /** Reception answers the inbox, so reception can reach it; a stylist cannot. */
  it('hides the inbox from a stylist', async () => {
    const client = await makeClient('Kenza Larbi', '0661234509');
    await logMessage(RECEPTION, { clientId: client, direction: 'inbound', body: 'Bonjour' });

    const rows = await asUser(db, STYLIST, () => db.query(`select id from public.conversations`));
    expect(rows.rows).toHaveLength(0);
  });
});

describe('brand deals', () => {
  async function makeDeal(): Promise<string> {
    return asUser(db, OWNER, async () => {
      const res = await db.query<{ id: string }>(
        `insert into public.brand_deals (tenant_id, brand_name, stage, value_amount)
         values ((select id from public.tenants limit 1), 'Marque test',
                 'pitched'::public.deal_stage, 15000000)
         returning id`,
      );
      return res.rows[0].id;
    });
  }

  it('moves a deal between columns', async () => {
    const deal = await makeDeal();

    const after = await asUser(db, OWNER, () =>
      db.query<{ set_deal_stage: string }>(
        `select public.set_deal_stage($1, 'negotiating'::public.deal_stage)::text`,
        [deal],
      ),
    );
    expect(after.rows[0].set_deal_stage).toBe('negotiating');
  });

  /**
   * Non-negotiable #5, named in the brief in these words: "reception can't see brand deals".
   * Deal values are Sophie's business, not the front desk's.
   */
  it('hides every deal from reception', async () => {
    await makeDeal();
    const rows = await asUser(db, RECEPTION, () => db.query(`select id from public.brand_deals`));
    expect(rows.rows).toHaveLength(0);
  });

  it('refuses to let reception move a deal', async () => {
    const deal = await makeDeal();
    await expect(
      asUser(db, RECEPTION, () =>
        db.query(`select public.set_deal_stage($1, 'contracted'::public.deal_stage)`, [deal]),
      ),
    ).rejects.toThrow(/deal_forbidden/);
  });

  it('hides invoices and deliverables from reception too', async () => {
    const deal = await makeDeal();
    await asUser(db, OWNER, () =>
      db.query(
        `insert into public.deliverables (tenant_id, deal_id, description)
         values ((select id from public.tenants limit 1), $1, 'Une story')`,
        [deal],
      ),
    );

    const deliverables = await asUser(db, RECEPTION, () =>
      db.query(`select id from public.deliverables`),
    );
    const invoices = await asUser(db, RECEPTION, () => db.query(`select id from public.invoices`));

    expect(deliverables.rows).toHaveLength(0);
    expect(invoices.rows).toHaveLength(0);
  });

  it('leaves an audit trail of the stage change', async () => {
    const deal = await makeDeal();
    await asUser(db, OWNER, () =>
      db.query(`select public.set_deal_stage($1, 'contracted'::public.deal_stage)`, [deal]),
    );

    const rows = await asUser(db, OWNER, () =>
      db.query<{ action: string; changed_fields: string[] | null }>(
        `select action::text as action, changed_fields from public.audit_log
          where table_name = 'brand_deals' and record_id = $1 order by created_at`,
        [deal],
      ),
    );

    expect(rows.rows.map((r) => r.action)).toEqual(['insert', 'update']);
    expect(rows.rows[1].changed_fields).toContain('stage');
  });
});
