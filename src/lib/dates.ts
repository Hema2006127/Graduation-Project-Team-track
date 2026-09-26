/** Date/time helpers. Session dates/times are stored as wall-clock values in
 * the team's timezone (app_settings.timezone), exactly like the database. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-calendar YYYY-MM-DD for a Date. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Normalises 'HH:MM:SS' / 'HH:MM' to 'HH:MM'. */
export const hhmm = (t: string) => t.slice(0, 5);

/**
 * Current wall-clock time in `timeZone` as a sortable key 'YYYY-MM-DDTHH:MM'.
 * Compared lexicographically with `${session_date}T${start_time}`.
 */
export function nowKey(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  } catch {
    return `${toISODate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
}

export const todayIn = (timeZone: string) => nowKey(timeZone).slice(0, 10);

/** 27/09/2026 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Sun, 27 Sep 2026 */
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso.slice(0, 10));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${weekday}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** 07:00 PM */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(m)} ${suffix}`;
}

export const formatTimeRange = (start: string, end: string) => `${formatTime(start)} - ${formatTime(end)}`;

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthRange(iso: string): { from: string; to: string } {
  const d = parseISODate(iso);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}
