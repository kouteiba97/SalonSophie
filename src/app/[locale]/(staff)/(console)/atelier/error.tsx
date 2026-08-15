'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The error state of "every list has four states", for the console.
 *
 * Deliberately not the public error page: that one offers WhatsApp, because a client who cannot
 * book online can still book by hand. Someone at the desk needs the opposite — retry, and the
 * digest to quote if it keeps happening.
 */
export default function AtelierError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('atelier.error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 px-6 py-[clamp(56px,10vw,120px)] text-center">
      <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
        {t('title')}
      </h1>
      <p className="text-[14px] leading-[1.8] text-ink-2">{t('body')}</p>

      <button
        type="button"
        onClick={reset}
        className="mt-1 cursor-pointer rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
      >
        {t('retry')}
      </button>

      {error.digest ? (
        <p className="font-mono text-[11px] text-muted-3" dir="ltr">
          {t('digest', { digest: error.digest })}
        </p>
      ) : null}
    </div>
  );
}
