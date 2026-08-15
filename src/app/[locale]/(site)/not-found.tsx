import { useTranslations } from 'next-intl';
import { WhatsApp } from '@/components/common/icons';
import { whatsappLink } from '@/data/business';
import { Link } from '@/i18n/navigation';

/** 404 in the brand's voice (BUILD_BRIEF §5.7 item 26) — the design had none. */
export default function NotFound() {
  const t = useTranslations('errors.notFound');
  const contact = useTranslations('contact');

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-5 px-6 py-[clamp(72px,12vw,160px)] text-center">
      <span aria-hidden className="font-script text-[54px] leading-none text-champagne">
        N&amp;S
      </span>

      <h1 className="font-display text-[clamp(30px,4.6vw,46px)] font-light leading-tight text-charcoal">
        {t('title')}
      </h1>

      <p className="max-w-[46ch] text-[15px] leading-[1.8] text-ink-2">{t('body')}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-rose-deep px-7 py-3.5 text-[14px] text-white transition-colors hover:bg-rose-dark"
        >
          {t('home')}
        </Link>
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
