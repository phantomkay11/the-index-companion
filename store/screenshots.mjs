// Composes the App Store screenshots from the raw captures in store/out/raw.
// iPhone 6.9": 1320 x 2868. iPad 13": 2064 x 2752. PNG, no transparency.
// Usage: node store/capture.mjs && node store/screenshots.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { out, playwright, root } from './lib.mjs';

const font = (pkg, file) => pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts', pkg, file)).href;
const FONTS = `
@font-face { font-family: 'Young Serif'; src: url(${font('young-serif', '400Regular/YoungSerif_400Regular.ttf')}); }
@font-face { font-family: 'Atkinson'; font-weight: 400; src: url(${font('atkinson-hyperlegible', '400Regular/AtkinsonHyperlegible_400Regular.ttf')}); }
@font-face { font-family: 'Atkinson'; font-weight: 700; src: url(${font('atkinson-hyperlegible', '700Bold/AtkinsonHyperlegible_700Bold.ttf')}); }
@font-face { font-family: 'Plex Mono'; font-weight: 500; src: url(${font('ibm-plex-mono', '500Medium/IBMPlexMono_500Medium.ttf')}); }`;

const THEMES = {
  green: { bg: 'linear-gradient(170deg, #0a4f2e 0%, #007640 100%)', head: '#fffdf5', accent: '#f5d978', sub: '#d5eadb', eyebrow: '#a9d9b8', line: 'rgba(255,255,255,0.07)' },
  cream: { bg: 'linear-gradient(170deg, #f6f2e8 0%, #e9e4d4 100%)', head: '#0b3d24', accent: '#007640', sub: '#3f5a49', eyebrow: '#007640', line: 'rgba(0,118,64,0.08)' },
  sun: { bg: 'linear-gradient(170deg, #f8e08e 0%, #f1cd5c 100%)', head: '#231c06', accent: '#0a5c34', sub: '#4a3b10', eyebrow: '#6b5412', line: 'rgba(60,40,0,0.08)' },
};

// Headline: wrap the words to colour in *asterisks*.
const IPHONE = [
  { shot: 'discover', theme: 'green', eyebrow: 'The Index · from Black Farmers Index', head: 'Find Black farmers *near you*', sub: 'A free companion to the largest directory of Black farmers.' },
  { shot: 'farm', theme: 'cream', eyebrow: 'Farm profiles', head: 'Know who *grows your food*', sub: 'Every farm is checked and verified by BFI.' },
  { shot: 'inquiry', theme: 'green', eyebrow: 'Inquiries', head: 'Ask for *exactly* what you need', sub: 'Farmers answer in one tap, even by text message.' },
  { shot: 'thread', theme: 'cream', eyebrow: 'Messages', head: 'Talk straight *to the farm*', sub: 'In the app or by plain text, with Translate and Listen.' },
  { shot: 'events', theme: 'green', eyebrow: 'Events', head: 'Never miss a *market day*', sub: 'RSVP, sign up to volunteer and get reminders your way.' },
  { shot: 'resources', theme: 'cream', eyebrow: 'Resources', head: 'Programs and grants *that fit*', sub: 'BFI’s own programs first, with deadline reminders.' },
  { shot: 'community', theme: 'green', eyebrow: 'Community board', head: 'Lend a hand. *Borrow a seeder.*', sub: 'Needs, offers, rides and mentoring in your region.' },
  { shot: 'myfarm', theme: 'cream', eyebrow: 'For growers', head: 'Built for *growers* too', sub: 'Mark what’s fresh and see who’s visiting your farm.' },
  { shot: 'checkin', theme: 'sun', eyebrow: 'Storm check-ins', head: 'Checking in *after the storm*', sub: 'Tell BFI you’re OK, or that you need help.' },
  { shot: 'settings', theme: 'green', eyebrow: 'Accessibility', head: 'Made for *every reader*', sub: 'Larger text, read-aloud and five languages.' },
];

const IPAD = [
  { shot: 'discover', theme: 'green', eyebrow: 'The Index · from Black Farmers Index', head: 'Find Black farmers *near you*', sub: 'A free companion to the largest directory of Black farmers.' },
  { shot: 'farm', theme: 'cream', eyebrow: 'Farm profiles', head: 'Know who *grows your food*', sub: 'Every farm is checked and verified by BFI.' },
  { shot: 'messages', theme: 'green', eyebrow: 'Messages', head: 'Talk straight *to the farm*', sub: 'Inquiries farmers answer in one tap, by app or text.' },
  { shot: 'events', theme: 'cream', eyebrow: 'Events', head: 'Never miss a *market day*', sub: 'RSVP, volunteer shifts and reminders your way.' },
  { shot: 'community', theme: 'green', eyebrow: 'Community board', head: 'Lend a hand. *Borrow a seeder.*', sub: 'Needs, offers, rides and mentoring in your region.' },
  { shot: 'resources', theme: 'cream', eyebrow: 'Resources', head: 'Programs and grants *that fit*', sub: 'BFI’s own programs first, with deadline reminders.' },
];

const DEVICES = {
  iphone: { canvas: [1320, 2868], screenW: 960, logical: [430, 932], status: 54, home: 34, bezel: 22, radius: 150, top: 690, headSize: 112, subSize: 46, eyebrowSize: 30, pad: 120, slides: IPHONE },
  ipad: { canvas: [2064, 2752], screenW: 1560, logical: [1032, 1376], status: 24, home: 20, bezel: 36, radius: 90, top: 480, headSize: 116, subSize: 50, eyebrowSize: 34, pad: 180, slides: IPAD },
};

const headline = (s, accent) => s.replace(/\*(.+?)\*/g, `<span style="color:${accent}">$1</span>`);

const ICONS = (color) => `
<svg width="62" height="22" viewBox="0 0 62 22"><g fill="${color}">
  <rect x="0" y="14" width="6" height="8" rx="1.5"/><rect x="9" y="10" width="6" height="12" rx="1.5"/><rect x="18" y="5" width="6" height="17" rx="1.5"/><rect x="27" y="0" width="6" height="22" rx="1.5"/>
  <path d="M48 20.5l-3.4-3.6a4.8 4.8 0 0 1 6.8 0z"/><path d="M41.5 13.6a9.3 9.3 0 0 1 13 0l-2 2.1a6.4 6.4 0 0 0-9 0z"/><path d="M38.2 10.2a14 14 0 0 1 19.6 0l-2 2.1a11.1 11.1 0 0 0-15.6 0z"/>
</g></svg>
<svg width="48" height="22" viewBox="0 0 48 22"><rect x="1" y="1" width="40" height="20" rx="6" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="2"/>
  <rect x="4" y="4" width="34" height="14" rx="3.5" fill="${color}"/><rect x="43.5" y="7.5" width="3" height="7" rx="1.5" fill="${color}" fill-opacity="0.45"/></svg>`;

/** The colour of the app's bottom edge, so the home-indicator strip continues it. */
function bottomColor(file) {
  return execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(file)}).convert('RGB')
print('#%02x%02x%02x' % im.getpixel((im.width // 2, im.height - 2)))
`]).toString().trim();
}

function slideHtml(device, d, slide, rawUrl, bottom) {
  const t = THEMES[slide.theme];
  const [W, H] = d.canvas;
  const s = d.screenW / d.logical[0];
  const screenH = Math.round(d.logical[1] * s);
  const statusH = Math.round(d.status * s);
  const homeH = Math.round(d.home * s);
  const deviceW = d.screenW + d.bezel * 2;
  const isPhone = device === 'iphone';
  const statusRow = isPhone
    ? `<div style="position:absolute;left:0;right:0;top:0;height:${statusH}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(34 * s)}px 0 ${Math.round(46 * s)}px;font:700 ${Math.round(17 * s)}px Atkinson;color:#122019">
         <span style="padding-top:${Math.round(6 * s)}px">9:41</span><span style="display:flex;gap:${Math.round(6 * s)}px;align-items:center;transform:scale(${(s / 2.2).toFixed(2)});transform-origin:right center;padding-top:${Math.round(6 * s)}px">${ICONS('#122019')}</span></div>
       <div style="position:absolute;top:${Math.round(11 * s)}px;left:50%;width:${Math.round(126 * s)}px;height:${Math.round(37 * s)}px;margin-left:-${Math.round(63 * s)}px;background:#000;border-radius:999px"></div>`
    : `<div style="position:absolute;left:0;right:0;top:0;height:${statusH}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(22 * s)}px;font:700 ${Math.round(13 * s)}px Atkinson;color:#122019">
         <span>9:41&nbsp;&nbsp;Tue Oct 6</span><span style="display:flex;gap:10px;align-items:center;transform:scale(${(s / 1.9).toFixed(2)});transform-origin:right center">${ICONS('#122019')}</span></div>`;

  // Faint contour "furrows" behind the device.
  const furrows = Array.from({ length: 14 }, (_, i) => {
    const r = 420 + i * 120;
    return `<circle cx="${W / 2}" cy="${H + 260}" r="${r}" fill="none" stroke="${t.line}" stroke-width="3"/>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
  *{box-sizing:border-box;margin:0;padding:0} html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{background:${t.bg};position:relative;-webkit-font-smoothing:antialiased}
  .copy{position:absolute;left:${d.pad}px;right:${d.pad}px;top:${isPhone ? 150 : 110}px;text-align:center}
  .eyebrow{font:500 ${d.eyebrowSize}px 'Plex Mono';letter-spacing:.14em;text-transform:uppercase;color:${t.eyebrow};margin-bottom:${isPhone ? 34 : 40}px}
  h1{font:400 ${d.headSize}px/1.04 'Young Serif';color:${t.head};letter-spacing:-.01em;text-wrap:balance}
  p{font:400 ${d.subSize}px/1.3 Atkinson;color:${t.sub};margin-top:${isPhone ? 34 : 40}px;text-wrap:balance}
  .device{position:absolute;left:${(W - deviceW) / 2}px;top:${d.top}px;width:${deviceW}px;padding:${d.bezel}px;border-radius:${d.radius}px;
    background:#0d0f0e;box-shadow:0 0 0 3px #2c302d inset, 0 60px 120px rgba(0,0,0,.28), 0 18px 40px rgba(0,0,0,.18)}
  .screen{position:relative;width:${d.screenW}px;height:${screenH}px;border-radius:${d.radius - d.bezel}px;overflow:hidden;background:#fdfdfb}
  .screen img{position:absolute;left:0;top:${statusH}px;width:${d.screenW}px;height:${screenH - statusH - homeH}px;object-fit:cover;object-position:top}
  .home{position:absolute;left:0;right:0;bottom:0;height:${homeH}px;background:${bottom}}
  .home::after{content:'';position:absolute;left:50%;bottom:${Math.round(8 * s)}px;width:${Math.round((isPhone ? 140 : 320) * s)}px;height:${Math.round(5 * s)}px;margin-left:-${Math.round((isPhone ? 70 : 160) * s)}px;border-radius:99px;background:#122019}
  </style></head><body>
  <svg style="position:absolute;inset:0" width="${W}" height="${H}">${furrows}</svg>
  <div class="copy"><div class="eyebrow">${slide.eyebrow}</div><h1>${headline(slide.head, t.accent)}</h1><p>${slide.sub}</p></div>
  <div class="device"><div class="screen">${statusRow}<img src="${rawUrl}"><div class="home"></div></div></div>
  </body></html>`;
}

const { chromium } = playwright();
const browser = await chromium.launch();
const work = path.join(out, 'compose');
fs.mkdirSync(work, { recursive: true });
for (const [device, d] of Object.entries(DEVICES)) {
  const dir = path.join(out, 'screenshots', device);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: d.canvas[0], height: d.canvas[1] }, deviceScaleFactor: 1 });
  for (const [i, slide] of d.slides.entries()) {
    const raw = path.join(out, 'raw', device, `${slide.shot}.png`);
    const html = path.join(work, `${device}-${slide.shot}.html`);
    fs.writeFileSync(html, slideHtml(device, d, slide, pathToFileURL(raw).href, bottomColor(raw)));
    await page.goto(pathToFileURL(html).href);
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${slide.shot}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(root, file));
  }
  await page.close();
}
await browser.close();

// App Store Connect rejects transparency: flatten every PNG to RGB.
execFileSync('python3', ['-c', `
import glob
from PIL import Image
for f in glob.glob(${JSON.stringify(path.join(out, 'screenshots'))} + '/*/*.png'):
    Image.open(f).convert('RGB').save(f, optimize=True)
`]);
