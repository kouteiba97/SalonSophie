import { useTranslations } from 'next-intl';
import { BrandedImage } from '@/components/common/BrandedImage';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';

/**
 * Nour & Sophie (§ anchor `#soeurs`).
 *
 * The design opened with a paragraph dating the salon to 2018, sizing the first room at thirty
 * square metres and claiming the institute "réunit quinze expertes", then a stat row of
 * 2018 / 340 k / 180+. None of it is confirmed and the staff figure contradicts §6 outright, so
 * the section keeps the paragraph that §1 does support — who does what — and drops the rest.
 */
export function SistersSection() {
  const t = useTranslations('sisters');

  return (
    <Reveal
      as="section"
      id="soeurs"
      className="bg-cream px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,110px)]"
    >
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-[clamp(28px,4vw,64px)] lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-4">
          <BrandedImage
            id="ns-nour"
            alt={t('nourAlt')}
            width={520}
            height={680}
            sizes="(max-width: 1024px) 45vw, 260px"
            frameClassName="rounded-[24px] w-full"
          />
          <BrandedImage
            id="ns-sophie"
            alt={t('sophieAlt')}
            width={520}
            height={680}
            sizes="(max-width: 1024px) 45vw, 260px"
            frameClassName="rounded-[24px] w-full mt-[clamp(18px,4vw,44px)]"
          />
        </div>

        <div className="flex flex-col gap-5">
          <SectionHeading eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />
          <p className="max-w-[52ch] text-[15px] leading-[1.85] text-ink-2">{t('body')}</p>
        </div>
      </div>
    </Reveal>
  );
}
