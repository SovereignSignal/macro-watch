/**
 * Render-time conversion of stored Pacific and Eastern clocks to UTC.
 * Offsets come from Intl for the brief's calendar date, so DST is not a
 * fixed −7/−4. Attributes and URLs are left alone.
 */

const MERIDIAN = String.raw`(?:[ap]\.m\.?|[ap]m)`;
const ZONE = String.raw`(?:new york time|pacific(?:\s+time)?|eastern(?:\s+time)?|pdt|pst|pt|edt|est|et)`;
const TIME_RE = new RegExp(
  String.raw`\b(?:(\d{1,2}):(\d{2})(?:\s*(${MERIDIAN}))?|(\d{1,2})\s*(${MERIDIAN}))\s*(${ZONE})\b`,
  'gi',
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function zoneId(zone: string): 'America/Los_Angeles' | 'America/New_York' {
  const name = zone.toLowerCase();
  if (name === 'pt' || name === 'pdt' || name === 'pst' || name.startsWith('pacific')) {
    return 'America/Los_Angeles';
  }
  return 'America/New_York';
}

function wallClock(hourText: string, minuteText: string | undefined, meridian: string | undefined): { hour: number; minute: number } | null {
  const hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridian) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridian.trim().toLowerCase().startsWith('p');
    return { hour: (hour % 12) + (pm ? 12 : 0), minute };
  }
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

/** Milliseconds to add to a UTC instant to get the wall clock in `timeZone`. */
function zoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - utcMs;
}

function zonedWallToUtc(isoDate: string, hour: number, minute: number, timeZone: string): string | null {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = zoneOffsetMs(timeZone, guess);
  let utc = guess - first;
  const second = zoneOffsetMs(timeZone, utc);
  if (second !== first) utc = guess - second;
  const instant = new Date(utc);
  if (Number.isNaN(instant.getTime())) return null;
  const hh = String(instant.getUTCHours()).padStart(2, '0');
  const mm = String(instant.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function convertText(text: string, isoDate: string): string {
  return text.replace(TIME_RE, (match, clockHour: string | undefined, minute: string | undefined, clockMeridian: string | undefined, bareHour: string | undefined, bareMeridian: string | undefined, zone: string) => {
    const hourText = clockHour ?? bareHour;
    const meridian = clockMeridian ?? bareMeridian;
    if (!hourText || !zone) return match;
    // A bare hour ("1pm") needs a meridian. "8:30 ET" does not.
    if (!minute && !meridian) return match;
    const clock = wallClock(hourText, minute, meridian);
    if (!clock) return match;
    return zonedWallToUtc(isoDate, clock.hour, clock.minute, zoneId(zone)) ?? match;
  });
}

/** Replace Pacific/Eastern clocks in text nodes. Tags, attributes, and UTC text stay. */
export function convertTimesToUtc(html: string, isoDate: string): string {
  if (!DATE_RE.test(isoDate)) return html;
  return html.replace(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g, (chunk) => (
    chunk.startsWith('<') ? chunk : convertText(chunk, isoDate)
  ));
}
