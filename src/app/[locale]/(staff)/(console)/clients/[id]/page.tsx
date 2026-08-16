import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ClientNoteForm } from '@/components/staff/ClientNoteForm';
import { WhatsApp } from '@/components/common/icons';
import { Link } from '@/i18n/navigation';
import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getClient, type ClientDetail } from '@/lib/console/clients';
import { parseDateRange } from '@/lib/atelier/ranges';
import { usePrice } from '@/lib/use-price';

/**
 * One client — §13's CRM.
 *
 * Everything the salon knows about her on one page, across all three business lines, because
 * that is the thing three separate books cannot do: the bride collecting a gown on Saturday is
 * very often the Thursday brushing, and nobody currently knows that except by remembering.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const client = await getClient(id);
  const t = await getTranslations({ locale, namespace: 'console.client' });
  return { title: client ? client.fullName : t('notFound') };
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const client = await getClient(id);
  if (!client) notFound();

  const t = await getTranslations({ locale, namespace: 'console.client' });
  const international = `213${client.phone.slice(1)}`;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={t('breadcrumb')}>
        <Link href="/clients" className="text-[13px] text-ink-2 transition-colors hover:text-rose-deep">
          ← {t('backToClients')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
              {client.fullName}
            </h1>
            {client.isBride ? (
              <span className="rounded-full border border-rose-soft/55 bg-blush-6 px-3 py-1 text-[10px] uppercase tracking-[.14em] text-rose-deep">
                {t('bride')}
              </span>
            ) : null}
          </div>
          <a href={`tel:${client.phone}`} dir="ltr" className="text-[14px] text-ink-2 hover:underline">
            {client.phone}
          </a>
        </div>

        <a
          href={`https://wa.me/${international}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-rose-deep px-6 py-3 text-[13px] text-white transition-colors hover:bg-rose-dark"
        >
          <WhatsApp className="size-4" />
          {t('whatsapp')}
        </a>
      </header>

      <Summary client={client} />

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <h2 id="notes-heading" className="font-display text-[22px] font-light text-charcoal">
          {t('notesHeading')}
        </h2>

        <div className="rounded-[20px] border border-line bg-white px-5 py-5">
          <ClientNoteForm clientId={client.id} />
        </div>

        {client.notes.length === 0 ? (
          <p className="text-[13px] text-taupe">{t('notesEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.notes.map((note) => (
              <li key={note.id} className="rounded-[16px] border border-line bg-white px-4 py-3">
                <p className="whitespace-pre-line text-[14px] leading-[1.7] text-charcoal">
                  {note.body}
                </p>
                <p className="mt-1.5 text-[11px] text-taupe">
                  {/* Who wrote it is half the value six months later. */}
                  {note.authorName ?? t('unknownAuthor')} ·{' '}
                  <time dateTime={note.createdAt}>
                    {new Date(note.createdAt).toLocaleDateString(INTL_TAG[locale], {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Africa/Algiers',
                    })}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-4">
        <h2 id="history-heading" className="font-display text-[22px] font-light text-charcoal">
          {t('historyHeading')}
        </h2>

        {client.history.length === 0 ? (
          <p className="text-[13px] text-taupe">{t('historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] border border-line bg-white px-4 py-3 text-[13px]"
              >
                <time className="tabular-nums text-taupe" dir="ltr">
                  {entry.at
                    ? new Date(entry.at).toLocaleDateString(INTL_TAG[locale], {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Africa/Algiers',
                      })
                    : '—'}
                </time>
                <span className="text-charcoal">{entry.serviceName ?? t(`lines.${entry.line}`)}</span>
                {entry.staffName ? <span className="text-taupe">· {entry.staffName}</span> : null}
                {entry.isRequest ? (
                  <span className="rounded-full border border-champagne/70 bg-champagne-3 px-2.5 py-0.5 text-[10px] uppercase tracking-[.14em] text-taupe-2">
                    {t('request')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {client.reservations.length > 0 ? (
        <section aria-labelledby="gowns-heading" className="flex flex-col gap-4">
          <h2 id="gowns-heading" className="font-display text-[22px] font-light text-charcoal">
            {t('gownsHeading')}
          </h2>
          <ul className="flex flex-col gap-2">
            {client.reservations.map((reservation) => {
              const range = parseDateRange(reservation.period);
              return (
                <li
                  key={reservation.id}
                  className="flex flex-wrap items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3 text-[13px]"
                >
                  <span className="text-charcoal">{reservation.gownName}</span>
                  {range ? (
                    <span className="text-taupe" dir="ltr">
                      {range.start} → {range.end}
                    </span>
                  ) : null}
                  <span className="font-mono text-[11px] text-muted-3" dir="ltr">
                    {reservation.reference}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Summary({ client }: { client: ClientDetail }) {
  const t = useTranslations('console.client');
  const price = usePrice();

  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      <Stat label={t('visits')} value={String(client.visitCount)} />
      <Stat
        label={t('spend')}
        // Null means payments were refused to this role, not that she has spent nothing.
        value={client.lifetimeSpend === null ? '—' : price({ kind: 'fixed', amount: client.lifetimeSpend })}
        hint={client.lifetimeSpend === null ? t('spendHidden') : undefined}
      />
      <Stat label={t('reservations')} value={String(client.reservations.length)} />
    </ul>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-[18px] border border-line bg-white px-5 py-4">
      <span className="text-[11px] uppercase tracking-[.16em] text-taupe">{label}</span>
      <span className="font-display text-[24px] font-light leading-tight text-charcoal">{value}</span>
      {hint ? <span className="text-[11px] leading-[1.5] text-taupe">{hint}</span> : null}
    </li>
  );
}
