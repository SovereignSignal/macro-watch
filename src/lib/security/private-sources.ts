import { mentionsBlockedPublisher } from '@/lib/security/blocked-publishers';

/**
 * Exact source/publication names that are email-only or paywalled even when
 * the string is too short to trip a substring block (`ap`, `economist`).
 */
const EXACT_PRIVATE_SOURCES = new Set([
  'ap',
  'alyosha',
  'ap research',
  'alpha picks',
  'alphapicks',
  'market vibes',
  'marketvibes',
  'bloomberg',
  'bloomberg.com',
  'the economist',
  'economist',
  'economist.com',
]);

const SOURCE_FIELDS = new Set([
  'source',
  'publication',
  'publisher',
  'outlet',
  'author',
  'attribution',
]);

function normalizeSource(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True when a source or publication name is one of the blocked outlets. */
export function isPrivateSourceName(value: string): boolean {
  return EXACT_PRIVATE_SOURCES.has(normalizeSource(value)) || mentionsBlockedPublisher(value);
}

/**
 * True for a call, market, or row that names a blocked outlet in its source
 * fields or in any of its own text.
 */
export function isPrivateItem(item: unknown): boolean {
  if (typeof item === 'string') return isPrivateSourceName(item);
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    if (SOURCE_FIELDS.has(key) && isPrivateSourceName(value)) return true;
    if (mentionsBlockedPublisher(value)) return true;
  }
  return false;
}

/** True when this value or anything nested in it names a blocked outlet. */
export function containsPrivate(value: unknown): boolean {
  if (typeof value === 'string') return isPrivateSourceName(value);
  if (Array.isArray(value)) return value.some((item) => containsPrivate(item));
  if (value && typeof value === 'object') {
    if (isPrivateItem(value)) return true;
    return Object.values(value as Record<string, unknown>).some((child) => containsPrivate(child));
  }
  return false;
}

/** A call id that is not one of Sovs Macro's own calls. */
export function isForeignCall(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const id = (item as Record<string, unknown>).call_id;
  if (typeof id !== 'string' || id.trim() === '') return false;
  return !id.trim().toLowerCase().startsWith('sovs-macro:');
}

function keepWatchItem(item: unknown): boolean {
  return !containsPrivate(item) && !isForeignCall(item);
}

function filterItems(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => keepWatchItem(item));
}

/**
 * Drop private calls and Kalshi rows from the scoreboard panel's watch keys.
 * `rows` is left untouched so the legacy scoreboard and dashboard tables
 * keep their existing shape.
 */
export function omitPrivateWatchItems<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  const board = record.scoreboard;
  if (board && typeof board === 'object' && !Array.isArray(board)) {
    if (isPrivateItem(board)) {
      delete record.scoreboard;
    } else {
      const next = { ...(board as Record<string, unknown>) };
      const recent = filterItems(next.recent);
      const open = filterItems(next.open);
      if (recent) next.recent = recent;
      if (open) next.open = open;
      if (next.by_source && typeof next.by_source === 'object' && !Array.isArray(next.by_source)) {
        next.by_source = Object.fromEntries(
          Object.entries(next.by_source as Record<string, unknown>).filter(([name]) => !isPrivateSourceName(name)),
        );
      }
      record.scoreboard = next;
    }
  }
  const movers = record.kalshi_movers;
  if (movers && typeof movers === 'object' && !Array.isArray(movers)) {
    if (isPrivateItem(movers)) {
      delete record.kalshi_movers;
    } else {
      const next = { ...(movers as Record<string, unknown>) };
      const items = filterItems(next.items);
      if (items) next.items = items;
      record.kalshi_movers = next;
    }
  }
  return record as T;
}
