import { setRequestLocale } from 'next-intl/server';
import { BridalGallery } from '@/components/sections/BridalGallery';
import { BridalPackages } from '@/components/sections/BridalPackages';
import { ContactSection } from '@/components/sections/ContactSection';
import { Hero } from '@/components/sections/Hero';
import { InstagramGrid } from '@/components/sections/InstagramGrid';
import { ServicesGrid } from '@/components/sections/ServicesGrid';
import { SistersSection } from '@/components/sections/SistersSection';
import { TariffAccordion } from '@/components/sections/TariffAccordion';
import { Testimonials } from '@/components/sections/Testimonials';
import { Transformations } from '@/components/sections/Transformations';
import { LocalBusinessJsonLd } from '@/components/seo/JsonLd';
import { getCatalogue } from '@/data/catalogue';
import { getOpeningHours } from '@/data/hours';

/**
 * DOM order is the design's, including the four sections the brief's anchor list does not name:
 * bridal packages, transformations, testimonials and the Instagram grid.
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ categorie?: string }>;
}) {
  const { locale } = await params;
  const { categorie } = await searchParams;
  setRequestLocale(locale);

  // Both reads are cached per request, and neither depends on the other.
  const [{ categories, services, gowns }, { days: openingHours }] = await Promise.all([
    getCatalogue(),
    getOpeningHours(),
  ]);

  return (
    <>
      <LocalBusinessJsonLd services={services} categories={categories} openingHours={openingHours} />
      <Hero />
      <ServicesGrid category={categorie} categories={categories} services={services} />
      <BridalGallery gowns={gowns} />
      <BridalPackages />
      <TariffAccordion categories={categories} services={services} gowns={gowns} />
      <SistersSection />
      <Transformations />
      <Testimonials />
      <InstagramGrid />
      <ContactSection openingHours={openingHours} />
    </>
  );
}
