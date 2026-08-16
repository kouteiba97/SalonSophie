'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { WhatsApp } from '@/components/common/icons';
import { whatsappLink } from '@/data/business';

/**
 * Error boundary (BUILD_BRIEF §5.7 item 26). The design had none — a thrown error left a blank
 * page. The copy says what to do next: a client who cannot book online can still book by hand.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.generic');
  const contact = useTranslations('contact');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-5 px-6 py-[clamp(72px,12vw,160px)] text-center">
      <h1 className="font-display text-[clamp(28px,4.4vw,44px)] font-light leading-tight text-charcoal">
        {t('title')}
      </h1>

      <p className="max-w-[48ch] text-[15px] leading-[1.8] text-ink-2">{t('body')}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
        >
          {t('retry')}
        </button>
        <a
          href={whatsappLink(contact('whatsappMessage'))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-rose-soft/55 px-6 py-3.5 text-[14px] text-ink-2 transition-colors hover:border-rose-deep hover:text-rose-deep"
        >
          <WhatsApp className="size-4" />
          {t('whatsapp')}
        </a>
      </div>
    </div>
  );
}
