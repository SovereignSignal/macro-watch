import { z } from 'zod';

/**
 * Paywalled and email-only publishers that must not be stored or rendered.
 * Bloomberg, Alpha Picks (AP Research), Alyosha (including the jj745 host),
 * Market Vibes, and The Economist are always included, so an env override
 * cannot publish them. `BLOCKED_PUBLISHERS` adds more case-insensitive
 * substrings (comma-separated), matched against text and link domains.
 * `economist` is a whole word so "economy" and "economists" stay publishable.
 */
const DEFAULT_TERMS = [
  'bloomberg.com',
  'bloomberg',
  'alphapicks',
  'alpha picks',
  'ap research',
  'alyosha',
  'jj745',
  'market vibes',
  'marketvibes',
  'the economist',
  'economist.com',
  'economist',
];

export function blockedPublisherTerms(): string[] {
  const extra = (process.env.BLOCKED_PUBLISHERS ?? '')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  return [...new Set([...DEFAULT_TERMS, ...extra])].sort((a, b) => b.length - a.length);
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

function termInHaystack(haystack: string, term: string): boolean {
  if (term === 'economist') return /\beconomist\b/i.test(haystack);
  return haystack.includes(term);
}

function termPattern(term: string): RegExp {
  const body = escapeRegExp(term);
  if (term === 'economist') return new RegExp(`\\b${body}\\b`, 'gi');
  return new RegExp(body, 'gi');
}

/** First configured term found in `value`, if any. */
export function matchingBlockedPublisherTerm(value: string): string | null {
  const haystacks = decodedForms(value);
  for (const term of blockedPublisherTerms()) {
    if (haystacks.some((haystack) => termInHaystack(haystack, term))) return term;
  }
  return null;
}

export function mentionsBlockedPublisher(value: string): boolean {
  return matchingBlockedPublisherTerm(value) !== null;
}

function hostHasTerm(host: string, term: string): boolean {
  // Whole-word in text. On a host, only the registrable name, so "economists.com" stays.
  if (term === 'economist') {
    return host === 'economist' || host.endsWith('.economist') || host === 'economist.com' || host.endsWith('.economist.com');
  }
  return host === term || host.endsWith(`.${term}`) || host.includes(term);
}

export function isBlockedPublisherHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return blockedPublisherTerms().some((term) => hostHasTerm(host, term));
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
  for (const term of blockedPublisherTerms()) {
    if (!term) continue;
    out = out.replace(termPattern(term), '[redacted source]');
  }
  return out;
}

const BLOCKED_BLOCK_RE = /<(p|li|blockquote|tr|h[1-4]|figcaption|caption|a)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Drop HTML blocks whose text or links name a blocked publisher. */
export function stripBlockedPublisherHtml(html: string): string {
  if (blockedPublisherTerms().length === 0) return html;
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
