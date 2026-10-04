const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthDay(iso: string) {
  const d = new Date(iso);
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
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${shortDate(iso)}`;
}

export function daysUntil(isoDate: string, now = new Date()) {
  return Math.round((startOfDay(new Date(isoDate + 'T12:00:00')) - startOfDay(now)) / 86_400_000);
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
  return d.toISOString().slice(0, 10);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
