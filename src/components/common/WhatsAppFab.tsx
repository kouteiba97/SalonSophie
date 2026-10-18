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
        Sits a row above the sticky CTA on small screens, and back on the bottom line from `lg`
        where that CTA does not exist.

        Both were anchored to `bottom-5`, which collided at 375px in French and nowhere else:
        "Réserver mon rendez-vous" renders a 233px pill that reaches x=304, and the float starts
        at x=303. One pixel of overlap between two tap targets, so a thumb aiming at the end of
        the booking button opened WhatsApp instead. Arabic hid it — "احجزي موعدك" is 70px
        narrower and cleared the float by 34px — which is the kind of thing only ever found by
        measuring both locales rather than looking at one.

        Stacking rather than shrinking the CTA: narrowing it to fit would have to hold for
        whichever label is longest in any locale, and the next translation would quietly break it
        again.
      */
      className="fixed bottom-24 end-5 z-50 inline-flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3 text-[13px] font-normal text-charcoal shadow-[0_10px_28px_-10px_rgba(37,211,102,.9)] transition-transform duration-200 hover:scale-[1.03] lg:bottom-5"
    >
      <WhatsApp className="size-5" />
      <span className="hidden sm:inline">{t('whatsapp')}</span>
    </a>
  );
}
