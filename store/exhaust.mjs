// Click every visible button and link on every screen, for each kind of member, and record
// anything that breaks: uncaught errors, console errors, failed requests, dialogs, blank screens.
// Usage: npx expo export --platform web && node store/exhaust.mjs [phone|ipad|all]
import { installMock } from './mock-backend.mjs';
import { playwright, serveDist, wait } from './lib.mjs';

const PORT = Number(process.env.PORT ?? 8171);
const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();
const mode = process.argv[2] ?? 'phone';

const ROUTES = ['/', '/farm/f1', '/farm/f2', '/events', '/resources', '/community', '/messages', '/notifications', '/alerts', '/settings', '/about',
  '/inquiry/f1', '/thread/c1', '/my-farm', '/review', '/impact', '/compose-broadcast', '/post-event', '/new-post', '/surveys', '/survey-builder',
  '/checkins', '/send-checkin', '/sign-in', '/survey/s1', '/checkin/k1', '/survey-results/s1'];

const PERSONAS = [
  { name: 'signed-out', opts: { signedIn: false } },
  { name: 'neighbor', opts: { role: 'neighbor', survey: true, checkin: true } },
  { name: 'grower', opts: { role: 'grower', survey: true, checkin: true } },
  { name: 'staff', opts: { role: 'admin', survey: true, checkin: true } },
];
const VIEWPORTS = {
  phone: [{ name: 'phone', viewport: { width: 390, height: 844 } }],
  ipad: [{ name: 'ipad', viewport: { width: 1024, height: 1366 } }],
  all: [{ name: 'phone', viewport: { width: 390, height: 844 } }, { name: 'ipad', viewport: { width: 1024, height: 1366 } }],
}[mode];

const problems = [];
let clicks = 0;
const SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="link"], [role="menuitem"]';

async function newPage(persona, vp, route) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: true });
  await installMock(ctx, persona.opts);
  // Anything that is not this app or the mock backend is refused, so no click reaches the internet.
  await ctx.route((url) => !url.toString().startsWith(`http://localhost:${PORT}`) && !url.toString().startsWith('http://localhost:54321'), (r) => r.abort());
  const page = await ctx.newPage();
  const log = { errors: [], console: [], failed: [], dialogs: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  // The mock has no realtime socket, no translate function and no logout: those are known gaps, not app bugs.
  page.on('console', (m) => { if (m.type() === 'error' && !/realtime\/v1\/websocket/.test(m.text())) log.console.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.url().includes('localhost:54321') && r.status() >= 400 && !/functions\/v1\/translate|auth\/v1\/logout/.test(r.url())) log.failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  page.on('dialog', async (d) => { log.dialogs.push(d.message().slice(0, 120)); await d.dismiss(); });
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load' });
  await wait(1800);
  return { ctx, page, log };
}

const blank = (text) => text.trim().length < 20 || /Unmatched Route|Something went wrong|Unexpected error|Application error/i.test(text);

const only = process.argv[3];
for (const vp of VIEWPORTS) for (const persona of PERSONAS.filter((p) => !only || p.name === only)) for (const route of ROUTES) {
  // Survey and check-in pages only make sense for members; still run them for every persona.
  const first = await newPage(persona, vp.viewport, route);
  const text = await first.page.evaluate(() => document.body.innerText);
  if (blank(text) && !/sign in/i.test(text)) problems.push({ where: `${vp.name} ${persona.name} ${route}`, what: 'screen looks blank or crashed', text: text.slice(0, 120) });
  const items = await first.page.$$eval(SELECTOR, (els) => els
    .filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; })
    .map((el) => ({ label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('href') || '').replace(/\s+/g, ' ').trim().slice(0, 60), href: el.getAttribute('href') || '' })));
  await first.ctx.close();

  for (let i = 0; i < items.length; i++) {
    const { label, href } = items[i];
    if (/^https?:|^mailto:|^tel:/.test(href)) continue; // external links are checked by URL shape elsewhere, never clicked here
    const { ctx, page, log } = await newPage(persona, vp.viewport, route);
    const before = page.url();
    try {
      const el = page.locator(SELECTOR).nth(i);
      await el.click({ timeout: 2500, trial: false });
      clicks++;
      await wait(900);
      // Something may have opened a sheet or a second step; that is fine. Only breakage is reported.
      const after = await page.evaluate(() => document.body.innerText);
      if (blank(after) && !/sign in/i.test(after)) problems.push({ where: `${vp.name} ${persona.name} ${route} → "${label}"`, what: 'blank or crashed after click', text: after.slice(0, 120) });
    } catch (e) {
      if (!/intercepts pointer|not visible|outside of the viewport|Timeout/.test(e.message)) problems.push({ where: `${vp.name} ${persona.name} ${route} → "${label}"`, what: 'click failed', text: e.message.split('\n')[0].slice(0, 160) });
    }
    if (log.errors.length) problems.push({ where: `${vp.name} ${persona.name} ${route} → "${label}"`, what: 'uncaught error', text: log.errors.join(' | ').slice(0, 200) });
    if (log.failed.length) problems.push({ where: `${vp.name} ${persona.name} ${route} → "${label}"`, what: 'failed request', text: log.failed.join(', ').slice(0, 200) });
    if (log.console.length) problems.push({ where: `${vp.name} ${persona.name} ${route} → "${label}"`, what: 'console error', text: log.console.join(' | ').slice(0, 200) });
    await ctx.close();
  }
  console.log(`${vp.name} ${persona.name} ${route}: ${items.length} controls checked`);
}

await browser.close();
server.close();
console.log(`\nclicks: ${clicks}, problems: ${problems.length}`);
for (const p of problems) console.log(`PROBLEM ${p.where} | ${p.what} | ${p.text}`);
process.exitCode = problems.length ? 1 : 0;
