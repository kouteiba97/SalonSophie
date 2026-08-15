import { useTranslations } from 'next-intl';
import { BeforeAfterSlider } from '@/components/common/BeforeAfterSlider';
import { BookButton } from '@/components/common/BookButton';
import { BrandedImage } from '@/components/common/BrandedImage';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';

export function Transformations() {
  const t = useTranslations('transformations');

  return (
    <Reveal
      as="section"
      className="bg-cream-warm px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,104px)]"
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />

        <div className="mt-9 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <BeforeAfterSlider />

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
              {['ns-tr-2', 'ns-tr-3', 'ns-tr-4'].map((id) => (
                <BrandedImage
                  key={id}
                  id={id}
                  alt={t('eyebrow')}
                  width={420}
                  height={300}
                  sizes="(max-width: 1024px) 30vw, 300px"
                  frameClassName="rounded-[18px] w-full"
                />
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-3 rounded-[20px] border border-rose-soft/30 bg-white p-5">
              {/*
                The design added "Toutes nos photos sont brutes, sans retouche de peau" here.
                That is a claim about photographs that do not exist yet, so only the instruction
                for using the slider survives.
              */}
              <p className="text-[13px] leading-[1.7] text-ink-2">{t('hint')}</p>
              <BookButton label={t('cta')} className="w-full py-3 text-[13px]" />
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
