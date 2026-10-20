import { mentionsBlockedPublisher } from '@/lib/security/blocked-publishers';
import { equalsHashed, hashTerm, type HashedTerm } from '@/lib/security/term-hash';

/**
 * Exact source/publication names that are email-only or paywalled, shipped
 * hashed (see term-hash.ts) so this file names no sources. Matching is exact on
 * the normalized name, so very short names never act as substring blocks.
 * `PRIVATE_SOURCE_NAMES` adds more exact names (comma-separated).
 */
const DEFAULT_PRIVATE_SOURCES: HashedTerm[] = [
  { len: 2, rk: 25041, fh: 1529158612 },
  { len: 7, rk: 763749361, fh: 2103158538 },
  { len: 11, rk: 1628927806, fh: 3775521137 },
  { len: 11, rk: 3712418880, fh: 2456508325 },
  { len: 10, rk: 131489312, fh: 812386263 },
  { len: 12, rk: 1107570365, fh: 2207907380 },
  { len: 11, rk: 1861683869, fh: 2272789586 },
  { len: 9, rk: 1855120057, fh: 2933163550 },
  { len: 13, rk: 492996390, fh: 2290168557 },
  { len: 13, rk: 3202409522, fh: 3004341531 },
  { len: 9, rk: 3830507729, fh: 1812714584 },
  { len: 13, rk: 264826174, fh: 3636858491 },
];

let privateSources: HashedTerm[] = DEFAULT_PRIVATE_SOURCES;

/** Tests only: replace the built-in names with fictional ones. `null` restores them. */
export function setPrivateSourceDefaultsForTests(names: string[] | null): void {
  privateSources = names === null ? DEFAULT_PRIVATE_SOURCES : names.map((n) => hashTerm(n));
}

function envPrivateSources(): Set<string> {
  return new Set(
    (process.env.PRIVATE_SOURCE_NAMES ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter((name) => name.length > 0),
  );
}

function isExactPrivateSource(name: string): boolean {
  return envPrivateSources().has(name) || privateSources.some((term) => equalsHashed(name, term));
}

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
  return isExactPrivateSource(normalizeSource(value)) || mentionsBlockedPublisher(value);
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
      const openQualitative = filterItems(next.open_qualitative);
      if (recent) next.recent = recent;
      if (open) next.open = open;
      if (openQualitative) next.open_qualitative = openQualitative;
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
