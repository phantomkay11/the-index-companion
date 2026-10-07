import { currentLang, fill, strings, type Lang } from '@/lib/i18n';

// Short month names per language. Our own tables, because Intl on Hermes can be missing or incomplete.
const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  ht: ['jan', 'fev', 'mas', 'avr', 'me', 'jen', 'jiy', 'out', 'sep', 'okt', 'nov', 'des'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

/**
 * Every formatter below takes an optional `lang` last. Components should pass `language` from useSettings():
 * it makes the language an explicit input, so memoized output (React Compiler) updates when it changes.
 * Without it, the language chosen in Settings is used.
 */

/** A date's local calendar day as YYYY-MM-DD. */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A typed YYYY-MM-DD as a real local calendar day (noon), or null for anything else, like 2026-02-30. */
export function parseLocalDate(text: string) {
  const s = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.getTime()) && ymd(d) === s ? d : null;
}

export function monthDay(iso: string, lang: Lang = currentLang()) {
  // A bare date ("2026-10-10") is a calendar day; new Date() would read it as UTC midnight,
  // which is the day before across the Americas.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return { month: (MONTHS[lang] ?? MONTHS.en)[d.getMonth()], day: d.getDate() };
}

/** "Oct 5" in English; "5 oct" / "5 oct." / "5 okt" / "5 out" elsewhere. */
export function shortDate(iso: string, lang: Lang = currentLang()) {
  const { month, day } = monthDay(iso, lang);
  return lang === 'en' ? `${month} ${day}` : `${day} ${month}`;
}

/** "Apr 2020" / "avr. 2020" from "2020-04". */
export function monthYear(ym: string, lang: Lang = currentLang()) {
  const [y, m] = ym.split('-').map(Number);
  return `${(MONTHS[lang] ?? MONTHS.en)[m - 1]} ${y}`;
}

/** "2 pm", "2:30 pm" (en); "2:30 p. m." (es); "14 h 30" (fr); "14:30" (ht); "14h30" (pt). */
export function timeOfDay(iso: string, lang: Lang = currentLang()) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const mm = String(m).padStart(2, '0');
  if (lang === 'fr') return m === 0 ? `${h} h` : `${h} h ${mm}`;
  if (lang === 'pt') return m === 0 ? `${h}h` : `${h}h${mm}`;
  if (lang === 'ht') return `${h}:${mm}`;
  const suffix = lang === 'es' ? (h >= 12 ? 'p. m.' : 'a. m.') : h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${mm} ${suffix}`;
}

/** "Updated today", "Updated 3 days ago", "Updated Sep 2" — in the member's language. */
export function updatedAgo(iso: string, now = new Date(), lang: Lang = currentLang()) {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  const words = strings[lang] ?? strings.en;
  if (days <= 0) return words.s_updatedToday;
  if (days === 1) return words.s_updatedYesterday;
  if (days < 7) return fill(words.s_updatedDaysAgo, { n: days });
  return fill(words.s_updatedOn, { date: shortDate(iso, lang) });
}

export function daysUntil(isoDate: string, now = new Date()) {
  return Math.round((startOfDay(new Date(isoDate.slice(0, 10) + 'T12:00:00')) - startOfDay(now)) / 86_400_000);
}

export function threadTime(iso: string, now = new Date(), lang: Lang = currentLang()) {
  const d = new Date(iso);
  if (startOfDay(d) === startOfDay(now)) return timeOfDay(iso, lang);
  return shortDate(iso, lang);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function nextSaturday(now = new Date()) {
  const d = new Date(now);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  // Local calendar date (toISOString would use UTC and can land on Sunday in US evenings).
  return ymd(d);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
