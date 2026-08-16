import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { OpeningHoursEditor, type OpeningDayValue } from '@/components/staff/OpeningHoursEditor';
import { ServiceEditor, type EditableService } from '@/components/staff/ServiceEditor';
import { getCatalogue } from '@/data/catalogue';
import type { Service } from '@/data/types';
import type { Locale } from '@/i18n/routing';
import { getStaffSession, isOwner } from '@/lib/auth';
import { getSupabaseSessionClient } from '@/lib/supabase/session';
import type { BusinessHoursRow } from '@/lib/supabase/types';
import { isTodo } from '@/lib/todo';
import { useDuration, usePrice } from '@/lib/use-price';

/**
 * Services & Prices (§13's sidebar) — now the room where the tariff is actually set.
 *
 * It reads the same catalogue as the public site, so what reception quotes and what a client
 * sees cannot drift. What changed is that an owner can edit it here, which matters for one
 * reason above the rest: every service without a duration keeps its bookings as *requests* the
 * salon has to chase, because the availability engine cannot size a slot it has no length for.
 * Filling those in, and the opening hours below, is what turns the booking flow real.
 *
 * Reception sees the tariff and no edit controls. That is a courtesy — RLS is the boundary, and
 * `upsert_service` is deliberately not `security definer`, so a forged request still fails.
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

/** Centimes to the dinars a person types. Blank stays blank — it never becomes a zero. */
const toDinars = (centimes: number | null | undefined): string =>
  centimes === null || centimes === undefined ? '' : String(centimes / 100);

function toEditable(service: Service): EditableService {
  const price = service.price;
  const min =
    price.kind === 'free' ? null : price.kind === 'range' ? price.min : price.amount;
  const max = price.kind === 'range' ? price.max : null;

  return {
    slug: service.slug,
    categorySlug: service.categorySlug,
    name: service.name,
    kind: price.kind,
    priceMin: toDinars(min),
    priceMax: toDinars(max),
    durationMinutes: isTodo(service.duration) ? '' : String(service.duration),
    bufferMinutes: '0',
    isActive: true,
  };
}

async function readOpeningHours(): Promise<OpeningDayValue[]> {
  const supabase = await getSupabaseSessionClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('business_hours')
    .select('weekday, opens_at, closes_at, is_closed')
    .returns<BusinessHoursRow[]>();

  if (error || !data) return [];

  return data.map((row) => ({
    weekday: row.weekday,
    isClosed: row.is_closed,
    opensAt: (row.opens_at ?? '09:00').slice(0, 5),
    closesAt: (row.closes_at ?? '19:00').slice(0, 5),
  }));
}

export default async function PrestationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'console.prestations' });
  const manage = await getTranslations({ locale, namespace: 'console.manage' });
  const { categories, services } = await getCatalogue();

  const session = await getStaffSession();
  const canEdit = session ? isOwner(session) : false;
  const hours = canEdit ? await readOpeningHours() : [];

  const missingDurations = services.filter((service) => isTodo(service.duration)).length;
  const categoryOptions = categories.map((c) => ({ slug: c.slug, name: c.name }));

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

      {/* Hours sit above the tariff because without them no duration in the world yields a slot. */}
      {canEdit ? (
        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[21px] font-light text-charcoal">
              {manage('hoursTitle')}
            </h2>
            <p className="max-w-[70ch] text-[13px] leading-[1.7] text-ink-2">
              {manage('hoursLead')}
            </p>
          </div>
          <OpeningHoursEditor days={hours} />
        </section>
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
                      <th scope="col" className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                        {t('service')}
                      </th>
                      <th scope="col" className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                        {t('price')}
                      </th>
                      <th scope="col" className="px-3 py-2 text-start text-[11px] uppercase tracking-[.14em] text-taupe">
                        {t('duration')}
                      </th>
                      {canEdit ? <th scope="col" className="px-3 py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {inCategory.map((service) => (
                      <ServiceRow
                        key={service.slug}
                        service={service}
                        canEdit={canEdit}
                        categories={categoryOptions}
                      />
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

function ServiceRow({
  service,
  canEdit,
  categories,
}: {
  service: Service;
  canEdit: boolean;
  categories: { slug: string; name: string }[];
}) {
  const price = usePrice();
  const duration = useDuration();

  return (
    <tr className="border-b border-line/70 align-top">
      <td className="px-3 py-2.5 text-charcoal">
        {service.name}
        {service.note ? <span className="block text-[12px] text-taupe">{service.note}</span> : null}
      </td>
      <td className="px-3 py-2.5 text-ink-2">{price(service.price)}</td>
      {/* An em dash, never an invented "45 min" (§6). */}
      <td className="px-3 py-2.5 text-ink-2">{duration(service.duration)}</td>
      {canEdit ? (
        <td className="px-3 py-2.5">
          <ServiceEditor service={toEditable(service)} categories={categories} />
        </td>
      ) : null}
    </tr>
  );
}
