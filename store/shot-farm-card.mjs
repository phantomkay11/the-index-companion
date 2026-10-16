// Screenshot the printable farm card as a grower sees it, in light and dark mode.
import { installMock } from './mock-backend.mjs';
import { out, playwright, serveDist, wait } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8190;
const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();
fs.mkdirSync(path.join(out, 'farm-card'), { recursive: true });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
  await installMock(ctx, { role: 'grower' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/farm-card`);
  await wait(3500);
  await page.screenshot({ path: path.join(out, 'farm-card', `${scheme}.png`), fullPage: true });
  console.log(scheme, 'errors:', errors.length ? errors.join(' | ') : 'none', '| text:', (await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n/g, ' / '));
  await ctx.close();
}
await browser.close();
server.close();
