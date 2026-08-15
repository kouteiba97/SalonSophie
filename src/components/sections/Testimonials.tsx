import { useTranslations } from 'next-intl';
import { Reveal } from '@/components/common/Reveal';
import { SectionHeading } from '@/components/common/SectionHeading';
import { WhatsApp } from '@/components/common/icons';
import { whatsappLink } from '@/data/business';

interface Review {
  id: string;
  quote: string;
  author: string;
  context: string;
}

/**
 * Testimonials — held, deliberately.
 *
 * The design shipped three quotes attributed to named clients ("Meriem B. — Mariée, juin 2025",
 * "Yasmine K.", "Lamia T. — Cliente fidèle depuis 2023"), each with a specific story and date.
 * Publishing invented testimonials under real-sounding names on a real business's site is the
 * same failure as inventing a price, with consumer-protection consequences attached.
 *
 * The section keeps its place in the page so the layout is unchanged, and renders the empty
 * state §5.7 asks for: written in the brand's voice, inviting the action that fills it.
 */
export function Testimonials() {
  const t = useTranslations('testimonials');

  // Empty until real, consented reviews exist — see TODO_TESTIMONIALS. Phase 6 fills this from
  // the `reviews` table, so supplying them is a data change rather than a rewrite.
  const reviews: Review[] = [];

  return (
    <Reveal as="section" className="bg-cream px-[clamp(20px,4vw,56px)] py-[clamp(56px,6vw,104px)]">
      <div className="mx-auto w-full max-w-[1180px]">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} accent={t('titleAccent')} />

        {reviews.length === 0 ? (
          <div className="mt-9 rounded-[24px] border border-dashed border-rose-soft/50 bg-white/70 px-6 py-14 text-center">
            <span aria-hidden className="font-script text-[42px] leading-none text-champagne">
              “
            </span>
            <p className="mt-2 font-display text-[24px] font-light text-charcoal">
              {t('empty.title')}
            </p>
            <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-[1.75] text-ink-2">
              {t('empty.body')}
            </p>
            <a
              href={whatsappLink(t('empty.action'))}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose-soft/55 px-6 py-2.5 text-[13px] text-rose-deep transition-colors hover:border-rose-deep"
            >
              <WhatsApp className="size-4" />
              {t('empty.action')}
            </a>
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}
