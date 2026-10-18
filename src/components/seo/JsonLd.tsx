import { useLocale, useTranslations } from 'next-intl';
import { BUSINESS, type OpeningDay } from '@/data/business';
import type { Gown, Service, ServiceCategory } from '@/data/types';
import { isTodo } from '@/lib/todo';
import { priceFloor } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thesisters-ns.dz';

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Server-rendered from our own constants; no user input reaches this string.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * LocalBusiness — BUILD_BRIEF §5.6 item 25. The design carried no metadata at all.
 *
 * `openingHoursSpecification` is now published: the hours are the salon's own (09:30–17:00,
 * closed Sunday), so they belong in the knowledge panel where clients check them before setting
 * out. It was held back while they were unknown precisely because that is where a wrong answer
 * travels furthest.
 *
 * `geo` is still absent, for that unchanged reason — the coordinates were never surveyed, and a
 * wrong pin sends a bride to the wrong side of Ali Mendjeli.
 */
/** Index 0 = Sunday, matching `getDay()` and the `business_hours` weekday column. */
const SCHEMA_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function LocalBusinessJsonLd({
  services,
  categories,
  openingHours,
}: {
  services: Service[];
  categories: ServiceCategory[];
  /* The same hours the page prints and the engine honours — see src/data/hours.ts. */
  openingHours: readonly OpeningDay[];
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('meta.home');

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BeautySalon',
        '@id': `${SITE}/#business`,
        name: BUSINESS.name,
        description: t('description'),
        url: `${SITE}/${locale}`,
        telephone: BUSINESS.phoneInternational,
        priceRange: 'DZD',
        currenciesAccepted: 'DZD',
        address: {
          '@type': 'PostalAddress',
          streetAddress: BUSINESS.address.street,
          addressLocality: BUSINESS.address.city,
          addressCountry: BUSINESS.address.country,
        },
        areaServed: { '@type': 'City', name: 'Constantine' },
        /*
         * Schema.org wants English day URIs regardless of the page's locale, and only the open
         * days are listed — omitting Sunday is how the vocabulary says "closed". Emitting it
         * with 00:00–00:00 would read as open around midnight.
         */
        openingHoursSpecification: openingHours
          .filter((day) => !day.isClosed && day.opensAt && day.closesAt)
          .map((day) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${SCHEMA_DAYS[day.weekday]}`,
            opens: day.opensAt,
            closes: day.closesAt,
          })),
        makesOffer: categories.map((category) => ({
          '@type': 'OfferCatalog',
          name: category.name,
          itemListElement: services.filter((s) => s.categorySlug === category.slug).map((service) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: service.name },
            ...offerPrice(service),
          })),
        })),
      }}
    />
  );
}

/** Service + Offer for a single service page. */
export function ServiceJsonLd({
  service,
  category,
}: {
  service: Service;
  category?: ServiceCategory;
}) {
  const locale = useLocale() as Locale;

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.name,
        serviceType: category?.name,
        url: `${SITE}/${locale}/services/${service.slug}`,
        provider: { '@id': `${SITE}/#business` },
        areaServed: { '@type': 'City', name: 'Constantine' },
        offers: { '@type': 'Offer', ...offerPrice(service) },
      }}
    />
  );
}

/** A gown is a rental — Product with an offer, priced only when we actually know the price. */
export function GownJsonLd({ gown }: { gown: Gown }) {
  const locale = useLocale() as Locale;

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: gown.name,
        category: 'Wedding gown rental',
        url: `${SITE}/${locale}/robes/${gown.slug}`,
        size: `${gown.sizeMin}–${gown.sizeMax}`,
        brand: { '@type': 'Brand', name: BUSINESS.name },
        offers: {
          '@type': 'Offer',
          availability: 'https://schema.org/InStock',
          priceCurrency: 'DZD',
          // Rental prices are unknown (§6) — no price property rather than a fabricated one.
          ...(isTodo(gown.rentalPrice) ? {} : priceOf(priceFloor(gown.rentalPrice))),
          seller: { '@id': `${SITE}/#business` },
        },
      }}
    />
  );
}

function offerPrice(service: Service) {
  const floor = priceFloor(service.price);
  return { priceCurrency: 'DZD', ...priceOf(floor) };
}

/** Prices are stored in centimes; schema.org wants the major unit. */
function priceOf(centimes: number | null) {
  return centimes === null ? {} : { price: (centimes / 100).toFixed(0) };
}
