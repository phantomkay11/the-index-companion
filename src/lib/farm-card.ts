import { create } from 'qrcode/lib/core/qrcode.js';

/** The public web address of the Index, e.g. https://index.example.org. Empty until BFI sets it. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
/** The text line's phone number, as printed on the card. Empty until BFI sets it. */
export const TEXT_LINE = (process.env.EXPO_PUBLIC_TEXT_LINE ?? '').trim();

/** The farm's profile on the web, or null when the site address isn't set. */
export function farmProfileUrl(farmId: string, siteUrl: string = SITE_URL): string | null {
  const base = siteUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/farm/${encodeURIComponent(farmId)}` : null;
}

/**
 * The keyword a buyer texts to find this farm's product in their state, such as "HONEY LA".
 * The text line reads the first word of a product name, so that is all we print.
 * Returns an empty string when there is nothing in season to name.
 */
export function textKeyword(inSeason: string[], state: string): string {
  const first = inSeason.map((p) => p.trim()).find((p) => p.length >= 2);
  const word = (first ?? '').split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
  if (word.length < 2) return '';
  const st = state.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(st) ? `${word} ${st}` : word;
}

/** A QR code as a grid of dark (true) and light (false) modules. Encodes text with medium error correction. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => Boolean(modules.get(r, c))));
}
