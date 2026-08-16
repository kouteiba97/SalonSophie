import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BridalGallery } from '@/components/sections/BridalGallery';
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
  const t = await getTranslations({ locale, namespace: 'meta.gowns' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/robes`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/robes`])),
    },
  };
}

export default async function GownsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { gowns } = await getCatalogue();
  return <BridalGallery gowns={gowns} />;
}
