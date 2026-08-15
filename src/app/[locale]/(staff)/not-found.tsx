import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * 404 inside the console.
 *
 * Separate from the public one, which offers WhatsApp and a route back to the home page — the
 * wrong exits entirely for someone who mistyped a gown slug at the desk.
 */
export default function StaffNotFound() {
  const t = useTranslations('atelier.notFound');

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-4 px-6 py-[clamp(56px,10vw,120px)] text-center">
      <h1 className="font-display text-[clamp(24px,3.6vw,32px)] font-light text-charcoal">
        {t('title')}
      </h1>
      <p className="text-[14px] leading-[1.8] text-ink-2">{t('body')}</p>
      <Link
        href="/atelier"
        className="mt-1 rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
      >
        {t('backToAtelier')}
      </Link>
    </div>
  );
}
