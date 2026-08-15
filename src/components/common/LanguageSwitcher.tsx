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
 */
export function LanguageSwitcher({ className }: { className?: string }) {
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
              'cursor-pointer rounded-full px-[11px] py-[5px] text-[11px] tracking-[.1em] transition-colors duration-200',
              isActive ? 'bg-rose-deep text-white' : 'text-taupe hover:text-rose-deep',
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
