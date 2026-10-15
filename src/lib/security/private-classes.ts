import markers from '@/lib/security/privacy-markers.json';

/**
 * Pure helpers shared by the ingest-time stripper (public-brief-html.ts) and
 * the render-time audience policy (audience.ts). No server-only import so
 * components and tests can use it. Derived directly from the shared marker
 * file, so there is no import cycle with audience.ts.
 */
export const PRIVATE_CLASSES: ReadonlySet<string> = new Set(
  markers.private_classes.map((name) => name.toLowerCase()),
);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the entities a browser would decode in text and attribute values. */
export function decodeBasicEntities(value: string): string {
  if (!value.includes('&')) return value;
  let out = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, token: string) => {
      const lower = token.toLowerCase();
      if (lower.startsWith('#')) {
        const codePoint = lower.startsWith('#x')
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10);
        return Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : '';
      }
      return NAMED_ENTITIES[lower] ?? match;
    });
    if (next === out) return out;
    out = next;
  }
  return out;
}

export type ParsedAttribute = { name: string; value: string };

/**
 * Attribute scanner for the inside of a start tag. Handles double-quoted,
 * single-quoted, and unquoted values, whitespace around `=`, and attributes
 * glued together without whitespace (`id="a"class="b"`).
 */
export function parseAttributes(attrs: string): ParsedAttribute[] {
  const out: ParsedAttribute[] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of attrs.matchAll(re)) {
    const unquoted = match[4] !== undefined ? match[4].replace(/\/+$/, '') : undefined;
    out.push({
      name: match[1].toLowerCase(),
      value: decodeBasicEntities(match[2] ?? match[3] ?? unquoted ?? ''),
    });
  }
  return out;
}

/** Every class token across every class attribute, lower-cased. */
export function classTokens(attrs: string): string[] {
  const tokens: string[] = [];
  for (const attr of parseAttributes(attrs)) {
    if (attr.name !== 'class') continue;
    for (const token of attr.value.split(/\s+/)) {
      if (token) tokens.push(token.toLowerCase());
    }
  }
  return tokens;
}

/** Exact token match against the shared private-class list. */
export function hasPrivateClass(attrs: string): boolean {
  return classTokens(attrs).some((token) => PRIVATE_CLASSES.has(token));
}
