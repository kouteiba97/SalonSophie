import { useTranslations } from 'next-intl';

/** Loading state (BUILD_BRIEF §5.7 item 26). Skeleton blocks, so nothing jumps when content lands. */
export default function Loading() {
  const t = useTranslations('common');

  return (
    <div className="px-[clamp(20px,4vw,56px)] py-[clamp(56px,7vw,110px)]">
      <span className="sr-only" role="status">
        {t('loading')}
      </span>

      <div className="mx-auto w-full max-w-[1180px] animate-pulse">
        <div className="h-3 w-28 rounded-full bg-rose-soft/25" />
        <div className="mt-4 h-10 w-[min(520px,80%)] rounded-full bg-rose-soft/20" />
        <div className="mt-3 h-4 w-[min(380px,60%)] rounded-full bg-rose-soft/15" />

        <div className="mt-10 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,286px),1fr))]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-44 rounded-[22px] bg-rose-soft/12" />
          ))}
        </div>
      </div>
    </div>
  );
}
