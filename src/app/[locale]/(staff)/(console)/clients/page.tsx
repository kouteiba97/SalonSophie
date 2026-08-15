import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { INTL_TAG, type Locale } from '@/i18n/routing';
import { getClients } from '@/lib/console/clients';
import { isAuthConfigured } from '@/lib/supabase/session';
import { usePrice } from '@/lib/use-price';

/**
 * The unified client list (§13).
 *
 * Search is a URL query param, so a filtered list is a shareable address and the back button
 * works — the same rule the public catalogue follows.
 *
 * Lifetime spend is owner-only under RLS. Rather than hide the column from reception or show
 * them a false zero, it renders an em dash and the page says why once.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.clients' });
  return { title: t('title') };
}

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.clients' });
  const search = q?.trim() || null;
  const { clients, spendVisible } = await getClients(search);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">{t('subtitle')}</p>
      </header>

      {/* A GET form: submitting puts the search in the URL, and it works without JavaScript. */}
      <form method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="client-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <input
          id="client-search"
          name="q"
          type="search"
          defaultValue={search ?? ''}
          placeholder={t('searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-full border border-rose-soft/45 bg-white px-5 py-2.5 text-[14px] text-charcoal outline-none transition-colors placeholder:text-muted focus:border-rose-deep"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-full bg-rose-deep px-6 py-2.5 text-[13px] text-white transition-colors hover:bg-rose-dark"
        >
          {t('search')}
        </button>
      </form>

      {!isAuthConfigured ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('notConfigured')}
        </p>
      ) : clients.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-white px-5 py-10 text-center">
          <p className="text-[14px] text-charcoal">{search ? t('noMatch') : t('empty')}</p>
          <p className="mt-1 text-[13px] leading-[1.7] text-taupe">
            {search ? t('noMatchHint') : t('emptyHint')}
          </p>
        </div>
      ) : (
        <>
          {!spendVisible ? (
            <p className="text-[12px] leading-[1.6] text-taupe">{t('spendHidden')}</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <caption className="sr-only">{t('tableCaption')}</caption>
              <thead>
                <tr className="border-b border-line text-start">
                  <Th>{t('name')}</Th>
                  <Th>{t('phone')}</Th>
                  <Th>{t('visits')}</Th>
                  <Th>{t('spend')}</Th>
                  <Th>{t('lastVisit')}</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <ClientRow key={client.id} client={client} locale={locale} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2.5 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
      {children}
    </th>
  );
}

function ClientRow({
  client,
  locale,
}: {
  client: Awaited<ReturnType<typeof getClients>>['clients'][number];
  locale: Locale;
}) {
  const t = useTranslations();
  const price = usePrice();

  return (
    <tr className="border-b border-line/70">
      <td className="px-3 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-charcoal">{client.fullName}</span>
          {client.isBride ? (
            <span className="rounded-full border border-rose-soft/55 bg-blush-6 px-2.5 py-0.5 text-[10px] uppercase tracking-[.14em] text-rose-deep">
              {t('console.clients.bride')}
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-3">
        <a href={`tel:${client.phone}`} dir="ltr" className="text-ink-2 hover:underline">
          {client.phone}
        </a>
      </td>
      <td className="px-3 py-3 tabular-nums text-ink-2">{client.visitCount}</td>
      <td className="px-3 py-3 text-ink-2">
        {client.lifetimeSpend === null
          ? '—'
          : price({ kind: 'fixed', amount: client.lifetimeSpend })}
      </td>
      <td className="px-3 py-3 text-ink-2">
        {client.lastVisit
          ? new Date(client.lastVisit).toLocaleDateString(INTL_TAG[locale], {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'Africa/Algiers',
            })
          : '—'}
      </td>
    </tr>
  );
}
