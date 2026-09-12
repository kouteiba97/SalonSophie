import { chromium, devices } from '@playwright/test';

/**
 * Non-negotiable #4, measured rather than assumed: LCP < 2.5s on simulated 4G, CLS < 0.1.
 *
 * Throttled through CDP to the profile the brief describes — a mid-range Android on Algerian 4G —
 * rather than measured on localhost at full speed, which would only prove the server is nearby.
 *
 *   npm run build && npm start
 *   npm run perf -- http://localhost:3000/ar
 *
 * Exits non-zero when a budget is missed, so it can gate a deploy. Takes the median of three
 * loads after warming the route: measured once, cold, the same build produced 2136ms and 2940ms,
 * and a single sample would have "proved" whichever answer was wanted.
 *
 * Test every locale. Arabic is not French with different words — it loads a different face, and
 * it is the only locale that has ever missed this budget.
 */
const URL_ = process.argv[2] ?? 'http://localhost:3000/fr';

// "Regular 4G": ~4 Mbit down, 3 Mbit up, 70ms RTT. Deliberately not "Fast 4G".
const NET = { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 70 };
const CPU_SLOWDOWN = 4;

const RUNS = Number(process.env.PERF_RUNS ?? 3);

// Warm the server first. The first request to a route in `next start` pays for work that no real
// visitor pays for twice, and measuring it once produced a 750ms spread across identical builds.
for (let i = 0; i < 3; i++) await fetch(URL_).then((r) => r.text()).catch(() => {});

const browser = await chromium.launch();
const samples = [];
for (let run = 0; run < RUNS; run++) {
const context = await browser.newContext({ ...devices['Pixel 5'] });
const page = await context.newPage();

const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', NET);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, lcpTag: null, lcpText: '', lcpUrl: null };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__perf.lcp = e.startTime;
      window.__perf.lcpTag = e.element?.tagName ?? null;
      window.__perf.lcpText = (e.element?.textContent ?? '').trim().slice(0, 60);
      window.__perf.lcpUrl = e.url || null;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
});

const bytes = { html: 0, js: 0, css: 0, font: 0, img: 0, other: 0 };
page.on('response', async (r) => {
  const len = Number(r.headers()['content-length'] ?? 0);
  const u = r.url();
  const k = u.endsWith('.js') ? 'js' : u.endsWith('.css') ? 'css'
    : /\.woff2?($|\?)/.test(u) ? 'font'
    : /\.(png|jpe?g|webp|avif|svg)($|\?)/.test(u) ? 'img'
    : r.request().resourceType() === 'document' ? 'html' : 'other';
  bytes[k] += len;
});

await page.goto(URL_, { waitUntil: 'load', timeout: 120_000 });
await page.waitForTimeout(6000);
// Settle LCP: it is only final once the page stops changing.
await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));

const perf = await page.evaluate(() => window.__perf);
const weight = await page.evaluate(() => {
  const res = performance.getEntriesByType('resource');
  const nav0 = performance.getEntriesByType('navigation')[0];
  const sum = (f) => res.filter(f).reduce((a, r) => a + (r.encodedBodySize || 0), 0);
  const kb = (n) => +(n / 1024).toFixed(1);
  return {
    html: kb(nav0.encodedBodySize),
    js: kb(sum((r) => r.name.endsWith('.js'))),
    css: kb(sum((r) => r.name.endsWith('.css'))),
    font: kb(sum((r) => r.name.includes('.woff'))),
    img: kb(sum((r) => ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg'].some((e) => r.name.includes(e)))),
    requests: res.length + 1,
  };
});

const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0];
  return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) };
});

  samples.push({ lcp: perf.lcp, cls: perf.cls, tag: perf.lcpTag, text: perf.lcpText, nav, weight });
  await context.close();
}

const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const lcpAll = samples.map((s0) => Math.round(s0.lcp));
const clsAll = samples.map((s0) => +s0.cls.toFixed(4));
const perfMedianLcp = median(lcpAll);
const perfMedianCls = median(clsAll);
const last = samples[samples.length - 1];
const weightOut = last.weight;
const navOut = last.nav;

console.log(JSON.stringify({
  url: URL_,
  throttle: 'Regular 4G (4 Mbit, 70ms RTT), CPU x4, Pixel 5',
  runs: RUNS,
  lcp_ms_median: perfMedianLcp,
  lcp_ms_all: lcpAll,
  lcp_element: last.tag,
  lcp_text: last.text,

  lcp_budget_ms: 2500,
  lcp_pass: perfMedianLcp > 0 && perfMedianLcp < 2500,
  cls_median: perfMedianCls,
  cls_all: clsAll,
  cls_budget: 0.1,
  cls_pass: perfMedianCls < 0.1,
  ttfb_ms: navOut.ttfb,
  dom_content_loaded_ms: navOut.dcl,
  load_ms: navOut.load,
  kb: weightOut,
}, null, 1));

await browser.close();

if (!(perfMedianLcp > 0 && perfMedianLcp < 2500) || !(perfMedianCls < 0.1)) {
  console.error('FAIL: non-negotiable #4 — LCP < 2500ms and CLS < 0.1 on simulated 4G.');
  process.exit(1);
}
