import { useTranslations } from 'next-intl';

/**
 * Says, on every console screen, that none of this is real.
 *
 * Demo mode exists so the console can be judged (§14: an empty app cannot be evaluated), and the
 * price of showing invented records is saying so without exception. An unlabelled example day is
 * indistinguishable from a real one, and somebody would eventually quote a figure off it.
 *
 * `role="status"` rather than a decorative strip: a screen-reader user must get the same warning
 * a sighted one does.
 */
export function DemoBanner() {
  const t = useTranslations('console.demo');

  return (
    <div
      role="status"
      className="border-b border-champagne bg-champagne-2 px-6 py-2.5 text-center text-[12px] leading-[1.6] text-ink-3"
    >
      <strong className="font-normal uppercase tracking-[.14em]">{t('label')}</strong>{' '}
      <span className="text-taupe-2">{t('body')}</span>
    </div>
  );
}
