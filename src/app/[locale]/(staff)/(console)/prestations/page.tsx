import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getCatalogue } from '@/data/catalogue';
import type { Locale } from '@/i18n/routing';
import { isTodo } from '@/lib/todo';
import { useDuration, usePrice } from '@/lib/use-price';

/**
 * Services & Prices (§13's sidebar) — the tariff as reception reads it out on the phone.
 *
 * Read-only for now, and it earns its place by making one absence visible: the count of services
 * with no duration. That number is why the booking flow still answers "request" instead of
 * offering a time — the availability engine cannot size a slot it has no length for — and it is
 * the single most valuable thing anyone could fill in.
 *
 * Reads the same catalogue as the public site, so what reception quotes and what a client sees
 * cannot drift apart.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'console.prestations' });
  return { title: t('title') };
}

export default async function PrestationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.prestations' });
  const { categories, services } = await getCatalogue();

  const missingDurations = services.filter((service) => isTodo(service.duration)).length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-light leading-tight text-charcoal">
          {t('title')}
        </h1>
        <p className="text-[14px] leading-[1.7] text-ink-2">
          {t('subtitle', { services: services.length, categories: categories.length })}
        </p>
      </header>

      {missingDurations > 0 ? (
        <p
          role="status"
          className="rounded-[18px] border border-champagne/60 bg-champagne-3/60 px-5 py-4 text-[13px] leading-[1.7] text-ink-2"
        >
          {t('missingDurations', { count: missingDurations })}
        </p>
      ) : null}

      <div className="flex flex-col gap-8">
        {categories.map((category) => {
          const inCategory = services.filter((s) => s.categorySlug === category.slug);
          if (inCategory.length === 0) return null;

          return (
            <section key={category.slug} className="flex flex-col gap-3">
              <h2 className="font-display text-[21px] font-light text-charcoal">{category.name}</h2>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[14px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th
                        scope="col"
                        className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe"
                      >
                        {t('service')}
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe"
                      >
                        {t('price')}
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe"
                      >
                        {t('duration')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {inCategory.map((service) => (
                      <ServiceRow key={service.slug} service={service} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: Awaited<ReturnType<typeof getCatalogue>>['services'][number] }) {
  const price = usePrice();
  const duration = useDuration();

  return (
    <tr className="border-b border-line/70">
      <td className="px-3 py-2.5 text-charcoal">
        {service.name}
        {service.note ? <span className="block text-[12px] text-taupe">{service.note}</span> : null}
      </td>
      <td className="px-3 py-2.5 text-ink-2">{price(service.price)}</td>
      {/* An em dash, never an invented "45 min" (§6). */}
      <td className="px-3 py-2.5 text-ink-2">{duration(service.duration)}</td>
    </tr>
  );
}
