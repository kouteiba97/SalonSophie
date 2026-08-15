import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ServicesGrid } from '@/components/sections/ServicesGrid';
import { TariffAccordion } from '@/components/sections/TariffAccordion';
import { getCatalogue } from '@/data/catalogue';
import { routing, type Locale } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.services' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/services`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/services`])),
    },
  };
}

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ categorie?: string }>;
}) {
  const { locale } = await params;
  const { categorie } = await searchParams;
  setRequestLocale(locale);

  const { categories, services, gowns } = await getCatalogue();

  return (
    <>
      <ServicesGrid category={categorie} categories={categories} services={services} />
      <TariffAccordion categories={categories} services={services} gowns={gowns} />
    </>
  );
}
