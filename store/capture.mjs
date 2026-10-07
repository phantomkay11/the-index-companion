// Raw app captures for the App Store screenshots, at iPhone 6.9" and iPad 13" sizes.
// Usage: npx expo export --platform web && node store/capture.mjs
import fs from 'node:fs';
import path from 'node:path';

import { installMock } from './mock-backend.mjs';
import { out, playwright, scrollMain, serveDist, wait } from './lib.mjs';

const PORT = 8150;
// Logical sizes (points) minus the status bar and home indicator, which the composer draws.
const DEVICES = {
  iphone: { viewport: { width: 430, height: 932 - 54 - 34 }, scale: 3 },
  ipad: { viewport: { width: 1032, height: 1376 - 24 - 20 }, scale: 2 },
};

export const SHOTS = [
  { name: 'discover', path: '/' },
  { name: 'farm', path: '/farm/f1' },
  { name: 'farm-details', path: '/farm/f1', scroll: 420 },
  { name: 'inquiry', path: '/inquiry/f1', act: fillInquiry },
  { name: 'thread', path: '/thread/c1' },
  { name: 'messages', path: '/messages', act: openFirstThread },
  { name: 'community', path: '/community' },
  { name: 'events', path: '/events' },
  { name: 'resources', path: '/resources' },
  { name: 'notifications', path: '/notifications' },
  { name: 'checkin', path: '/checkin/k1', mock: { checkin: true }, act: needHelp },
  { name: 'settings', path: '/settings', mock: { settings: { textScale: 1.3 } } },
  { name: 'myfarm', path: '/my-farm', mock: { role: 'grower' } },
];

async function fillInquiry(page) {
  const fields = page.locator('input, textarea');
  const n = await fields.count();
  // Product is a chip; the fields are amount, date and note.
  const values = ['6 pint jars', new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), 'For my mother’s church bake sale.'];
  for (let i = 0; i < Math.min(n, values.length); i++) await fields.nth(i).fill(values[i]);
}

async function openFirstThread(page) {
  // On iPad the list and the chat sit side by side; open the first conversation.
  if ((page.viewportSize()?.width ?? 0) >= 700) await page.getByText('Golden Comb Apiary').first().click();
  await wait(800);
}

async function needHelp(page) {
  await page.getByText('I need help', { exact: true }).first().click();
  await wait(200);
  await page.locator('textarea').first().fill('Lost power last night. We need a generator for the honey house.');
}

const only = process.argv[2];
const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();
for (const [device, d] of Object.entries(DEVICES)) {
  fs.mkdirSync(path.join(out, 'raw', device), { recursive: true });
  for (const shot of SHOTS) {
    if (only && !shot.name.startsWith(only)) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.scale, isMobile: device === 'iphone', hasTouch: true });
    await installMock(ctx, shot.mock ?? {});
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}${shot.path}`, { waitUntil: 'networkidle' });
    await wait(1200);
    if (shot.act) await shot.act(page);
    if (shot.scroll === 'name' && (page.viewportSize()?.width ?? 0) < 700) {
      // Start the farm profile at its name, just under the cover photo.
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => /^Region \d+ ·/i.test(d.textContent?.trim() ?? ''));
        el?.scrollIntoView({ block: 'start' });
      });
      await wait(200);
    } else if (shot.scroll) await scrollMain(page, shot.scroll);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.mouse.move(0, 0);
    await wait(500);
    await page.screenshot({ path: path.join(out, 'raw', device, `${shot.name}.png`) });
    console.log(device.padEnd(7), shot.name.padEnd(14), errors.length ? 'ERRORS ' + errors.join(' | ') : 'ok');
    await ctx.close();
  }
}
await browser.close();
server.close();
