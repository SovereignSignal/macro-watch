const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Renders a YYYY-MM-DD date as e.g. "July 11, 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Renders a YYYY-MM-DD date as e.g. "July 2026". */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return isoDate;
  return `${MONTHS[m - 1]} ${y}`;
}

const PACIFIC = 'America/Los_Angeles';

function pacificParts(date: Date, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: PACIFIC }).formatToParts(date);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((entry) => entry.type === type)?.value ?? '';
}

/** PT during standard time, PDT during daylight time. */
export function pacificZoneLabel(date: Date): 'PT' | 'PDT' {
  const name = part(pacificParts(date, { hour: 'numeric', timeZoneName: 'short' }), 'timeZoneName');
  return name === 'PDT' ? 'PDT' : 'PT';
}

/** Stable Pacific stamp for freshness chips, e.g. "30 Sep 17:10 PDT". */
export function formatPacificStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = pacificParts(d, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const day = Number(part(parts, 'day'));
  const mon = part(parts, 'month');
  const hh = part(parts, 'hour').padStart(2, '0');
  const mm = part(parts, 'minute').padStart(2, '0');
  if (!mon || !hh || !mm || !Number.isInteger(day)) return iso;
  return `${day} ${mon} ${hh}:${mm} ${pacificZoneLabel(d)}`;
}

/** Compact Pacific clock, e.g. "7:14a PDT". */
export function formatCompactPacificTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = pacificParts(d, { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
  const hour = part(parts, 'hour');
  const minute = part(parts, 'minute');
  if (!hour || !minute) return null;
  const period = part(parts, 'dayPeriod').toLowerCase().startsWith('p') ? 'p' : 'a';
  return `${hour}:${minute}${period} ${pacificZoneLabel(d)}`;
}

/** Calendar date in America/Los_Angeles as YYYY-MM-DD. */
export function pacificDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = pacificParts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** Relative age for freshness badges: "just now", "3m ago", "2h ago", "3d ago". */
export function formatAgo(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Escapes text for inclusion in XML (RSS). */
export function xmlEscape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
