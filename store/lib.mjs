import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const out = path.join(root, 'store', 'out');

/** Playwright, from the project or from a global install. */
export function playwright() {
  for (const base of [import.meta.url, '/opt/npm-tools/node_modules/']) {
    try {
      return createRequire(base)('playwright');
    } catch {}
  }
  throw new Error('Install Playwright first: npm i -D playwright');
}

/** Serve the web build like Vercel does: real files, otherwise index.html. */
export function serveDist(port) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run `npx expo export --platform web` first.');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (!(fs.existsSync(f) && fs.statSync(f).isFile())) f = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** The app's main scrolling area: the tallest element that actually scrolls. */
export async function scrollMain(page, y, { smooth = false } = {}) {
  await page.evaluate(([y, smooth]) => {
    let best = null;
    for (const el of document.querySelectorAll('div')) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 20 && el.clientWidth > window.innerWidth * 0.5) {
        if (!best || el.clientHeight > best.clientHeight) best = el;
      }
    }
    if (best) {
      if (smooth) best.scrollTo({ top: y, behavior: 'smooth' });
      else best.scrollTop = y;
    }
  }, [y, smooth]);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
