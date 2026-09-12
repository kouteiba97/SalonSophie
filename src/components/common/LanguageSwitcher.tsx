'use client';

import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { LOCALE_LABEL, routing, type Locale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Switches locale by navigating, not by setting state (BUILD_BRIEF §5.6 item 23).
 *
 * The design's switcher called `setState({lang})`, so all three languages lived at one URL and
 * none of them could be indexed. Here each locale is a real path, the browser back button works,
 * and a client can send someone a link in the language they read.
 *
 * `tone` exists because this component sits on two very different backgrounds — cream in the
 * header, charcoal in the footer and the console sidebar — and an unselected pill has to stay
 * readable on both. There is no single colour that can: clearing 4.5:1 against cream caps a
 * colour's luminance at about 0.16, and clearing it against charcoal demands at least 0.29. The
 * first attempt at this fixed the header and quietly took the footer to 1.89:1.
 */
export function LanguageSwitcher({
  className,
  tone = 'light',
}: {
  className?: string;
  /** `light` for a cream background, `dark` for charcoal. */
  tone?: 'light' | 'dark';
}) {
  const t = useTranslations('nav');
  const active = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: Locale) => {
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- params carry the current route's dynamic segments verbatim
        { pathname, params },
        { locale: next },
      );
    });
  };

  return (
    <div
      className={cn('flex items-center gap-0.5 rounded-full p-0.5', className)}
      role="group"
      aria-label={t('language')}
    >
      {routing.locales.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={isActive}
            disabled={isPending}
            onClick={() => switchTo(locale)}
            className={cn(
              /*
                 Three tiny pills side by side is the worst shape for a thumb: miss FR and you get
                 Arabic. Sized to 40px on touch and left at the design's proportions on a pointer,
                 where the original 28px is deliberate and fine.
              */
              'inline-flex min-h-10 cursor-pointer items-center rounded-full px-[13px] text-[11px] tracking-[.1em] transition-colors duration-200 lg:min-h-0 lg:px-[11px] lg:py-[5px]',
              isActive
                ? 'bg-rose-deep text-white'
                : tone === 'dark'
                  ? 'text-muted-2 hover:text-white'
                  : 'text-ink-2 hover:text-rose-deep',
              isPending && 'opacity-60',
            )}
          >
            {LOCALE_LABEL[locale]}
          </button>
        );
      })}
    </div>
  );
}
