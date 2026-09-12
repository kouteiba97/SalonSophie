import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BUSINESS } from '@/data/business';
import { INTL_TAG, routing, type Locale } from '@/i18n/routing';

/**
 * The privacy policy.
 *
 * Written from what the code actually does rather than from a template, and that distinction is
 * the whole point: a generic policy would list analytics cookies this site does not set and
 * "trusted partners" it does not have, which is a lie in the one document whose only job is to
 * be true.
 *
 * The facts behind every claim on this page, so the next person can re-check them rather than
 * trust them:
 *
 *   - No analytics. `grep -riE "gtag|analytics|posthog|plausible|fbq"` over `src/` finds nothing,
 *     and `script-src 'self'` in next.config.ts means a third-party script could not load even if
 *     one were added by accident.
 *   - One cookie for a visitor: `NEXT_LOCALE`, set by next-intl, holding a language code.
 *     Verified with `curl -sI` against the production build on /fr, /ar and two inner pages.
 *   - Booking stores `clients.full_name` and `clients.phone` (20260815120300_clients_appointments).
 *   - The IP is read in `src/app/actions/book.ts` and passed to the in-memory rate limiter in
 *     `src/lib/rate-limit.ts`. It is never written to Postgres.
 *   - Role separation is RLS, not the UI — which is why the page can claim it as a guarantee.
 *
 * There is deliberately **no cookie banner**. Consent is required for tracking, and a language
 * preference a visitor expressed by choosing a language is not tracking. Adding a banner that
 * asks permission for nothing would train people to dismiss the one that matters somewhere else.
 *
 * The retention section says records are kept until asked to delete, because that is what the
 * system does today. Inventing "24 months" would be §6 applied to a legal document, which is the
 * worst place for it.
 */

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.privacy' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/confidentialite`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/confidentialite`]),
      ),
    },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-7">
      <h2 className="font-display text-[clamp(20px,2.6vw,26px)] font-light leading-tight text-charcoal">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-[1.85] text-ink-2">{children}</div>
    </section>
  );
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'privacy' });

  /*
   * The date the policy last changed, not the date the page was rendered. A policy that always
   * claims to have been updated today tells a reader nothing about whether it has been looked at.
   */
  const updated = new Date('2026-09-12').toLocaleDateString(INTL_TAG[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mx-auto w-full max-w-[74ch] px-6 py-16 sm:px-8 sm:py-24">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-[clamp(30px,5vw,44px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[15px] leading-[1.85] text-ink-2">{t('lead')}</p>
        <p className="text-[12px] text-taupe">{t('updated', { date: updated })}</p>
      </header>

      <div className="mt-12 flex flex-col gap-9">
        <Section title={t('browsing.title')}>
          <p>{t('browsing.body')}</p>
          <p>{t('browsing.cookie')}</p>
          {/* Said plainly, because its absence is the thing people notice and wonder about. */}
          <p className="rounded-[14px] bg-tint px-5 py-4 text-[14px] leading-[1.8] text-charcoal">
            {t('browsing.banner')}
          </p>
        </Section>

        <Section title={t('booking.title')}>
          <p>{t('booking.body')}</p>
          <p>{t('booking.note')}</p>
          <p>{t('booking.ip')}</p>
        </Section>

        <Section title={t('where.title')}>
          <p>{t('where.body')}</p>
          <p>{t('where.access')}</p>
          <p>{t('where.audit')}</p>
        </Section>

        <Section title={t('retention.title')}>
          <p>{t('retention.body')}</p>
        </Section>

        <Section title={t('rights.title')}>
          <p>{t('rights.body')}</p>
          <p>{t('rights.limit')}</p>
        </Section>

        <Section title={t('whatsapp.title')}>
          <p>{t('whatsapp.body')}</p>
        </Section>

        <Section title={t('staff.title')}>
          <p>{t('staff.body')}</p>
        </Section>

        <Section title={t('contact.title')}>
          <p>{t('contact.body', {
            phone: BUSINESS.phone,
            address: `${BUSINESS.address.street}, ${BUSINESS.address.city}`,
          })}</p>
        </Section>

        {/*
          Kept on the published page rather than in a code comment. A reader deserves to know the
          document has not been through a lawyer yet, and the salon deserves to be reminded every
          time someone opens it.
        */}
        <Section title={t('review.title')}>
          <p className="rounded-[14px] border border-champagne/60 bg-champagne-3/50 px-5 py-4 text-[14px] leading-[1.8] text-charcoal">
            {t('review.body')}
          </p>
        </Section>
      </div>
    </div>
  );
}
