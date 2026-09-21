import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Renders the questionnaires for Nour and Sophie to PDF — Arabic and French.
 *
 * Through Chrome rather than a PDF library, because Arabic needs real shaping: the letters join,
 * change form by position, and lay out right-to-left. Chrome does that correctly and a generic
 * PDF writer does not — the same limitation that stopped the Open Graph card from carrying
 * Arabic, where Satori's shaper refused the substitution table outright. Once Chrome is doing the
 * Arabic there is no reason to render the French any other way, and one renderer means the two
 * files cannot drift apart in layout.
 *
 * Fonts are inlined as base64 rather than linked, so each file is self-contained and renders
 * identically on a phone that has never heard of Noto Kufi or Cormorant Garamond.
 *
 *   node scripts/questions-pdf.mjs          both locales
 *   node scripts/questions-pdf.mjs fr       one locale
 */

const LOCALES = {
  ar: {
    source: 'docs/questions-sophie.ar.html',
    out: 'docs/questions-sophie.ar.pdf',
    dir: 'rtl',
    title: 'The Sisters N&amp;S — أسئلة قبل الإطلاق',
    // __FONT_BASE64__ predates the French file; kept as-is so the Arabic source needs no edit.
    fonts: { __FONT_BASE64__: 'src/fonts/NotoKufiArabic-arabic.woff2' },
    /* Noto Kufi alone is ~120 KB before subsetting. */
    floor: 60_000,
  },
  fr: {
    source: 'docs/questions-sophie.fr.html',
    out: 'docs/questions-sophie.fr.pdf',
    dir: 'ltr',
    title: 'The Sisters N&amp;S — Questions avant lancement',
    fonts: {
      __FONT_CORMORANT__: 'src/fonts/CormorantGaramond-latin.woff2',
      __FONT_JOST__: 'src/fonts/Jost-latin.woff2',
    },
    /* Two Latin faces, subset to the glyphs actually used — far lighter than the Arabic. */
    floor: 25_000,
  },
};

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = requested.length ? requested : Object.keys(LOCALES);

for (const name of targets) {
  if (!LOCALES[name]) {
    console.error(`Unknown locale "${name}". Known: ${Object.keys(LOCALES).join(', ')}`);
    process.exit(1);
  }
}

const browser = await chromium.launch();
let failed = false;

for (const name of targets) {
  const locale = LOCALES[name];
  const out = resolve(locale.out);

  let html = readFileSync(resolve(locale.source), 'utf8');
  for (const [placeholder, fontPath] of Object.entries(locale.fonts)) {
    if (!html.includes(placeholder)) {
      console.error(`FAIL [${name}]: ${locale.source} has no ${placeholder} to substitute.`);
      failed = true;
      continue;
    }
    html = html.replaceAll(placeholder, readFileSync(resolve(fontPath)).toString('base64'));
  }

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });

  // The embedded face must be ready before layout is measured, or lines break at fallback metrics.
  await page.evaluate(() => document.fonts.ready.catch(() => {}));

  /*
   * Assert the faces actually loaded, rather than inferring it from the file size.
   *
   * The size floor below used to be the only check, and it did not work. This script previously
   * used `.replace()`, which substitutes the FIRST match only — and the first `__FONT_BASE64__`
   * in the Arabic source is the one inside the HTML comment, not the one in `@font-face`. The
   * stylesheet kept the literal placeholder, the face failed to decode, Chrome silently fell back
   * to Segoe UI, and the resulting PDF still weighed ~149 KB: comfortably over the 60 KB floor.
   * Every Arabic copy produced that way is set in the wrong typeface.
   *
   * A file-size heuristic cannot see that. document.fonts can.
   */
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
  );
  const broken = faces.filter((f) => f.status !== 'loaded');
  if (!faces.length || broken.length) {
    console.error(
      `FAIL [${name}]: font did not load — ` +
        (faces.length
          ? broken.map((f) => `${f.family}=${f.status}`).join(', ')
          : 'no @font-face reached the document'),
    );
    failed = true;
  }

  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;font-size:8pt;color:#a08d82;padding:0 16mm;
                  font-family:'Segoe UI',Tahoma,sans-serif;display:flex;
                  justify-content:space-between;direction:${locale.dir}">
        <span>${locale.title}</span>
        <span class="pageNumber"></span>
      </div>`,
    margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
  });

  await page.close();

  const bytes = readFileSync(out).byteLength;
  console.log(`${locale.out}  ${(bytes / 1024).toFixed(0)} KB`);

  // A PDF that renders no glyphs still weighs something; the embedded font is most of the file.
  if (bytes < locale.floor) {
    console.error(`FAIL [${name}]: suspiciously small — the font probably did not embed.`);
    failed = true;
  }
}

await browser.close();

if (failed) process.exit(1);
