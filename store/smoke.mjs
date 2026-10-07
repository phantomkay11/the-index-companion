// Web click-through of every screen, trying to break it.
// Usage: npx expo export --platform web && node store/smoke.mjs
// For each route, at phone and iPad sizes, it fails on: uncaught errors, console errors, a spinner still
// showing after 6 seconds, the page scrolling sideways, or the error boundary appearing.
import { installMock } from './mock-backend.mjs';
import { playwright, serveDist, wait } from './lib.mjs';

const PORT = 8160;
const DEVICES = {
  phone: { viewport: { width: 375, height: 740 }, isMobile: true },
  ipad: { viewport: { width: 1032, height: 1300 }, isMobile: false },
};
const admin = { role: 'admin' };
const CASES = [
  // Everyone
  ['/', {}], ['/messages', {}], ['/community', {}], ['/events', {}], ['/resources', {}],
  ['/farm/f1', {}], ['/farm/f2', {}], ['/inquiry/f1', {}], ['/thread/c1', {}], ['/notifications', {}],
  ['/settings', {}], ['/about', {}], ['/alerts', {}], ['/new-post', {}], ['/post-event', {}], ['/surveys', { survey: true }],
  ['/survey/s1', { survey: true }], ['/checkin/k1', { checkin: true }], ['/my-farm', { role: 'grower' }], ['/my-farm', {}],
  // Bad links
  ['/farm/does-not-exist', {}], ['/inquiry/does-not-exist', {}], ['/thread/nope', {}], ['/survey/abc', {}], ['/checkin/nope', {}],
  ['/survey-results/abc', admin], ['/no-such-page', {}],
  // Staff screens, as staff and as a member
  ['/survey-builder', admin], ['/survey-results/s1', { ...admin, survey: true }], ['/checkins', { ...admin, checkin: true }],
  ['/send-checkin', admin], ['/compose-broadcast', admin], ['/review', admin], ['/impact', admin],
  ['/survey-builder', {}], ['/checkins', {}], ['/review', {}], ['/impact', {}],
  // Signed out
  ['/', { signedIn: false }], ['/messages', { signedIn: false }], ['/farm/f1', { signedIn: false }], ['/settings', { signedIn: false }],
  ['/sign-in', { signedIn: false }], ['/thread/c1', { signedIn: false }],
  // Accessibility settings: largest text, high contrast, other languages
  ['/', { settings: { textScale: 1.6 } }], ['/farm/f1', { settings: { textScale: 1.6, highContrast: true } }],
  ['/events', { settings: { textScale: 1.6 } }], ['/settings', { settings: { textScale: 1.6 } }],
  ['/', { settings: { language: 'ht' } }], ['/resources', { settings: { language: 'es' } }], ['/messages', { settings: { language: 'fr' } }],
  // The server is down: every screen should say so and offer a retry, never spin forever
  ['/', { fail: true }], ['/farm/f1', { fail: true }], ['/events', { fail: true }], ['/resources', { fail: true }], ['/community', { fail: true }],
  ['/messages', { fail: true }], ['/notifications', { fail: true }], ['/survey/s1', { fail: true }], ['/inquiry/f1', { fail: true }],
  ['/thread/c1', { fail: true }], ['/survey-results/s1', { ...admin, fail: true }],
];
// Console noise that isn't a bug: the mock has no realtime server, and failed requests in the "server down" runs.
const IGNORE = [/realtime|websocket/i, /Failed to load resource/i, /status of 500/i, /status of 404/i];

const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();
const problems = [];
let runs = 0;
const jobs = [];
for (const scheme of ['light', 'dark'])
  for (const [device, d] of Object.entries(DEVICES))
    for (const [route, opts] of CASES) if (!(scheme === 'dark' && (opts.fail || opts.settings?.language))) jobs.push({ scheme, device, d, route, opts });
const only = process.argv[2];
const todo = only ? jobs.filter((j) => j.route.includes(only)) : jobs;

async function run({ scheme, device, d, route, opts }) {
  runs++;
  const label = `${scheme} ${device} ${route} ${JSON.stringify(opts)}`;
  const ctx = await browser.newContext({ viewport: d.viewport, isMobile: d.isMobile, hasTouch: true, colorScheme: scheme });
  await installMock(ctx, opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`uncaught: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errs.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('dialog', (dlg) => { errs.push(`unexpected dialog: ${dlg.message().slice(0, 80)}`); dlg.dismiss(); });
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load' }).catch((e) => errs.push(`load: ${e.message}`));
  await wait(6000);
  const check = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const spinners = [...document.querySelectorAll('[role="progressbar"]')].filter(visible).length;
    const text = document.body.innerText;
    // Anything wider than the window that the page itself doesn't scroll (clipped text, overflowing rows).
    let widest = 0;
    for (const el of document.querySelectorAll('div, span')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'fixed') {
        let p = el.parentElement, inScroller = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { inScroller = true; break; } p = p.parentElement; }
        if (!inScroller) widest = Math.max(widest, r.right);
      }
    }
    return {
      spinners,
      sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
      widest: Math.round(widest),
      boundary: /Something went wrong|Unmatched Route|This screen doesn't exist/i.test(text) ? text.slice(0, 120) : null,
      empty: text.trim().length < 20,
    };
  });
  const width = d.viewport.width;
  if (check.spinners) errs.push(`still loading after 6s (${check.spinners} spinner)`);
  if (check.sideways) errs.push('page scrolls sideways');
  if (check.widest > width + 2) errs.push(`content runs off screen (${check.widest}px > ${width}px)`);
  if (check.empty) errs.push('blank screen');
  if (check.boundary && route !== '/no-such-page') errs.push(`error screen: ${check.boundary}`);
  if (errs.length) {
    problems.push({ label, errs: [...new Set(errs)] });
    console.log('FAIL', label, '\n   ', [...new Set(errs)].join('\n    '));
  } else console.log('ok  ', label);
  await ctx.close();
}

let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < todo.length) await run(todo[next++]);
}));
await browser.close();
server.close();
console.log(`\n${runs} screen loads, ${problems.length} with problems`);
process.exitCode = problems.length ? 1 : 0;
