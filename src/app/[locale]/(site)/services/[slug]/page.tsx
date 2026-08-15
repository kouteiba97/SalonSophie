import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookButton } from '@/components/common/BookButton';
import { ServiceJsonLd } from '@/components/seo/JsonLd';
import { findCategoryBySlug, findServiceBySlug, getCatalogue } from '@/data/catalogue';
import type { Service } from '@/data/types';
import { Link } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/money';
import { isTodo } from '@/lib/todo';

/**
 * Every service gets its own route (§5.1 item 3). Params come from the catalogue, so the set of
 * pages follows the database once one is configured, and the committed seed until then.
 */
export async function generateStaticParams() {
  const { services } = await getCatalogue();
  return routing.locales.flatMap((locale) => services.map((s) => ({ locale, slug: s.slug })));
}

async function priceLabel(locale: Locale, service: Service) {
  const t = await getTranslations({ locale, namespace: 'common' });
  return formatPrice(service.price, locale, {
    currency: t('currency'),
    onRequest: t('onRequest'),
    from: (amount) => t('fromPrice', { price: amount }),
    free: t('free'),
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const service = await findServiceBySlug(slug);
  if (!service) return {};

  const t = await getTranslations({ locale, namespace: 'meta.serviceDetail' });
  const price = await priceLabel(locale, service);

  return {
    title: t('title', { name: service.name }),
    description: t('description', { name: service.name, price }),
    alternates: {
      canonical: `/${locale}/services/${slug}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/services/${slug}`])),
    },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const service = await findServiceBySlug(slug);
  if (!service) notFound();

  const t = await getTranslations('services.detail');
  const tc = await getTranslations('common');
  const category = await findCategoryBySlug(service.categorySlug);
  const price = await priceLabel(locale, service);

  const { services } = await getCatalogue();
  const siblings = services
    .filter((s) => s.categorySlug === service.categorySlug && s.slug !== service.slug)
    .slice(0, 6);

  return (
    <>
      <ServiceJsonLd service={service} category={category} />

      <article className="mx-auto w-full max-w-[900px] px-[clamp(20px,4vw,56px)] py-[clamp(40px,5vw,80px)]">
        <Link
          href="/#services"
          className="text-[13px] text-taupe transition-colors hover:text-rose-deep"
        >
          ← {t('backToServices')}
        </Link>

        <p className="mt-6 text-[11px] uppercase tracking-[.24em] text-taupe">{category?.name}</p>
        <h1 className="mt-2 font-display text-[clamp(34px,5vw,58px)] font-light leading-[1.05] tracking-[-.015em] text-charcoal">
          {service.name}
        </h1>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[18px] border border-rose-soft/30 bg-white px-5 py-4">
            <dt className="text-[11px] uppercase tracking-[.2em] text-taupe">{t('price')}</dt>
            <dd className="mt-1 text-[22px] font-light text-rose-deep">{price}</dd>
          </div>
          <div className="rounded-[18px] border border-rose-soft/30 bg-white px-5 py-4">
            <dt className="text-[11px] uppercase tracking-[.2em] text-taupe">{t('duration')}</dt>
            {/* Unknown for every service (§6) — an em dash, never a plausible-looking guess. */}
            <dd className="mt-1 text-[22px] font-light text-charcoal">
              {isTodo(service.duration) ? tc('unknown') : `${service.duration} min`}
            </dd>
          </div>
        </dl>

        {service.note ? (
          <p className="mt-4 text-[13px] text-taupe-2">
            {tc(service.note as 'supplement' | 'withAnyMassage')}
          </p>
        ) : null}

        <BookButton
          label={t('bookThis')}
          serviceSlug={service.slug}
          className="mt-8 px-7 py-3.5 text-[15px]"
        />

        {siblings.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-[24px] font-light text-charcoal">
              {t('otherInCategory', { category: category?.name ?? '' })}
            </h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {siblings.map((sibling) => (
                <li key={sibling.slug}>
                  <Link
                    href={`/services/${sibling.slug}`}
                    className="flex items-center justify-between gap-3 rounded-[16px] border border-rose-soft/30 bg-white px-4 py-3 text-[14px] text-charcoal transition-colors hover:border-rose-deep"
                  >
                    {sibling.name}
                    <span aria-hidden className="text-rose-deep">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </>
  );
}
