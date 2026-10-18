import localFont from 'next/font/local';

/**
 * All four faces are self-hosted — no Google Fonts request is ever made (BUILD_BRIEF §4, §5.5).
 *
 * The woff2 files were extracted from the design bundle's `__bundler/manifest` block rather
 * than re-downloaded, so they are byte-identical to what the approved design rendered with.
 * Only the subsets we actually serve were kept: Latin covers French and English (including œ
 * at U+0152-0153), Arabic covers ar. Cyrillic, Vietnamese, math and symbol subsets were
 * dropped — they cost ~230 KB and serve no locale we ship.
 *
 * Cormorant Garamond, Jost and Noto Kufi Arabic are variable fonts (verified: `fvar` table
 * present), which is why the design's stylesheet pointed weights 300/400/500 at one file each.
 * Parisienne is static 400.
 *
 * `adjustFontFallback` is set on the three faces that carry body and heading text, and it is a
 * performance fix rather than a typographic one. No font is preloaded in the built HTML — they
 * are discovered only once the stylesheet parses — so on 4G the first paint is always the
 * fallback. With unadjusted metrics that fallback is a different size from the real face, the
 * swap reflows the text, and the reflow registers as a *new and larger* largest-contentful-paint
 * candidate: LCP was being recorded at the swap rather than at the paint.
 *
 * Measured on Arabic, which pays for the largest face: LCP 3236ms against a 2500ms budget, and
 * non-negotiable #4 was failing on the locale the brief says to test first. Matching the fallback
 * metrics makes the first paint the final size, so nothing larger arrives later.
 *
 * Parisienne is left alone deliberately: it renders exactly one emphasised word per headline, so
 * it is never the largest element, and a cursive face has no sane metric-compatible fallback.
 */

export const cormorant = localFont({
  src: [{ path: '../fonts/CormorantGaramond-latin.woff2', weight: '300 500', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

export const jost = localFont({
  src: [{ path: '../fonts/Jost-latin.woff2', weight: '200 500', style: 'normal' }],
  variable: '--font-body',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: 'Arial',
});

export const parisienne = localFont({
  src: [{ path: '../fonts/Parisienne-latin.woff2', weight: '400', style: 'normal' }],
  variable: '--font-script',
  display: 'swap',
  preload: true,
  fallback: ['cursive'],
  adjustFontFallback: false,
});

/**
 * Arabic is 121 KB — three times the Latin faces combined. `preload: false` keeps French and
 * English pages from paying for a font they never paint.
 *
 * `display: 'optional'`, not `'swap'`, and that is the CLS budget rather than a preference.
 *
 * With `swap` the face arrives around 1 470ms on throttled 4G, well after first paint, and the
 * Arabic headline re-wraps when it lands: measured at +56px on the headline and +83px on
 * everything beneath it, for a layout shift of 0.108 against a 0.1 budget — non-negotiable #4,
 * failing on the locale the brief says to test first.
 *
 * `adjustFontFallback: 'Arial'` cannot save it. It size-adjusts against Arial's metrics, and
 * Arial is not what renders Arabic on the target device — a mid-range Android reaches for its
 * own Noto Sans Arabic, whose metrics the adjustment knows nothing about. Multiply a small
 * mismatch by the 1.95 line-height Arabic carries and by a three-line headline and you get the
 * 56px.
 *
 * `optional` gives the font ~100ms to arrive. If it makes it, it paints; if not, this load keeps
 * the fallback and never swaps, so the shift cannot happen. The file still downloads and caches,
 * so the second page view and every later visit are in Noto Kufi.
 *
 * The cost is real and worth stating: a first-time Arabic visitor on a slow connection may read
 * one page in their system's Arabic face instead of ours. Against that, the alternative is the
 * page visibly jumping under their thumb as they start to read — and preloading instead would
 * put 121 KB on the French and English critical path to fix a problem neither of them has.
 */
export const notoKufi = localFont({
  src: [{ path: '../fonts/NotoKufiArabic-arabic.woff2', weight: '300 500', style: 'normal' }],
  variable: '--font-arabic',
  display: 'optional',
  preload: false,
  fallback: ['Segoe UI', 'Tahoma', 'sans-serif'],
  adjustFontFallback: 'Arial',
});

export const fontVariables = [
  cormorant.variable,
  jost.variable,
  parisienne.variable,
  notoKufi.variable,
].join(' ');
