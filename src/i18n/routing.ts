import { defineRouting } from 'next-intl/routing';

/**
 * Locale is a URL segment, never client-side state (BUILD_BRIEF §5.6 item 23).
 *
 * The design switched language with `this.setState({lang})`, so all three languages shared one
 * URL and none of them were indexable. `localePrefix: 'always'` gives every locale its own
 * addressable path — /fr, /ar, /en — which is what makes hreflang alternates meaningful.
 */
export const routing = defineRouting({
  locales: ['fr', 'ar', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = {
  fr: 'ltr',
  ar: 'rtl',
  en: 'ltr',
};

/** BCP-47 tags for Intl formatting (§8). */
export const INTL_TAG: Record<Locale, string> = {
  fr: 'fr-FR',
  ar: 'ar-DZ',
  en: 'en-GB',
};

/** Labels for the language switcher, each written in its own language. */
export const LOCALE_LABEL: Record<Locale, string> = {
  fr: 'FR',
  ar: 'ع',
  en: 'EN',
};
