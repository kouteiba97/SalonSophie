import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Renders docs/questions-sophie.ar.html to a PDF for Nour and Sophie.
 *
 * Through Chrome rather than a PDF library, because Arabic needs real shaping: the letters join,
 * change form by position, and lay out right-to-left. Chrome does that correctly and a generic
 * PDF writer does not — the same limitation that stopped the Open Graph card from carrying
 * Arabic, where Satori's shaper refused the substitution table outright.
 *
 * The font is inlined as base64 rather than linked, so the file is self-contained and the Arabic
 * renders identically on a phone that has never heard of Noto Kufi.
 *
 *   node scripts/questions-pdf.mjs
 */

const SOURCE = resolve('docs/questions-sophie.ar.html');
const FONT = resolve('src/fonts/NotoKufiArabic-arabic.woff2');
const OUT = resolve(process.argv[2] ?? 'docs/questions-sophie.ar.pdf');

/*
 * replaceAll, not replace.
 *
 * `__FONT_BASE64__` appears twice in the source: once in the HTML comment explaining the
 * substitution, and once in `@font-face`. The comment comes first, so `.replace()` spent the
 * substitution there and left the stylesheet holding the literal placeholder. The face failed to
 * decode, Chrome fell back to Segoe UI — which has Arabic glyphs and shapes them, so the PDF
 * still read correctly and simply was not in Noto Kufi. Every Arabic copy produced before this
 * is set in the wrong typeface.
 */
const html = readFileSync(SOURCE, 'utf8').replaceAll(
  '__FONT_BASE64__',
  readFileSync(FONT).toString('base64'),
);

const browser = await chromium.launch();
const page = await browser.newPage();

// A base URL so relative assets resolve, even though everything is inlined today.
await page.setContent(html, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });

// The embedded face must be ready before layout is measured, or lines break at fallback metrics.
await page.evaluate(() => document.fonts.ready.catch(() => {}));

/*
 * Assert the face loaded, rather than inferring it from the file size.
 *
 * The size floor below was the only check, and it could not see the bug above: a fallback-font
 * render still weighed ~149 KB, comfortably over the 60 KB threshold. The floor stays as a
 * cheap backstop, but this is the check that actually holds.
 */
const faces = await page.evaluate(() =>
  [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
);
const broken = faces.filter((f) => f.status !== 'loaded');
if (!faces.length || broken.length) {
  console.error(
    'FAIL: font did not load — ' +
      (faces.length
        ? broken.map((f) => `${f.family}=${f.status}`).join(', ')
        : 'no @font-face reached the document'),
  );
  await browser.close();
  process.exit(1);
}

await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%;font-size:8pt;color:#a08d82;padding:0 16mm;
                font-family:'Segoe UI',Tahoma,sans-serif;display:flex;
                justify-content:space-between;direction:rtl">
      <span>The Sisters N&amp;S — أسئلة قبل الإطلاق</span>
      <span class="pageNumber"></span>
    </div>`,
  margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
});

await browser.close();

const bytes = readFileSync(OUT).byteLength;
console.log(`${OUT}  ${(bytes / 1024).toFixed(0)} KB`);

// A PDF that renders no glyphs still weighs something; the embedded font alone is ~120 KB.
if (bytes < 60_000) {
  console.error('FAIL: suspiciously small — the font probably did not embed.');
  process.exit(1);
}

// Keep the source path in the file so whoever finds the PDF can find what generated it.
void writeFileSync;
void pathToFileURL;
