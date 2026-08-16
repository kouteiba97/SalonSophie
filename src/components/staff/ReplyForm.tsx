'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { logMessage, type ConsoleState } from '@/app/actions/console';
import { WhatsApp } from '@/components/common/icons';

/**
 * Logs what was said. It does not send it.
 *
 * That distinction is the honest one, and it is deliberately visible in the UI rather than
 * hidden behind a "Send" button that quietly only writes to a table. There is no Meta
 * integration (§10), so the WhatsApp link is what actually delivers the message and this records
 * it afterwards — carrying the same text across, so the thread matches what the client received.
 *
 * A console that showed a reply the client never got would be the communications equivalent of
 * inventing a price.
 */
export function ReplyForm({
  conversationId,
  clientPhone,
  savedReplies,
}: {
  conversationId: string;
  clientPhone: string | null;
  savedReplies: { id: string; shortcut: string; body: string }[];
}) {
  const t = useTranslations('console.inbox');
  const errors = useTranslations('console.errors');
  const [state, formAction] = useActionState<ConsoleState, FormData>(logMessage, {
    status: 'idle',
  });

  const [body, setBody] = useState('');
  const bodyId = useId();

  const international = clientPhone ? `213${clientPhone.slice(1)}` : null;
  const whatsappHref = international
    ? `https://wa.me/${international}${body.trim() ? `?text=${encodeURIComponent(body)}` : ''}`
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="direction" value="outbound" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className="text-[12px] text-ink-2">
          {t('replyLabel')}
        </label>
        <textarea
          id={bodyId}
          name="body"
          rows={3}
          required
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="resize-none rounded-[16px] border border-rose-soft/45 bg-white px-4 py-3 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
      </div>

      {savedReplies.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[.14em] text-taupe">
            {t('savedReplies')}
          </span>
          {savedReplies.map((reply) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => setBody(reply.body)}
              className="cursor-pointer rounded-full border border-rose-soft/55 px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
            >
              {reply.shortcut}
            </button>
          ))}
        </div>
      ) : null}

      <div aria-live="polite" className="min-h-[1.1rem]">
        {state.status === 'error' ? (
          <p role="alert" className="text-[12px] text-rose-dark">
            {errors(state.error)}
          </p>
        ) : null}
        {state.status === 'success' ? (
          <p className="text-[12px] text-rose-deep">{t('logged')}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-rose-deep px-6 py-3 text-[13px] text-white transition-colors hover:bg-rose-dark"
          >
            <WhatsApp className="size-4" />
            {t('sendOnWhatsApp')}
          </a>
        ) : null}

        <LogButton label={t('logReply')} />
      </div>

      <p className="text-[11px] leading-[1.6] text-taupe">{t('logNote')}</p>
    </form>
  );
}

function LogButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-full border border-rose-soft/55 px-5 py-3 text-[13px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? '…' : label}
    </button>
  );
}
