import 'server-only';
import { cache } from 'react';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import { demoConversation, demoConversations, isDemoMode } from './demo';

/**
 * The unified inbox (§13, Phase 6).
 *
 * "Unified" is the whole point: the salon runs on one phone line and an Instagram account, and a
 * bride who asks about a dress in a DM on Tuesday and by phone on Thursday is one person with one
 * question. The channel is a property of the thread, not a separate inbox.
 *
 * Nothing here talks to Meta. A conversation logged by hand after a phone call is a first-class
 * row (§10), and the console records what was said rather than pretending to have sent it.
 */

export type MessageChannel = 'whatsapp' | 'instagram' | 'phone' | 'walk_in' | 'other';
export type MessageDirection = 'inbound' | 'outbound';

export interface InboxConversation {
  id: string;
  channel: MessageChannel;
  subject: string | null;
  isAnswered: boolean;
  lastMessageAt: string | null;
  client: { id: string; fullName: string; phone: string } | null;
  /** The most recent line, for the list preview. */
  preview: string | null;
}

export interface InboxMessage {
  id: string;
  direction: MessageDirection;
  body: string | null;
  sentAt: string;
}

interface ConversationRow {
  id: string;
  channel: MessageChannel;
  subject: string | null;
  is_answered: boolean;
  last_message_at: string | null;
  clients: { id: string; full_name: string; phone: string } | null;
  messages: { body: string | null; sent_at: string }[] | null;
}

const SELECT_CONVERSATION = `
  id, channel, subject, is_answered, last_message_at,
  clients ( id, full_name, phone ),
  messages ( body, sent_at )
`;

function mapConversation(row: ConversationRow): InboxConversation {
  // PostgREST cannot order an embedded resource per parent row, so the preview is picked here.
  const latest = [...(row.messages ?? [])].sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1))[0];

  return {
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    isAnswered: row.is_answered,
    lastMessageAt: row.last_message_at,
    client: row.clients
      ? { id: row.clients.id, fullName: row.clients.full_name, phone: row.clients.phone }
      : null,
    preview: latest?.body ?? null,
  };
}

export const getConversations = cache(
  async (filter: 'unanswered' | 'all'): Promise<InboxConversation[]> => {
    if (isDemoMode()) {
      const all = demoConversations();
      return filter === 'unanswered' ? all.filter((c) => !c.isAnswered) : all;
    }

    const supabase = await getSupabaseSessionClient();
    if (!supabase) return [];

    let query = supabase
      .from('conversations')
      .select(SELECT_CONVERSATION)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100);

    if (filter === 'unanswered') query = query.eq('is_answered', false);

    const { data, error } = await query.returns<ConversationRow[]>();

    if (error) {
      console.error('[N&S] inbox: reading conversations failed:', error.message);
      return [];
    }

    return (data ?? []).map(mapConversation);
  },
);

export const getConversation = cache(
  async (
    id: string,
  ): Promise<{ conversation: InboxConversation; messages: InboxMessage[] } | null> => {
    if (isDemoMode()) return demoConversation(id);

    const supabase = await getSupabaseSessionClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('conversations')
      .select(SELECT_CONVERSATION)
      .eq('id', id)
      .maybeSingle()
      .returns<ConversationRow | null>();

    if (error || !data) return null;

    const { data: messages } = await supabase
      .from('messages')
      .select('id, direction, body, sent_at')
      .eq('conversation_id', id)
      .order('sent_at')
      .returns<{ id: string; direction: MessageDirection; body: string | null; sent_at: string }[]>();

    return {
      conversation: mapConversation(data),
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        sentAt: m.sent_at,
      })),
    };
  },
);

/** Saved replies, for the answers reception types twenty times a week. */
export const getSavedReplies = cache(
  async (locale: string): Promise<{ id: string; shortcut: string; body: string }[]> => {
    const supabase = await getSupabaseSessionClient();
    if (!supabase) return [];

    const { data } = await supabase
      .from('saved_replies')
      .select('id, shortcut, body')
      .eq('locale', locale)
      .order('shortcut')
      .returns<{ id: string; shortcut: string; body: string }[]>();

    return data ?? [];
  },
);
