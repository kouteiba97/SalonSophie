import { useTranslations } from 'next-intl';

/**
 * The loading state of "every list has four states".
 *
 * A skeleton rather than a spinner: the console's job is to be read at a desk while someone is
 * on the phone, and a layout that settles into place beats one that appears all at once. The
 * live region announces it, because a screen-reader user gets nothing from grey rectangles.
 */
export default function AtelierLoading() {
  const t = useTranslations('atelier.dashboard');

  return (
    <div className="flex flex-col gap-8">
      <p role="status" aria-live="polite" className="sr-only">
        {t('loading')}
      </p>

      <div aria-hidden className="flex flex-col gap-3">
        <div className="h-9 w-[42%] rounded-full bg-blush-4" />
        <div className="h-4 w-[62%] rounded-full bg-tint" />
      </div>

      <ul aria-hidden className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-white px-5 py-5"
          >
            <div className="h-6 w-1/2 rounded-full bg-blush-4" />
            <div className="h-3 w-1/3 rounded-full bg-tint" />
            <div className="h-1.5 w-full rounded-full bg-tint" />
            <div className="h-4 w-3/4 rounded-full bg-tint" />
          </li>
        ))}
      </ul>
    </div>
  );
}
