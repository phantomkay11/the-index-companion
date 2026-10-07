// Interaction tests on the web build: double taps, bad input, confirmations and error messages.
// Usage: npx expo export --platform web && node store/interact.mjs
import { installMock } from './mock-backend.mjs';
import { playwright, serveDist, wait } from './lib.mjs';

const PORT = 8170;
const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : detail);
  if (!ok) failed++;
};

async function open(path, opts = {}, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  await installMock(ctx, opts);
  const page = await ctx.newPage();
  const writes = [];
  const dialogs = [];
  const errors = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/') && r.method() !== 'GET' && r.method() !== 'HEAD') writes.push(`${r.method()} ${new URL(r.url()).pathname.replace('/rest/v1/', '')}`); });
  page.on('dialog', async (d) => { dialogs.push(d.message()); await (opts.dialog === 'dismiss' ? d.dismiss() : d.accept()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}${path}`);
  await wait(3500);
  return { ctx, page, writes, dialogs, errors };
}

// 1. Sending a message: a double tap sends one message, and it shows without waiting for realtime.
{
  const { ctx, page, writes, errors } = await open('/thread/c1');
  await page.getByPlaceholder(/message/i).first().fill('Double tap test');
  const send = page.getByRole('button', { name: /send/i }).last();
  // Three taps inside one frame, before React can disable the button.
  await send.evaluate((el) => { el.click(); el.click(); el.click(); });
  await wait(1200);
  check('double-tapping send posts one message', writes.filter((w) => w === 'POST messages').length === 1, JSON.stringify(writes));
  check('thread screen has no uncaught errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 2. RSVP: a double tap sends one request.
{
  const { ctx, page, writes } = await open('/events');
  const rsvp = page.getByRole('button', { name: /^RSVP$/i }).first();
  if (await rsvp.count()) {
    await rsvp.evaluate((el) => { el.click(); el.click(); });
    await wait(1200);
    check('double-tapping RSVP sends one request', writes.filter((w) => w.endsWith('event_rsvps')).length === 1, JSON.stringify(writes));
  } else check('an RSVP button is on the events screen', false);
  await ctx.close();
}

// 3. Inquiry: impossible or past dates can't be sent.
{
  const { ctx, page } = await open('/inquiry/f1');
  const sendBtn = page.getByRole('button', { name: 'Send inquiry' });
  await page.getByLabel(/amount/i).fill('2 jars');
  const date = page.getByLabel(/When/i);
  for (const [v, expectOk] of [['2026-02-31', false], ['2020-01-01', false], ['tomorrow', false], [new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), true]]) {
    await date.fill(v);
    await wait(200);
    const disabled = await sendBtn.getAttribute('aria-disabled');
    check(`inquiry date "${v}" ${expectOk ? 'accepted' : 'refused'}`, (disabled === 'true') === !expectOk, `aria-disabled=${disabled}`);
  }
  await ctx.close();
}

// 4. Withdrawing survey answers asks first; cancelling keeps them.
{
  const SURVEY_MINE = true;
  const { ctx, page, writes, dialogs } = await open('/survey/s1', { survey: true, surveyAnswered: SURVEY_MINE, dialog: 'dismiss' });
  const w = page.getByRole('button', { name: /Withdraw my answers/i });
  if (await w.count()) {
    await w.click();
    await wait(800);
    check('withdraw asks for confirmation (web dialog)', dialogs.some((d) => /Withdraw your answers/.test(d)), JSON.stringify(dialogs));
    check('cancelling the confirmation deletes nothing', !writes.some((x) => x.startsWith('DELETE')), JSON.stringify(writes));
  } else check('withdraw button shown for an answered survey', false, 'mock has no answer');
  await ctx.close();
}

// 5. Errors are shown on the web (react-native-web's Alert does nothing by default).
{
  const { ctx, page, dialogs } = await open('/farm/f1');
  // Make every write fail from here on.
  await ctx.route('http://localhost:54321/rest/v1/**', (route) =>
    route.request().method() === 'GET' ? route.fallback() : route.fulfill({ status: 500, json: { message: 'Server unavailable (test)' } }));
  const follow = page.getByRole('button', { name: /^Follow/i }).first();
  if (await follow.count()) {
    await follow.click();
    await wait(1200);
    check('a failed save shows a message on the web', dialogs.some((d) => /Could not update|Server unavailable/.test(d)), JSON.stringify(dialogs));
  } else check('follow button on farm profile', false);
  await ctx.close();
}

// 6. Links: a javascript: link from the database is refused, not opened.
{
  const { ctx, page, dialogs } = await open('/farm/f1', { evilLinks: true });
  const site = page.getByRole('link', { name: /website|\.com|\.org/i }).first();
  if (await site.count()) {
    const popup = ctx.waitForEvent('page', { timeout: 1500 }).catch(() => null);
    await site.click();
    await wait(800);
    check('javascript: website link is refused', !(await popup) && dialogs.some((d) => /safe/.test(d)), JSON.stringify(dialogs));
  } else check('farm website link present (mock evilLinks)', false);
  await ctx.close();
}

// 7. Settings: a number that isn't confirmed says so; bad numbers are refused.
{
  const { ctx, page, dialogs, writes } = await open('/settings', { unverifiedPhone: true });
  check('unconfirmed number is flagged', (await page.getByText(/Not confirmed yet/).count()) > 0);
  const field = page.getByLabel('Mobile number');
  await field.fill('+12');
  await page.getByRole('button', { name: /Text me a code/ }).click();
  await wait(600);
  check('a too-short number is refused before saving', dialogs.some((d) => /Check the number/.test(d)) && !writes.some((w) => w.includes('contact_prefs')), JSON.stringify({ dialogs, writes }));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} interaction checks FAILED` : '\nALL INTERACTION CHECKS PASSED');
process.exitCode = failed ? 1 : 0;
