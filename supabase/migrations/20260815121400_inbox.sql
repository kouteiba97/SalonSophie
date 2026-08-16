-- The unified inbox — Phase 6
--
-- §13 wants unanswered client messages surfaced as an alert, "a known failure". That count is
-- only worth alerting on if it is right, and it is only right if nothing has to remember to
-- maintain it. So the conversation's state is derived from its messages by a trigger rather than
-- set by whichever code path happened to insert one.
--
-- Everything here works with zero social integration (§10). Meta approval can take weeks, and a
-- conversation logged by hand after a phone call is a first-class row, not a degraded one — the
-- `channel` enum already says so, and `external_id` is nullable everywhere.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A conversation's state follows its last message
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.sync_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.messages%rowtype;
begin
  /*
   * Recomputed from the latest message rather than assumed from the row being written. A reply
   * logged late — someone writing up yesterday's calls this morning — must not mark a
   * conversation answered when a newer question has arrived since.
   */
  select * into v_latest
  from public.messages m
  where m.conversation_id = coalesce(new.conversation_id, old.conversation_id)
  order by m.sent_at desc, m.created_at desc
  limit 1;

  update public.conversations c
     set last_message_at = v_latest.sent_at,
         -- Answered means the salon spoke last. An inbound message reopens it, always.
         is_answered = (v_latest.direction = 'outbound'::public.message_direction)
   where c.id = coalesce(new.conversation_id, old.conversation_id);

  return coalesce(new, old);
end;
$$;

create trigger messages_sync_conversation
  after insert or update or delete on public.messages
  for each row execute function public.sync_conversation_from_message();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- log_message
--
-- Finds or creates the conversation for a client on a channel, appends the message, and lets the
-- trigger above settle the conversation's state — in one transaction, so a logged reply can
-- never leave a thread that says the opposite.
--
-- security invoker: `conversations_front_desk_all` and `messages_front_desk_all` already say who
-- may do this, and a definer function would hand a stylist the front desk's inbox.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.log_message(
  p_client_id uuid,
  p_channel public.message_channel,
  p_direction public.message_direction,
  p_body text,
  p_conversation_id uuid default null,
  p_subject text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant       uuid;
  v_conversation uuid := p_conversation_id;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'message_empty';
  end if;

  if v_conversation is null then
    if p_client_id is null then
      raise exception 'message_needs_client';
    end if;

    select c.tenant_id into v_tenant from public.clients c where c.id = p_client_id;
    if not found then
      raise exception 'message_unknown_client';
    end if;

    /*
     * One open thread per client per channel. A bride who asks about her dress on WhatsApp three
     * days running is one conversation, not three — otherwise the unanswered count inflates and
     * the alert stops meaning anything. A thread already answered and closed stays closed;
     * the new message reopens it via the trigger.
     */
    select c.id into v_conversation
    from public.conversations c
    where c.client_id = p_client_id and c.channel = p_channel
    order by c.last_message_at desc nulls last
    limit 1;

    if v_conversation is null then
      insert into public.conversations (tenant_id, client_id, channel, subject)
      values (v_tenant, p_client_id, p_channel, nullif(btrim(coalesce(p_subject, '')), ''))
      returning id into v_conversation;
    end if;
  end if;

  insert into public.messages (tenant_id, conversation_id, direction, body, sent_by)
  select c.tenant_id, c.id, p_direction, btrim(p_body),
         case when p_direction = 'outbound'::public.message_direction then auth.uid() else null end
  from public.conversations c
  where c.id = v_conversation;

  -- No row inserted means RLS refused the conversation to this caller.
  if not found then
    raise exception 'message_forbidden';
  end if;

  return v_conversation;
end;
$$;

revoke execute on function
  public.log_message(uuid, public.message_channel, public.message_direction, text, uuid, text)
  from public;

grant execute on function
  public.log_message(uuid, public.message_channel, public.message_direction, text, uuid, text)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Brand deals: moving a card between columns
--
-- Owner only, enforced by `brand_deals_owner_all`. This is the line non-negotiable #5 names
-- explicitly — deal values are Sophie's business, not the front desk's — so the function stays
-- security invoker and lets the policy refuse it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.set_deal_stage(p_deal_id uuid, p_stage public.deal_stage)
returns public.deal_stage
language plpgsql
set search_path = ''
as $$
begin
  update public.brand_deals set stage = p_stage where id = p_deal_id;

  -- Either it does not exist, or RLS says it does not exist for you. Same answer either way.
  if not found then
    raise exception 'deal_forbidden';
  end if;

  return p_stage;
end;
$$;

revoke execute on function public.set_deal_stage(uuid, public.deal_stage) from public;
grant execute on function public.set_deal_stage(uuid, public.deal_stage) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Audit
--
-- §12.9 names appointments, reservations and payments. Brand deals are not on that list, but a
-- deal's value and stage are exactly the kind of thing argued about later, and the trigger
-- already exists.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create trigger brand_deals_audit
  after insert or update or delete on public.brand_deals
  for each row execute function public.write_audit_log();
