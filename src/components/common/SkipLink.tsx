import { useTranslations } from 'next-intl';

/** BUILD_BRIEF §5.4 item 17 — the design had no skip link and no landmarks at all. */
export function SkipLink() {
  const t = useTranslations('nav');

  return (
    <a
      href="#main"
      className="sr-only rounded-full bg-rose-deep px-5 py-3 text-sm text-white focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100]"
    >
      {t('skipToContent')}
    </a>
  );
}
