// Records the iPhone App Preview: real interactions in the app, captured frame by frame at 30 fps.
// Writes raw frames to store/out/preview/raw/<shot>/ and overlay art to store/out/preview/art/.
// Then run: python3 store/preview_compose.py   (adds status bar, captions and crossfades, and encodes)
// Usage: npx expo export --platform web && node store/preview.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { installMock } from './mock-backend.mjs';
import { out, playwright, root, scrollMain, serveDist, wait } from './lib.mjs';

const PORT = 8151;
const W = 886;
const SCALE = W / 393; // 393 x 852 pt iPhone, recorded at 886 x 1920 px
const VIEW = { width: 393, height: 852 - 54 - 34 }; // minus status bar and home indicator
const dir = path.join(out, 'preview');

// Each shot: what happens on screen, plus the caption shown over it.
export const SHOTS = [
  { name: 'discover', frames: 120, caption: 'Find Black farmers *near you*', run: discover },
  { name: 'farm', frames: 120, caption: 'Every farm is *verified by BFI*', run: farmProfile },
  { name: 'inquiry', frames: 132, caption: 'Ask for *exactly* what you need', run: inquiry },
  { name: 'thread', frames: 132, caption: 'Hear back in the app *or by text*', run: thread },
  { name: 'events', frames: 105, caption: 'Never miss a *market day*', run: events },
  { name: 'checkin', frames: 132, caption: 'Checking in *after the storm*', mock: { checkin: true }, run: checkin },
  { name: 'access', frames: 120, caption: 'Larger text, *for every reader*', run: access },
];

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A frame grabber bound to one shot. */
function recorder(page, shot) {
  const folder = path.join(dir, 'raw', shot.name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  let n = 0;
  const grab = async () => {
    if (n >= shot.frames) return;
    n += 1;
    await page.screenshot({ path: path.join(folder, `${String(n).padStart(4, '0')}.png`) });
  };
  const hold = async (count) => {
    for (let i = 0; i < count; i++) await grab();
  };
  const fill = async () => hold(shot.frames - n);
  return { grab, hold, fill, get n() { return n; } };
}

/** A touch ripple drawn into the page, so taps read on video. */
async function tap(page, rec, locator, { click = true } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Nothing to tap');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  for (let i = 0; i <= 8; i++) {
    await page.evaluate(([x, y, i]) => {
      let dot = document.getElementById('__tap');
      if (!dot) {
        dot = document.createElement('div');
        dot.id = '__tap';
        Object.assign(dot.style, { position: 'fixed', width: '56px', height: '56px', margin: '-28px 0 0 -28px', borderRadius: '50%', background: 'rgba(18,32,25,0.28)', border: '3px solid rgba(255,255,255,0.85)', pointerEvents: 'none', zIndex: 99999 });
        document.body.appendChild(dot);
      }
      const t = i / 8;
      Object.assign(dot.style, { left: `${x}px`, top: `${y}px`, opacity: String(t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6), transform: `scale(${0.6 + t * 0.7})` });
      if (i === 8) dot.remove();
    }, [x, y, i]);
    if (i === 3 && click) await locator.click();
    await rec.grab();
  }
}

async function scrollTo(page, rec, from, to, frames) {
  for (let i = 1; i <= frames; i++) {
    await scrollMain(page, from + (to - from) * ease(i / frames));
    await rec.grab();
  }
}

async function typeInto(page, rec, locator, text, framesPerChar = 2) {
  await locator.click();
  for (const ch of text) {
    await page.keyboard.type(ch);
    await wait(15);
    for (let i = 0; i < framesPerChar; i++) await rec.grab();
  }
}

// --- Shots -----------------------------------------------------------------

async function discover(page, rec) {
  await rec.hold(24);
  await scrollTo(page, rec, 0, 980, 70);
  await rec.fill();
}

async function farmProfile(page, rec) {
  await rec.hold(14);
  const top = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /^Region \d+ ·/i.test(d.textContent?.trim() ?? ''));
    return el ? el.getBoundingClientRect().top - 70 : 200;
  });
  await scrollTo(page, rec, 0, top, 30);
  await rec.hold(18);
  await scrollTo(page, rec, top, top + 430, 36);
  await rec.fill();
}

async function inquiry(page, rec) {
  await rec.hold(12);
  const fields = page.locator('input, textarea');
  await typeInto(page, rec, fields.nth(0), '6 pint jars', 2);
  await rec.hold(6);
  await tap(page, rec, page.getByText('Pickup at the Lafayette market').first());
  await rec.hold(4);
  await typeInto(page, rec, fields.nth(2), 'For a church bake sale', 1);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await rec.hold(6);
  await tap(page, rec, page.getByText('Send inquiry').first(), { click: false });
  await rec.fill();
}

async function thread(page, rec) {
  await rec.hold(20);
  await typeInto(page, rec, page.getByPlaceholder('Write a message'), 'See you Saturday!', 2);
  await rec.hold(10);
  await tap(page, rec, page.getByLabel('Send').last(), { click: false });
  await rec.fill();
}

async function events(page, rec) {
  await rec.hold(20);
  await scrollTo(page, rec, 0, 520, 60);
  await rec.fill();
}

async function checkin(page, rec) {
  await rec.hold(18);
  await tap(page, rec, page.getByText('I need help', { exact: true }).first());
  await rec.hold(6);
  await typeInto(page, rec, page.locator('textarea').first(), 'Lost power. Need a generator.', 1);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await rec.hold(8);
  await tap(page, rec, page.getByText('Send to BFI').first(), { click: false });
  await rec.fill();
}

async function access(page, rec, ctxFor) {
  // Discover at the phone's normal size, then the same screen at 150% text.
  await rec.hold(30);
  const big = await ctxFor({ settings: { textScale: 1.5 } }, '/');
  const folder = path.join(dir, 'raw', 'access-big');
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  await big.screenshot({ path: path.join(folder, '0001.png') });
  await big.context().close();
  await rec.fill();
}

// --- Overlay art (captions, status bar, end card), drawn with the app's fonts ---

const font = (pkg, file) => pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts', pkg, file)).href;
const FONTS = `
@font-face { font-family: 'Young Serif'; src: url(${font('young-serif', '400Regular/YoungSerif_400Regular.ttf')}); }
@font-face { font-family: 'Atkinson'; font-weight: 400; src: url(${font('atkinson-hyperlegible', '400Regular/AtkinsonHyperlegible_400Regular.ttf')}); }
@font-face { font-family: 'Atkinson'; font-weight: 700; src: url(${font('atkinson-hyperlegible', '700Bold/AtkinsonHyperlegible_700Bold.ttf')}); }
@font-face { font-family: 'Plex Mono'; font-weight: 500; src: url(${font('ibm-plex-mono', '500Medium/IBMPlexMono_500Medium.ttf')}); }
*{margin:0;padding:0;box-sizing:border-box} body{background:transparent;-webkit-font-smoothing:antialiased}`;

async function renderArt(browser) {
  const art = path.join(dir, 'art');
  fs.mkdirSync(art, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: 1920 }, deviceScaleFactor: 1 });
  const shot = async (name, html, height) => {
    await page.setViewportSize({ width: W, height });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(art, `${name}.png`), omitBackground: true });
  };

  const s = SCALE;
  await shot('status', `
    <div style="width:${W}px;height:${Math.round(54 * s)}px;background:#fdfdfb;position:relative;display:flex;align-items:center;justify-content:space-between;padding:${Math.round(6 * s)}px ${Math.round(30 * s)}px 0 ${Math.round(44 * s)}px;font:700 ${Math.round(17 * s)}px Atkinson;color:#122019">
      <span>9:41</span>
      <svg width="${Math.round(70 * s)}" height="${Math.round(13 * s)}" viewBox="0 0 70 13"><g fill="#122019">
        <rect x="0" y="8" width="3.4" height="5" rx="1"/><rect x="5" y="5.5" width="3.4" height="7.5" rx="1"/><rect x="10" y="3" width="3.4" height="10" rx="1"/><rect x="15" y="0" width="3.4" height="13" rx="1"/>
        <path d="M30 12.2l-2-2.1a2.8 2.8 0 0 1 4 0z"/><path d="M26.2 8.2a5.4 5.4 0 0 1 7.6 0l-1.2 1.2a3.7 3.7 0 0 0-5.2 0z"/><path d="M24.2 6.2a8.2 8.2 0 0 1 11.6 0l-1.2 1.2a6.5 6.5 0 0 0-9.2 0z"/>
        <rect x="43" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="#122019" stroke-opacity=".4"/><rect x="45" y="2.5" width="19" height="8" rx="2"/><rect x="67.3" y="4.5" width="1.6" height="4" rx=".8" fill-opacity=".4"/></g></svg>
      <div style="position:absolute;top:${Math.round(11 * s)}px;left:50%;width:${Math.round(126 * s)}px;height:${Math.round(37 * s)}px;margin-left:-${Math.round(63 * s)}px;background:#000;border-radius:999px"></div>
    </div>`, Math.round(54 * s));

  for (const shotDef of SHOTS) {
    const text = shotDef.caption.replace(/\*(.+?)\*/g, '<span style="color:#f5d978">$1</span>');
    await shot(`caption-${shotDef.name}`, `
      <div style="padding:0 34px;display:flex;justify-content:center">
        <div style="background:rgba(9,74,43,0.96);border-radius:38px;padding:34px 44px 38px;box-shadow:0 20px 50px rgba(0,0,0,.28);max-width:${W - 68}px">
          <div style="font:400 60px/1.08 'Young Serif';color:#fffdf5;text-align:center;text-wrap:balance">${text}</div>
        </div>
      </div>`, 300);
  }

  await shot('endcard', `
    <div style="width:${W}px;height:1920px;background:linear-gradient(170deg,#0a4f2e,#007640);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center;padding:0 80px">
      <div style="font:500 28px 'Plex Mono';letter-spacing:.16em;text-transform:uppercase;color:#a9d9b8">Free from Black Farmers Index</div>
      <div style="font:400 130px/1 'Young Serif';color:#fffdf5">The Index</div>
      <div style="font:400 44px/1.3 Atkinson;color:#d5eadb;text-wrap:balance">Find growers, ask, talk and show up for each other.</div>
    </div>`, 1920);
  await page.close();
}

// --- Run -------------------------------------------------------------------

const PATHS = { discover: '/', farm: '/farm/f1', inquiry: '/inquiry/f1', thread: '/thread/c1', events: '/events', checkin: '/checkin/k1', access: '/' };
const only = process.argv[2];
const { chromium } = playwright();
const server = await serveDist(PORT);
const browser = await chromium.launch();

async function openPage(mock, url) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
  await installMock(ctx, mock);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'networkidle' });
  await wait(1200);
  await page.mouse.move(-10, -10);
  return page;
}

await renderArt(browser);
for (const shot of SHOTS) {
  if (only && shot.name !== only) continue;
  const page = await openPage(shot.mock ?? {}, PATHS[shot.name]);
  const rec = recorder(page, shot);
  const started = Date.now();
  await shot.run(page, rec, openPage);
  console.log(shot.name.padEnd(10), `${rec.n} frames`, `${((Date.now() - started) / 1000).toFixed(0)}s`);
  await page.context().close();
}
await browser.close();
server.close();
