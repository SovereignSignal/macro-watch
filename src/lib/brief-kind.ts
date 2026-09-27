export const BRIEF_KINDS = ['daily', 'weekend', 'week-ahead'] as const;

export type BriefKind = (typeof BRIEF_KINDS)[number];

export type BriefKindBadge = { label: string; className: string };

const WEEK_AHEAD_RE = /week ahead/i;

export function isBriefKind(value: string): value is BriefKind {
  return (BRIEF_KINDS as readonly string[]).includes(value);
}

/**
 * Public permalink slug. A legacy weekend row whose subject is a week-ahead
 * note resolves to `week-ahead` so older sends and the new kind share a URL.
 */
export function briefPermalinkKind(kind: string, subject: string): BriefKind {
  if (kind === 'week-ahead' || WEEK_AHEAD_RE.test(subject)) return 'week-ahead';
  if (kind === 'weekend') return 'weekend';
  return 'daily';
}

export function briefPath(date: string, kind: string, subject: string): string {
  return `/briefs/${date}/${briefPermalinkKind(kind, subject)}`;
}

/** True when this row should render at `/briefs/<date>/<kind>`. */
export function briefMatchesKind(row: { kind: string; subject: string }, kind: string): boolean {
  if (!isBriefKind(kind)) return false;
  if (row.kind === kind) return true;
  return briefPermalinkKind(row.kind, row.subject) === kind;
}

export function pickBriefForKind<T extends { kind: string; subject: string }>(
  rows: T[],
  kind: string,
): T | null {
  if (!isBriefKind(kind)) return null;
  const matches = rows.filter((row) => briefMatchesKind(row, kind));
  return matches.find((row) => row.kind === kind) ?? matches[0] ?? null;
}

export function parseBriefKindFilter(value: string | string[] | undefined): BriefKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && isBriefKind(raw) ? raw : null;
}

/** Weekend and week-ahead notes are badged; daily is badged so the archive can be scanned. */
export function briefKindBadge(kind: string, subject: string): BriefKindBadge | null {
  const slug = briefPermalinkKind(kind, subject);
  if (slug === 'week-ahead') return { label: 'Week ahead', className: 'badge badge-weekend' };
  if (slug === 'weekend') return { label: 'Weekend review', className: 'badge badge-weekend' };
  if (slug === 'daily') return { label: 'Daily', className: 'badge' };
  return null;
}
