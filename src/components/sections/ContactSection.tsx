import { useLocale, useTranslations } from 'next-intl';
import { BrandedImage } from '@/components/common/BrandedImage';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import { ArrowRight, MapPin, Phone, WhatsApp } from '@/components/common/icons';
import { BUSINESS, type OpeningDay, whatsappLink } from '@/data/business';
import { formatOpeningHours } from '@/lib/datetime';
import type { Locale } from '@/i18n/routing';

const MAPS_URL = 'https://maps.google.com/?q=Ali+Mendjeli+UV5+Constantine';

export function ContactSection({ openingHours }: { openingHours: readonly OpeningDay[] }) {
  const t = useTranslations('contact');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  return (
    <Reveal
      as="section"
      id="contact"
      className="bg-cream px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,104px)]"
    >
      <div className="mx-auto grid w-full max-w-[1180px] gap-[clamp(24px,3.5vw,56px)] lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />

          <p className="flex max-w-[46ch] items-start gap-3 text-[15px] leading-[1.8] text-ink-2">
            <MapPin className="mt-1 size-5 shrink-0 text-rose-deep" />
            {t('address')}
          </p>

          {/*
            The design printed "Samedi – Jeudi · 09 h 00 – 19 h 00" and "Vendredi · Fermé", and
            every part of that was wrong: the salon shuts at 17:00, trades on Friday and closes
            on Sunday. Hours are exactly the kind of line a client acts on — someone drives
            across Ali Mendjeli on the strength of it — so these are the salon's own.

            Grouped rather than seven rows, so the one line that matters (Sunday, closed) is not
            buried in a list where every other row says the same thing.
          */}
          <div className="flex flex-col gap-1 rounded-[18px] border border-rose-soft/30 bg-white px-5 py-4">
            <p className="text-[11px] uppercase tracking-[.2em] text-taupe">{t('hoursTitle')}</p>
            <dl className="m-0 flex flex-col gap-1">
              {formatOpeningHours(openingHours, locale).map((line) => (
                <div key={line.days} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt className="text-[15px] capitalize text-charcoal">{line.days}</dt>
                  <dd
                    className={`m-0 text-[15px] ${line.hours ? 'text-ink-2' : 'text-taupe'}`}
                    dir={line.hours ? 'ltr' : undefined}
                  >
                    {line.hours ?? tc('closed')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={whatsappLink(t('whatsappMessage'))}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-full bg-rose-deep px-6 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
            >
              <WhatsApp className="size-4" />
              {t('whatsapp')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
            </a>

            {/* The one real line (§1) — never the design's +213 661 23 45 67 placeholder. */}
            <a
              href={`tel:${BUSINESS.phoneInternational}`}
              className="inline-flex items-center gap-2.5 rounded-full border border-rose-soft/55 px-6 py-3.5 text-[14px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
              dir="ltr"
            >
              <Phone className="size-4" />
              {BUSINESS.phone}
            </a>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[24px]">
          <BrandedImage
            id="ns-map"
            alt={t('mapAlt')}
            width={900}
            height={700}
            sizes="(max-width: 1024px) 100vw, 560px"
            frameClassName="w-full h-full"
          />
          <a
            href={MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-full bg-cream-warm/92 px-5 py-2.5 text-[13px] text-rose-deep backdrop-blur-sm transition-colors hover:bg-white"
          >
            {t('directions')}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </a>
        </div>
      </div>
    </Reveal>
  );
}
