import { z } from 'zod';
import { asciiLower, equalsHashed, findHashed, hashTerm, type HashedTerm } from '@/lib/security/term-hash';

/**
 * Paywalled and email-only publishers that must not be stored or rendered.
 *
 * The built-in list ships hashed (see term-hash.ts) so this file names no
 * publishers, and it is always applied, so an env override cannot publish one.
 * `BLOCKED_PUBLISHERS` adds more case-insensitive substrings (comma-separated),
 * matched against text and link domains. One built-in entry is whole-word only,
 * so plural or longer words that contain it stay publishable; on a host it
 * matches only as the registrable name.
 */
const DEFAULT_HASHED_TERMS: HashedTerm[] = [
  { len: 13, rk: 492996390, fh: 2290168557 },
  { len: 9, rk: 1855120057, fh: 2933163550 },
  { len: 11, rk: 2600881776, fh: 1807060069 },
  { len: 12, rk: 3259899672, fh: 786995899 },
  { len: 10, rk: 131489312, fh: 812386263 },
  { len: 11, rk: 3712418880, fh: 2456508325 },
  { len: 11, rk: 1628927806, fh: 3775521137 },
  { len: 7, rk: 763749361, fh: 2103158538 },
  { len: 5, rk: 368347508, fh: 2598916313 },
  { len: 12, rk: 1107570365, fh: 2207907380 },
  { len: 11, rk: 1861683869, fh: 2272789586 },
  { len: 13, rk: 3202409522, fh: 3004341531 },
  { len: 13, rk: 264826174, fh: 3636858491 },
  { len: 9, rk: 3830507729, fh: 1812714584, word: true },
];

let defaultTerms: HashedTerm[] = DEFAULT_HASHED_TERMS;
let defaultPlainTerms: string[] = [];

/**
 * Tests only: replace the built-in list with fictional plaintext terms (hashed the
 * same way production terms are). `null` restores the built-in list.
 */
export function setBlockedPublisherDefaultsForTests(terms: string[] | null, wordTerms: string[] = []): void {
  if (terms === null) {
    defaultTerms = DEFAULT_HASHED_TERMS;
    defaultPlainTerms = [];
    return;
  }
  const words = new Set(wordTerms.map((t) => t.toLowerCase()));
  defaultPlainTerms = terms.map((t) => t.toLowerCase());
  defaultTerms = defaultPlainTerms.map((t) => hashTerm(t, words.has(t)));
}

type Entry = { len: number; hashed?: HashedTerm; plain?: string };

function envTerms(): string[] {
  return (process.env.BLOCKED_PUBLISHERS ?? '')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

/** Built-in entries plus env additions, longest first (stable for equal lengths). */
function entries(): Entry[] {
  const out: Entry[] = defaultTerms.map((t) => ({ len: t.len, hashed: t }));
  const seen = new Set<string>();
  for (const term of envTerms()) {
    if (seen.has(term) || defaultTerms.some((t) => equalsHashed(term, t))) continue;
    seen.add(term);
    out.push({ len: term.length, plain: term });
  }
  return out.sort((a, b) => b.len - a.len);
}

/**
 * Plaintext guarded terms that are known in this process: `BLOCKED_PUBLISHERS`
 * additions, plus fictional defaults when a test installed them. The hashed
 * built-in list is never returned.
 */
export function blockedPublisherTerms(): string[] {
  return [...new Set([...defaultPlainTerms, ...envTerms()])].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+);/gi, (_, token: string) => {
    const lower = token.toLowerCase();
    const code = lower.startsWith('#x')
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return '';
    }
    return String.fromCodePoint(code);
  });
}

function decodedForms(value: string): string[] {
  const forms = new Set<string>([value.toLowerCase()]);
  try {
    forms.add(decodeURIComponent(value).toLowerCase());
  } catch {
    // Not a URI-encoded string. The raw form is still checked.
  }
  forms.add(decodeEntities(value).toLowerCase());
  return [...forms];
}

function matchIn(haystack: string, entry: Entry): string | null {
  if (entry.plain !== undefined) return haystack.includes(entry.plain) ? entry.plain : null;
  const lowered = asciiLower(haystack);
  const [hit] = findHashed(lowered, entry.hashed as HashedTerm, true);
  return hit === undefined ? null : lowered.slice(hit, hit + entry.len);
}

/** First configured term found in `value`, if any. */
export function matchingBlockedPublisherTerm(value: string): string | null {
  const haystacks = decodedForms(value);
  for (const entry of entries()) {
    for (const haystack of haystacks) {
      const term = matchIn(haystack, entry);
      if (term !== null) return term;
    }
  }
  return null;
}

export function mentionsBlockedPublisher(value: string): boolean {
  return matchingBlockedPublisherTerm(value) !== null;
}

function hostHasEntry(host: string, entry: Entry): boolean {
  if (entry.plain !== undefined) return host.includes(entry.plain);
  const term = entry.hashed as HashedTerm;
  if (term.word) {
    // Whole-word in text. On a host, only the registrable name, so a longer name stays.
    const labels = host.split('.');
    const last = labels[labels.length - 1] ?? '';
    if (equalsHashed(last, term)) return true;
    return last === 'com' && labels.length >= 2 && equalsHashed(labels[labels.length - 2], term);
  }
  return findHashed(host, term, true).length > 0;
}

export function isBlockedPublisherHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return entries().some((entry) => hostHasEntry(host, entry));
}

function redactEntry(value: string, entry: Entry): string {
  if (entry.plain !== undefined) {
    if (!entry.plain) return value;
    return value.replace(new RegExp(escapeRegExp(entry.plain), 'gi'), '[redacted source]');
  }
  const hits = findHashed(asciiLower(value), entry.hashed as HashedTerm);
  let out = value;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    out = `${out.slice(0, hits[i])}[redacted source]${out.slice(hits[i] + entry.len)}`;
  }
  return out;
}

type Mention = { term: string; path: string };

function findMention(value: unknown, path: string): Mention | null {
  if (typeof value === 'string') {
    const term = matchingBlockedPublisherTerm(value);
    return term ? { term, path: path || 'payload' } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findMention(value[i], path ? `${path}.${i}` : String(i));
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const hit = findMention(child, path ? `${path}.${key}` : key);
      if (hit) return hit;
    }
  }
  return null;
}

/** Clear ingest error, or null when the payload is publishable. */
export function blockedPublisherIssue(value: unknown): string | null {
  const hit = findMention(value, '');
  if (!hit) return null;
  return `blocked publisher "${hit.term}" in ${hit.path}`;
}

const BLOCKED_URL_RE = /\bhttps?:\/\/[^\s<>'")\]]+/gi;

/** Replace publisher names and their link domains so a stored row cannot render them. */
export function redactBlockedPublisherText(value: string): string {
  let out = value.replace(BLOCKED_URL_RE, (url) => {
    const trimmed = url.replace(/[.,;:!?]+$/g, '');
    const trail = url.slice(trimmed.length);
    if (mentionsBlockedPublisher(trimmed)) return `[redacted source]${trail}`;
    try {
      if (isBlockedPublisherHost(new URL(trimmed).hostname)) return `[redacted source]${trail}`;
    } catch {
      // Not a URL. The raw token is still checked below.
    }
    return url;
  });
  for (const entry of entries()) out = redactEntry(out, entry);
  return out;
}

const BLOCKED_BLOCK_RE = /<(p|li|blockquote|tr|h[1-4]|figcaption|caption|a)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Drop HTML blocks whose text or links name a blocked publisher. */
export function stripBlockedPublisherHtml(html: string): string {
  if (entries().length === 0) return html;
  return html.replace(BLOCKED_BLOCK_RE, (block) => (mentionsBlockedPublisher(block) ? '' : block));
}

/** Reject the payload with a 422 before any field transform can strip the term. */
export function rejectBlockedPublishers<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value, ctx) => {
    const message = blockedPublisherIssue(value);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return value;
  }, schema);
}
