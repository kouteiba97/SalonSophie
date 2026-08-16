import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ReplyForm } from '@/components/staff/ReplyForm';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getStaffSession, isFrontDesk } from '@/lib/auth';
import { getConversation, getSavedReplies } from '@/lib/console/inbox';
import { cn } from '@/lib/utils';

/** One thread, with the salon's side on one edge and the client's on the other. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.inbox' });
  return { title: t('threadTitle') };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getStaffSession();
  if (!isFrontDesk(session)) notFound();

  const t = await getTranslations({ locale, namespace: 'console.inbox' });
  const thread = await getConversation(id);
  if (!thread) notFound();

  const savedReplies = await getSavedReplies(locale);
  const { conversation, messages } = thread;

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(INTL_TAG[locale], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Algiers',
    });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t('breadcrumb')}>
        <Link href="/messages" className="text-[13px] text-ink-2 transition-colors hover:text-rose-deep">
          ← {t('backToInbox')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
            {conversation.client?.fullName ?? t('unknownClient')}
          </h1>
          <p className="text-[13px] text-taupe">
            {t(`channels.${conversation.channel}`)}
            {conversation.client ? (
              <>
                {' · '}
                <a href={`tel:${conversation.client.phone}`} dir="ltr" className="hover:underline">
                  {conversation.client.phone}
                </a>
              </>
            ) : null}
          </p>
        </div>

        {conversation.client ? (
          <Link
            href={`/clients/${conversation.client.id}`}
            className="rounded-full border border-rose-soft/55 px-4 py-2 text-[12px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
          >
            {t('openClient')}
          </Link>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-white px-5 py-8 text-center text-[14px] text-taupe">
          {t('threadEmpty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                'flex flex-col gap-1 rounded-[18px] border px-4 py-3',
                message.direction === 'outbound'
                  ? // The salon's own messages sit on the end side, which flips in Arabic for free.
                    'border-rose-soft/50 bg-blush-6 ms-auto max-w-[80%]'
                  : 'border-line bg-white me-auto max-w-[80%]',
              )}
            >
              <p className="whitespace-pre-line text-[14px] leading-[1.7] text-charcoal">
                {message.body}
              </p>
              <time dateTime={message.sentAt} className="text-[11px] text-taupe">
                {stamp(message.sentAt)}
              </time>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-[20px] border border-line bg-white px-5 py-5">
        <ReplyForm
          conversationId={conversation.id}
          clientPhone={conversation.client?.phone ?? null}
          savedReplies={savedReplies}
        />
      </div>
    </div>
  );
}
