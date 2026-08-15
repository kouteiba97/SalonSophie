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
 */

export const cormorant = localFont({
  src: [{ path: '../fonts/CormorantGaramond-latin.woff2', weight: '300 500', style: 'normal' }],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: false,
});

export const jost = localFont({
  src: [{ path: '../fonts/Jost-latin.woff2', weight: '200 500', style: 'normal' }],
  variable: '--font-body',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
  adjustFontFallback: false,
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
 * English pages from paying for a font they never paint; on `/ar` the face is discovered as
 * soon as the stylesheet applies it, and `display: swap` renders fallback text meanwhile.
 */
export const notoKufi = localFont({
  src: [{ path: '../fonts/NotoKufiArabic-arabic.woff2', weight: '300 500', style: 'normal' }],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
  fallback: ['Segoe UI', 'Tahoma', 'sans-serif'],
  adjustFontFallback: false,
});

export const fontVariables = [
  cormorant.variable,
  jost.variable,
  parisienne.variable,
  notoKufi.variable,
].join(' ');
