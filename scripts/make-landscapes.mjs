// Draws the brand landscape art used wherever a real photo isn't available yet:
// layered hills, water or rows under a soft sky, in BFI's greens and harvest yellow.
// These are illustrations, not photos, so they never stand in for a real farm or person.
// Usage: node scripts/make-landscapes.mjs   (writes assets/images/landscapes/*.jpg)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'assets/images/landscapes');
const W = 1600;
const H = 1200;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A soft ridge line across the canvas at height y, filled to the bottom. */
function ridge(r, y, amp, waves, fill) {
  const pts = [];
  const n = 8;
  const phase = r() * Math.PI * 2;
  for (let i = 0; i <= n; i++) {
    const x = (W / n) * i;
    const yy = y + Math.sin(phase + (i / n) * Math.PI * waves) * amp + (r() - 0.5) * amp * 0.6;
    pts.push([x, yy]);
  }
  let d = `M0,${H} L${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  d += ` L${W},${H} Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

const grad = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

/** Furrows that run toward the horizon, for row crops and vineyards. */
function rows(horizon, color, count = 22, opacity = 0.35) {
  const vx = W * 0.62;
  let s = '';
  for (let i = -count; i <= count * 2; i++) {
    const x = (i / count) * W;
    s += `<path d="M${vx},${horizon} L${x},${H}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${6}" fill="none"/>`;
  }
  return s;
}

/** A tree line made of soft overlapping crowns. */
function trees(r, y, color, size = 70) {
  let s = '';
  for (let x = -40; x < W + 80; x += size * (0.55 + r() * 0.4)) {
    const h = size * (0.8 + r() * 0.9);
    s += `<ellipse cx="${x}" cy="${y - h * 0.35}" rx="${size * 0.55}" ry="${h * 0.6}" fill="${color}"/>`;
  }
  return s + `<rect x="0" y="${y - 10}" width="${W}" height="${H - y + 10}" fill="${color}"/>`;
}

const SCENES = {
  // Grower types
  'row-crops': { seed: 3, sky: ['#bfe7cf', '#f4f1c9'], sun: [1180, 330, 120, '#ffe680'], layers: [[560, 40, 2, '#5fae7a'], [640, 30, 3, '#2f8f58']], rows: [600, '#0b4a2f'], ground: '#1f7a47' },
  'vegetables-fruit': { seed: 7, sky: ['#a9dfc0', '#fff1b8'], sun: [380, 310, 130, '#ffe066'], layers: [[520, 70, 2, '#7cc28f'], [620, 60, 2.5, '#3a9e63'], [760, 50, 3, '#1c7a45'], [900, 40, 2, '#0e5a33']] },
  ranchers: { seed: 11, sky: ['#f6e3a6', '#fbf4dd'], sun: [1250, 300, 110, '#fff2b0'], layers: [[600, 30, 1.5, '#c9b46a'], [700, 25, 2, '#a99a4f'], [820, 20, 1.5, '#6f8a45'], [960, 15, 2, '#3f6e3a']] },
  beekeepers: { seed: 13, sky: ['#ffd36b', '#fff0c2'], sun: [800, 420, 190, '#fff6d6'], layers: [[620, 60, 2, '#e5a93a'], [720, 50, 2.5, '#c9862a'], [860, 40, 3, '#7f8f34'], [990, 30, 2, '#3e6e33']] },
  fisherfolk: { seed: 17, sky: ['#9fd6dc', '#e9f6f1'], sun: [1100, 360, 120, '#fff4c4'], water: [640, '#2e8c95', '#0d5560'], layers: [[620, 18, 2, '#4f8f6e']] },
  foragers: { seed: 19, sky: ['#cfe8d6', '#f1f6e4'], sun: [520, 280, 100, '#fff3c0'], trees: [[560, '#5a9d72', 90], [700, '#2f7c50', 110], [880, '#164f31', 130]] },
  vintners: { seed: 23, sky: ['#f2c6b8', '#f9e6c9'], sun: [1200, 360, 120, '#ffe2a8'], layers: [[600, 50, 2, '#9b6a7f'], [720, 40, 2.5, '#6d4a63']], rows: [640, '#3b2a3a'], ground: '#4f6b3a' },
  organic: { seed: 29, sky: ['#c7efd5', '#fbf9d9'], sun: [300, 300, 120, '#fff0a0'], layers: [[540, 50, 2, '#8fd3a4'], [660, 50, 2.5, '#4fb57a'], [800, 40, 3, '#22924f'], [940, 30, 2, '#0f6b3a']] },
  // Sections
  discover: { seed: 31, sky: ['#ffd982', '#c9ecd2'], sun: [1120, 420, 170, '#fff5cf'], layers: [[600, 60, 2, '#86c495'], [700, 50, 2.5, '#4aa36b'], [820, 45, 3, '#1f7d48']], rows: [820, '#0b4a2f'], ground: '#0f5c37' },
  events: { seed: 37, sky: ['#f7b98a', '#fde3b0'], sun: [420, 470, 160, '#ffe7b0'], layers: [[640, 40, 2, '#c98a5a'], [740, 40, 2.5, '#5f8a4c'], [880, 30, 2, '#2b6b3e']] },
  resources: { seed: 41, sky: ['#bfe3f0', '#f3f8e3'], sun: [1260, 280, 100, '#fffbe0'], layers: [[580, 50, 2, '#9fd0b0'], [700, 45, 2.5, '#58a97b'], [850, 35, 3, '#21804b']] },
  community: { seed: 43, sky: ['#9ccfb6', '#f6e7a8'], sun: [800, 520, 210, '#fff2c0'], layers: [[660, 50, 2, '#6fb487'], [780, 40, 2.5, '#2f8a55'], [920, 30, 2, '#0e5a33']] },
};

function svg(name, s) {
  const r = rng(s.seed);
  const defs = [grad('sky', [[0, s.sky[0]], [1, s.sky[1]]], 0, 1)];
  let body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  if (s.sun) {
    const [x, y, rad, c] = s.sun;
    defs.push(`<radialGradient id="glow"><stop offset="0" stop-color="${c}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
    body += `<circle cx="${x}" cy="${y}" r="${rad * 3.2}" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="${rad * 0.55}" fill="${c}"/>`;
  }
  if (s.water) {
    const [y, a, b] = s.water;
    defs.push(grad('water', [[0, a], [1, b]]));
    for (const l of s.layers ?? []) body += ridge(r, l[0] - 70, l[1], l[2], l[3]);
    body += `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#water)"/>`;
    for (let i = 0; i < 26; i++) {
      const yy = y + 20 + i * i * 0.9;
      const w = 120 + r() * 380;
      body += `<rect x="${r() * W}" y="${yy}" width="${w}" height="${3 + i * 0.2}" rx="2" fill="#ffffff" opacity="${0.08 + r() * 0.12}"/>`;
    }
  } else if (s.trees) {
    for (const [y, c, size] of s.trees) body += trees(r, y, c, size);
  } else {
    for (const l of s.layers) body += ridge(r, l[0], l[1], l[2], l[3]);
    if (s.rows) {
      const [y, c] = s.rows;
      body += `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="${s.ground ?? c}"/>` + rows(y, c);
    }
  }
  // Fine grain and a gentle vignette, so the art reads like a print rather than flat vectors.
  defs.push(`<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${s.seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer></filter>`);
  defs.push(`<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></radialGradient>`);
  body += `<rect width="${W}" height="${H}" filter="url(#grain)"/><rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs>${body}</svg>`;
}

const require = createRequire('/opt/npm-tools/node_modules/');
let pw;
try { pw = createRequire(import.meta.url)('playwright'); } catch { pw = require('playwright'); }
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
fs.mkdirSync(outDir, { recursive: true });
for (const [name, scene] of Object.entries(SCENES)) {
  await page.setContent(`<html><body style="margin:0">${svg(name, scene)}</body></html>`);
  const file = path.join(outDir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log(path.relative(root, file), Math.round(fs.statSync(file).size / 1024) + ' KB');
}
await browser.close();
