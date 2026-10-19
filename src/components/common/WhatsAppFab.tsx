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
      /*
        Back on the bottom line, where a floating action button belongs.

        It was briefly moved to `bottom-24` to clear the sticky CTA, and that traded one overlap
        for a worse one: a row up, the float sits over the hero's booking card and covered the
        calendar's next-week arrow. A fixed element parked in the middle of the viewport will
        always land on something — the bottom corner is the only position that is reliably empty.

        The collision it was dodging is fixed where it belongs, on the CTA: `StickyCta` now uses
        the short label on a phone, so the two share the bottom line with room between them.
      */
      className="fixed bottom-5 end-5 z-50 inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-[13px] font-normal text-charcoal shadow-[0_10px_28px_-10px_rgba(37,211,102,.9)] transition-transform duration-200 hover:scale-[1.03]"
    >
      <WhatsApp className="size-5" />
      <span className="hidden sm:inline">{t('whatsapp')}</span>
    </a>
  );
}
