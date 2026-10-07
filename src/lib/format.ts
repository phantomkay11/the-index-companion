const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A plain date ("2026-10-10") means that calendar day wherever you are. `new Date('2026-10-10')` would read
 * it as UTC midnight and show Oct 9 across the Americas, so date-only strings are read at local noon.
 */
export function parseDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
}

export function monthDay(iso: string) {
  const d = parseDate(iso);
  return { month: MONTHS[d.getMonth()], day: d.getDate() };
}

export function shortDate(iso: string) {
  const { month, day } = monthDay(iso);
  return `${month} ${day}`;
}

export function timeOfDay(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Updated today", "Updated 3 days ago", "Updated Sep 2". */
export function updatedAgo(iso: string, now = new Date()) {
  const days = Math.floor((startOfDay(now) - startOfDay(parseDate(iso))) / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${shortDate(iso)}`;
}

export function daysUntil(isoDate: string, now = new Date()) {
  return Math.round((startOfDay(parseDate(isoDate.slice(0, 10))) - startOfDay(now)) / 86_400_000);
}

export function threadTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (startOfDay(d) === startOfDay(now)) return timeOfDay(iso);
  return shortDate(iso);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function nextSaturday(now = new Date()) {
  const d = new Date(now);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return localDate(d);
}

/** YYYY-MM-DD for the local calendar day (toISOString would give tomorrow's date in the evening). */
export function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Checks a typed date really exists ("2026-02-31" doesn't) and, optionally, isn't in the past. */
export function validDate(s: string, { notPast = false } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return false;
  if (notPast && localDate(d) < localDate(new Date())) return false;
  return true;
}

/** Checks a typed 24-hour time like "09:30". */
export function validTime(s: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

/** '+1 (504) 555-0100', '504.555.0100' and '15045550100' all become '+15045550100'; anything else is null. */
export function toE164(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
