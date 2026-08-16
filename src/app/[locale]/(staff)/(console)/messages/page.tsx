import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getConversations } from '@/lib/console/inbox';
import { getStaffSession, isFrontDesk } from '@/lib/auth';
import { hasConsoleData } from '@/lib/console/demo';
import { cn } from '@/lib/utils';

/**
 * The unified inbox (§13).
 *
 * One list across WhatsApp, Instagram, the phone and the door, because the salon has one set of
 * clients asking one set of questions — and because an unanswered message is a known failure
 * mode of running three businesses from one handset.
 *
 * Unanswered first, by default. The filter is a URL param so "everything still open" is an
 * address somebody can be sent.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.inbox' });
  return { title: t('title') };
}

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ filtre?: string }>;
}) {
  const { locale } = await params;
  const { filtre } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.inbox' });
  const session = await getStaffSession();

  if (!isFrontDesk(session)) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-[clamp(48px,9vw,112px)] text-center">
        <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
          {t('forbiddenTitle')}
        </h1>
        <p className="text-[14px] leading-[1.8] text-ink-2">{t('forbiddenBody')}</p>
      </div>
    );
  }

  const filter = filtre === 'toutes' ? 'all' : 'unanswered';
  const conversations = await getConversations(filter);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>
      </header>

      <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
        <FilterLink href="/messages" label={t('filters.unanswered')} active={filter === 'unanswered'} />
        <FilterLink
          href="/messages?filtre=toutes"
          label={t('filters.all')}
          active={filter === 'all'}
        />
      </nav>

      {!hasConsoleData() ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('notConfigured')}
        </p>
      ) : conversations.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-white px-5 py-10 text-center">
          <p className="text-[14px] text-charcoal">
            {filter === 'unanswered' ? t('allAnswered') : t('empty')}
          </p>
          <p className="mt-1 text-[13px] leading-[1.7] text-taupe">
            {filter === 'unanswered' ? t('allAnsweredHint') : t('emptyHint')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/messages/${conversation.id}`}
                className="flex flex-col gap-1.5 rounded-[18px] border border-line bg-white px-5 py-4 transition-colors hover:border-rose-deep"
              >
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-[15px] text-charcoal">
                    {conversation.client?.fullName ?? t('unknownClient')}
                  </span>
                  <ChannelBadge channel={conversation.channel} label={t(`channels.${conversation.channel}`)} />
                  {!conversation.isAnswered ? (
                    <span className="rounded-full border border-rose-dark/45 bg-blush-6 px-2.5 py-0.5 text-[10px] uppercase tracking-[.14em] text-rose-dark">
                      {t('unanswered')}
                    </span>
                  ) : null}
                  {conversation.lastMessageAt ? (
                    <time
                      dateTime={conversation.lastMessageAt}
                      className="ms-auto text-[12px] text-taupe"
                    >
                      {new Date(conversation.lastMessageAt).toLocaleDateString(INTL_TAG[locale], {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Africa/Algiers',
                      })}
                    </time>
                  ) : null}
                </span>

                {conversation.preview ? (
                  <span className="line-clamp-2 text-[13px] leading-[1.6] text-ink-2">
                    {conversation.preview}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-4 py-2 text-[12px] transition-colors',
        active
          ? 'border-rose-deep bg-rose-deep text-white'
          : 'border-rose-soft/55 text-ink-2 hover:border-rose-deep hover:text-rose-deep',
      )}
    >
      {label}
    </Link>
  );
}

function ChannelBadge({ channel, label }: { channel: string; label: string }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[.14em]',
        channel === 'whatsapp'
          ? 'border-rose-soft/55 bg-tint text-rose-deep'
          : 'border-champagne/70 bg-champagne-3 text-taupe-2',
      )}
    >
      {label}
    </span>
  );
}
