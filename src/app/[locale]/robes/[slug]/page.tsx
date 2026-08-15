import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookButton } from '@/components/common/BookButton';
import { BrandedImage } from '@/components/common/BrandedImage';
import { GownJsonLd } from '@/components/seo/JsonLd';
import { gownSizeLabel } from '@/data/bridal';
import { findGownBySlug, getCatalogue } from '@/data/catalogue';
import { Link } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/money';

export async function generateStaticParams() {
  const { gowns } = await getCatalogue();
  return routing.locales.flatMap((locale) => gowns.map((gown) => ({ locale, slug: gown.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const gown = await findGownBySlug(slug);
  if (!gown) return {};

  const t = await getTranslations({ locale, namespace: 'meta.gownDetail' });

  return {
    title: t('title', { name: gown.name }),
    description: t('description', { name: gown.name, sizes: gownSizeLabel(gown) }),
    alternates: {
      canonical: `/${locale}/robes/${slug}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/robes/${slug}`])),
    },
    openGraph: {
      type: 'website',
      title: t('title', { name: gown.name }),
      description: t('description', { name: gown.name, sizes: gownSizeLabel(gown) }),
    },
  };
}

/**
 * One gown, one URL (§5.1 item 3) — "a bride must be able to send her mother a link to one gown".
 * The design only had `#robe-anastasia` anchors on a single page.
 */
export default async function GownDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const gown = await findGownBySlug(slug);
  if (!gown) notFound();

  const t = await getTranslations('bridal');
  const tc = await getTranslations('common');

  const rental = formatPrice(gown.rentalPrice, locale, {
    currency: tc('currency'),
    onRequest: tc('onRequest'),
    from: (amount) => tc('fromPrice', { price: amount }),
    free: tc('free'),
  });

  const { gowns, accessories } = await getCatalogue();
  const others = gowns.filter((g) => g.slug !== gown.slug);

  return (
    <>
      <GownJsonLd gown={gown} />

      <article className="mx-auto w-full max-w-[1080px] px-[clamp(20px,4vw,56px)] py-[clamp(40px,5vw,80px)]">
        <Link href="/#mariee" className="text-[13px] text-taupe transition-colors hover:text-rose-deep">
          ← {t('detail.backToGowns')}
        </Link>

        <div className="mt-6 grid gap-[clamp(24px,4vw,56px)] lg:grid-cols-[minmax(0,460px)_1fr]">
          <BrandedImage
            id={gown.imageId}
            alt={gown.name}
            width={920}
            height={1150}
            priority
            sizes="(max-width: 1024px) 100vw, 460px"
            frameClassName="rounded-[24px] w-full"
          />

          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[.24em] text-taupe">
                {t('tier', { tier: gown.tier })}
              </p>
              <h1 className="mt-2 font-display text-[clamp(36px,5.4vw,62px)] font-light leading-[1.02] tracking-[-.015em] text-charcoal">
                {gown.name}
              </h1>
            </div>

            <p className="text-[15px] leading-[1.8] text-ink-2">
              {t(`gowns.${gown.slug}.silhouette`)}
            </p>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[18px] border border-rose-soft/30 bg-white px-5 py-4">
                {/* The most frequently asked question, never behind a click (§6). */}
                <dt className="text-[11px] uppercase tracking-[.2em] text-taupe">
                  {t('detail.sizesAvailable')}
                </dt>
                <dd className="mt-1 text-[22px] font-light text-charcoal">
                  {gownSizeLabel(gown)}
                </dd>
              </div>
              <div className="rounded-[18px] border border-rose-soft/30 bg-white px-5 py-4">
                <dt className="text-[11px] uppercase tracking-[.2em] text-taupe">
                  {t('detail.rental')}
                </dt>
                {/* Rental prices are unknown (§6); the design invented 38 000 / 45 000 / 55 000. */}
                <dd className="mt-1 text-[22px] font-light text-rose-deep">{rental}</dd>
              </div>
            </dl>

            {/* Booking a gown schedules a fitting, not a rental (§5.3 item 10). */}
            <div className="rounded-[18px] border border-rose-soft/30 bg-tint/55 px-5 py-4">
              <p className="text-[13px] leading-[1.7] text-ink-2">
                {(await getTranslations('booking'))('fittingNote')}
              </p>
            </div>

            <BookButton
              label={t('detail.bookFitting')}
              gownSlug={gown.slug}
              className="px-7 py-3.5 text-[15px]"
            />

            <section className="border-t border-line pt-5">
              <h2 className="text-[11px] uppercase tracking-[.2em] text-taupe">
                {t('accessories.title')}
              </h2>
              <p className="mt-1 text-[13px] text-taupe-2">{t('accessories.lead')}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {accessories.map((accessory) => (
                  <li
                    key={accessory.slug}
                    className="rounded-full bg-white px-4 py-2 text-[13px] text-charcoal ring-1 ring-rose-soft/35"
                  >
                    {accessory.name}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className="mt-14 border-t border-line pt-8">
          <h2 className="font-display text-[26px] font-light text-charcoal">
            {t('detail.otherGowns')}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/robes/${other.slug}`}
                className="flex items-center gap-4 rounded-[20px] border border-rose-soft/30 bg-white p-3 transition-colors hover:border-rose-deep"
              >
                <BrandedImage
                  id={other.imageId}
                  alt={other.name}
                  width={160}
                  height={200}
                  sizes="80px"
                  frameClassName="rounded-[14px] w-20 shrink-0"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-[20px] font-light text-charcoal">
                    {other.name}
                  </span>
                  <span className="text-[12px] text-taupe-2">
                    {t('sizes', { range: gownSizeLabel(other) })} · {other.tier}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </>
  );
}
