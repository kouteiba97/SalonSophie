'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ArrowRight, Close, Menu } from '@/components/common/icons';
import { Link } from '@/i18n/navigation';

/**
 * Navigation for every screen narrower than `lg`.
 *
 * The header's nav was `hidden … lg:flex` with nothing behind it, so below 1024px the site had
 * no navigation at all — no menu, no hamburger, nothing. A phone could only scroll: there was no
 * way to reach the tariff without travelling through the whole page, and no way back up except
 * flicking. The brief's primary client is a woman arriving from an Instagram reel on a mid-range
 * Android, which is to say almost every visitor was getting the version with no way around.
 *
 * Built on the same Dialog primitive as the booking modal rather than a bespoke panel, so the
 * focus trap, Escape, scroll lock, `aria-modal` and focus restore all come for free and behave
 * identically to the one other overlay on the site (§5.4 item 12).
 *
 * Links close the sheet on click. They are in-page anchors, so without that the panel would stay
 * open over the section it had just scrolled to.
 */
export function MobileNav({ items }: { items: readonly { key: string; hash: string }[] }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={t('openMenu')}
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-charcoal transition-colors hover:bg-blush/50 lg:hidden"
      >
        <Menu className="size-5" />
      </DialogTrigger>

      <DialogContent className="sm:w-[min(420px,calc(100vw-32px))]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <DialogTitle className="font-display text-[18px] font-light text-charcoal">
            {t('menu')}
          </DialogTitle>
          <DialogClose
            aria-label={t('closeMenu')}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-blush/50"
          >
            <Close className="size-5" />
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">{t('mainNavigation')}</DialogDescription>

        <nav aria-label={t('mainNavigation')} className="flex flex-col px-3 py-2">
          {items.map(({ key, hash }) => (
            <Link
              key={key}
              href={`/${hash}`}
              onClick={() => setOpen(false)}
              /*
               * min-h-14 rather than the 44px floor. These are the only navigation on the device
               * where navigation matters most, and a full-width row with room around the label is
               * easier to hit one-handed than a target sized exactly to the minimum.
               */
              className="flex min-h-14 items-center justify-between rounded-[14px] px-4 text-[16px] text-ink-2 transition-colors hover:bg-blush/40 hover:text-rose-deep"
            >
              {t(key)}
              <ArrowRight className="size-4 text-muted rtl:-scale-x-100" />
            </Link>
          ))}
        </nav>

        {/*
          The language switcher lives here on small screens as well as in the header. Arabic is a
          first-class locale, not a setting to go hunting for, so it stays reachable from the one
          surface a phone user will actually open.
        */}
        <div className="flex items-center justify-center border-t border-line px-6 py-4">
          <LanguageSwitcher />
        </div>
      </DialogContent>
    </Dialog>
  );
}
