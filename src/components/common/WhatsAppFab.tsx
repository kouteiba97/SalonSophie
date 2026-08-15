import { useTranslations } from 'next-intl';
import { BUSINESS, whatsappLink } from '@/data/business';
import { WhatsApp } from './icons';

/**
 * WhatsApp float (BUILD_BRIEF §5.7 item 27). In Algeria this is the real communication channel,
 * so it stays reachable on every screen and never scrolls away.
 *
 * Points at the salon's one real line — 0553366712 — not the design's placeholder.
 */
export function WhatsAppFab() {
  const t = useTranslations('sticky');
  const contact = useTranslations('contact');

  return (
    <a
      href={whatsappLink(contact('whatsappMessage'))}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${t('whatsapp')} — ${BUSINESS.phoneInternational}`}
      className="fixed bottom-5 end-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-[13px] font-normal text-white shadow-[0_10px_28px_-10px_rgba(37,211,102,.9)] transition-transform duration-200 hover:scale-[1.03]"
    >
      <WhatsApp className="size-5" />
      <span className="hidden sm:inline">{t('whatsapp')}</span>
    </a>
  );
}
