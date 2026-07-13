import 'server-only';

import { isIP } from 'node:net';
import sanitizeHtml, { type Attributes, type IOptions } from 'sanitize-html';

const ALLOWED_TAGS = [
  'section',
  'div',
  'span',
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'sup',
  'sub',
  'code',
  'pre',
  'time',
  'cite',
  'figure',
  'figcaption',
  'img',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
] as const;

const ALLOWED_CLASSES: Record<string, ReadonlySet<string>> = {
  div: new Set([
    'section', 'insight', 'disagreement', 'sources', 'delta-block',
    'decision', 'forward-event', 'event-resolution',
  ]),
  p: new Set([
    'date', 'signal', 'small', 'insight-title', 'delta-summary',
    'delta-title', 'delta-evidence', 'delta-next', 'event-title',
    'event-baseline', 'event-expectation', 'event-resolve', 'event-actual',
    'event-surprise', 'event-theme-impact', 'event-source',
  ]),
  span: new Set(['event-theme', 'open']),
};

const NON_TEXT_TAGS = [
  'script',
  'style',
  'title',
  'head',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
  'textarea',
  'option',
  'noscript',
  'noembed',
  'noframes',
  'xmp',
];

const SAFE_RELATIVE_ROUTES = [
  /^\/$/,
  /^\/about$/,
  /^\/accountability$/,
  /^\/briefs(?:\/\d{4}-\d{2}-\d{2})?$/,
  /^\/catalysts$/,
  /^\/feed\.xml$/,
  /^\/map(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/,
  /^\/search$/,
];

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const NOTION_URL_RE = /\bhttps?:\/\/(?:[a-z0-9-]+\.)*notion\.(?:so|site|com)(?::\d+)?(?:\/[^\s<>'"]*)?/gi;
const PRIVATE_URL_RE = /\bhttps?:\/\/(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[[^\]]+\]|[a-z0-9.-]+\.(?:internal|local))(?::\d+)?(?:\/[^\s<>'"]*)?/gi;
const FILE_URL_RE = /\bfile:\/\/\/[^\s<>'"]+/gi;
const POSIX_PATH_RE = /\/(?:home|Users|root|tmp|private|opt|srv|var\/(?:lib|log|run))(?:\/[^\s<>'"]*)?/g;
const WINDOWS_PATH_RE = /\b[A-Z]:\\(?:Users|Windows|Program Files|tmp)(?:\\[^\s<>'"]*)*/gi;
const PRIVATE_ENDPOINT_RE = /\/(?:api\/(?:ingest|admin|internal|private|debug|webhooks?)|admin|internal|private)(?:\/[^\s<>'"]*)?/gi;
const SAFE_ID_RE = /^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
const PRIVATE_FOOTER_RE = /(?:📄\s*)?View this brief in Notion|(?:📋\s*)?SovsClaw Macro Brief Log\s*[—-]\s*all briefs/gi;

function hasPrivateFooter(text: string): boolean {
  PRIVATE_FOOTER_RE.lastIndex = 0;
  return PRIVATE_FOOTER_RE.test(text);
}
const PRIVATE_BLOCK_RE = /(?:file:\/\/\/|\/(?:home|Users|root|tmp|private|opt|srv|var\/(?:lib|log|run))(?:\/[^\s<>'"]*)?|\b[A-Z]:\\(?:Users|Windows|Program Files|tmp))/i;

function scrubPrivateText(text: string): string {
  return text
    .replace(PRIVATE_FOOTER_RE, '')
    .replace(NOTION_URL_RE, '[redacted workspace link]')
    .replace(PRIVATE_URL_RE, '[redacted internal URL]')
    .replace(FILE_URL_RE, '[redacted path]')
    .replace(WINDOWS_PATH_RE, '[redacted path]')
    .replace(POSIX_PATH_RE, '[redacted path]')
    .replace(PRIVATE_ENDPOINT_RE, '[redacted endpoint]')
    .replace(EMAIL_RE, '[redacted email]');
}

function decodeTextEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  let out = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = out.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, token: string) => {
      const lower = token.toLowerCase();
      const codePoint = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : lower.startsWith('#')
          ? Number.parseInt(lower.slice(1), 10)
          : null;
      if (codePoint !== null) {
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : '';
      }
      return named[lower] ?? '';
    });
    if (decoded === out) break;
    out = decoded;
  }
  return out;
}

export function sanitizePublicBriefText(text: string): string {
  const canonical = decodeTextEntities(text);
  const stripped = sanitizeHtml(canonical, { allowedTags: [], allowedAttributes: {} });
  return scrubPrivateText(decodeTextEntities(stripped)).replace(/\s+/g, ' ').trim();
}

function isPrivateHostname(rawHostname: string): boolean {
  let hostname = rawHostname.toLowerCase().replace(/\.$/, '');
  if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1);
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '0.0.0.0'
  ) {
    return true;
  }

  if (
    hostname === 'notion.so' || hostname.endsWith('.notion.so') ||
    hostname === 'notion.site' || hostname.endsWith('.notion.site') ||
    hostname === 'notion.com' || hostname.endsWith('.notion.com')
  ) {
    return true;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split('.').map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  if (ipVersion === 6) {
    return (
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('::ffff:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      /^fe[89ab]/.test(hostname)
    );
  }
  return false;
}

function safeFragment(fragment: string): boolean {
  return fragment === '' || /^#[A-Za-z][A-Za-z0-9_:.-]{0,127}$/.test(fragment);
}

function normalizePublicUrl(rawValue: string | undefined, allowImagePath = false): string | null {
  if (!rawValue || /[\u0000-\u001f\u007f\\]/.test(rawValue)) return null;
  const value = rawValue.trim();
  if (!value || value.startsWith('//') || scrubPrivateText(value) !== value) return null;

  if (value.startsWith('#')) return safeFragment(value) ? value : null;

  if (value.startsWith('/')) {
    let parsed: URL;
    try {
      parsed = new URL(value, 'https://macro.watch');
      decodeURIComponent(parsed.pathname);
    } catch {
      return null;
    }
    if (parsed.origin !== 'https://macro.watch' || parsed.username || parsed.password || parsed.search) return null;
    if (!safeFragment(parsed.hash)) return null;
    const safeRoute = SAFE_RELATIVE_ROUTES.some((route) => route.test(parsed.pathname));
    const safeImage = allowImagePath && /^\/images\/[A-Za-z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname);
    return safeRoute || safeImage ? `${parsed.pathname}${parsed.hash}` : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isPrivateHostname(parsed.hostname)) return null;
  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(parsed.toString());
  } catch {
    return null;
  }
  if (scrubPrivateText(decodedUrl) !== decodedUrl) return null;
  return parsed.toString();
}

function cleanId(attribs: Attributes): Attributes {
  return attribs.id && SAFE_ID_RE.test(attribs.id) ? { id: attribs.id } : {};
}

function cleanClass(tag: string, attribs: Attributes): Attributes {
  const allowed = ALLOWED_CLASSES[tag];
  if (!allowed || !attribs.class) return {};
  const classes = [...new Set(attribs.class.split(/\s+/).filter((token) => allowed.has(token)))];
  return classes.length > 0 ? { class: classes.join(' ') } : {};
}

function cleanSpan(value: string | undefined): string | undefined {
  if (!value || !/^\d{1,2}$/.test(value)) return undefined;
  const span = Number(value);
  return span >= 1 && span <= 20 ? String(span) : undefined;
}

const options: IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    section: ['id'],
    div: ['class'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
    li: ['id'],
    p: ['class'],
    span: ['class'],
    a: ['href', 'title', 'rel'],
    blockquote: ['cite'],
    ol: ['start', 'reversed'],
    time: ['datetime'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'referrerpolicy'],
    table: ['class'],
    col: ['span'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: NON_TEXT_TAGS,
  nestingLimit: 40,
  parseStyleAttributes: false,
  transformTags: {
    section: (tagName, attribs) => ({ tagName, attribs: cleanId(attribs) }),
    div: (tagName, attribs) => ({ tagName, attribs: cleanClass(tagName, attribs) }),
    h2: (tagName, attribs) => ({ tagName, attribs: cleanId(attribs) }),
    h3: (tagName, attribs) => ({ tagName, attribs: cleanId(attribs) }),
    h4: (tagName, attribs) => ({ tagName, attribs: cleanId(attribs) }),
    li: (tagName, attribs) => ({ tagName, attribs: cleanId(attribs) }),
    p: (tagName, attribs) => ({ tagName, attribs: cleanClass(tagName, attribs) }),
    span: (tagName, attribs) => ({ tagName, attribs: cleanClass(tagName, attribs) }),
    a: (tagName, attribs) => {
      const href = normalizePublicUrl(attribs.href);
      if (!href) return { tagName, attribs: {} };
      const clean: Attributes = { href };
      if (attribs.title) clean.title = scrubPrivateText(attribs.title).slice(0, 300);
      if (href.startsWith('https://')) clean.rel = 'noopener noreferrer';
      return { tagName, attribs: clean };
    },
    blockquote: (tagName, attribs) => {
      const cite = normalizePublicUrl(attribs.cite);
      const clean: Attributes = cite ? { cite } : {};
      return { tagName, attribs: clean };
    },
    table: (tagName) => ({ tagName, attribs: { class: 'data-table' } }),
    col: (tagName, attribs) => {
      const span = cleanSpan(attribs.span);
      const clean: Attributes = span ? { span } : {};
      return { tagName, attribs: clean };
    },
    th: (tagName, attribs) => {
      const clean: Attributes = {};
      if (['row', 'col', 'rowgroup', 'colgroup'].includes(attribs.scope)) clean.scope = attribs.scope;
      const colspan = cleanSpan(attribs.colspan);
      const rowspan = cleanSpan(attribs.rowspan);
      if (colspan) clean.colspan = colspan;
      if (rowspan) clean.rowspan = rowspan;
      return { tagName, attribs: clean };
    },
    td: (tagName, attribs) => {
      const clean: Attributes = {};
      const colspan = cleanSpan(attribs.colspan);
      const rowspan = cleanSpan(attribs.rowspan);
      if (colspan) clean.colspan = colspan;
      if (rowspan) clean.rowspan = rowspan;
      return { tagName, attribs: clean };
    },
    img: (tagName, attribs) => {
      const src = normalizePublicUrl(attribs.src, true);
      if (!src) return { tagName, attribs: {} };
      const clean: Attributes = {
        src,
        alt: scrubPrivateText(attribs.alt ?? '').slice(0, 300),
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      };
      if (attribs.title) clean.title = scrubPrivateText(attribs.title).slice(0, 300);
      if (/^\d{1,4}$/.test(attribs.width ?? '')) clean.width = attribs.width;
      if (/^\d{1,4}$/.test(attribs.height ?? '')) clean.height = attribs.height;
      return { tagName, attribs: clean };
    },
  },
  exclusiveFilter: (frame) => {
    if (frame.tag === 'h1') return true;
    if (frame.tag === 'div' && hasPrivateFooter(frame.text)) return true;
    if (
      ['section', 'p', 'li', 'blockquote', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr'].includes(frame.tag) &&
      (hasPrivateFooter(frame.text) || PRIVATE_BLOCK_RE.test(frame.text))
    ) {
      return true;
    }
    if (frame.tag === 'a' && !frame.attribs.href) return 'excludeTag';
    if (['div', 'span'].includes(frame.tag) && !frame.attribs.class) return 'excludeTag';
    if (frame.tag === 'img' && !frame.attribs.src) return true;
    return false;
  },
  textFilter: (text) => scrubPrivateText(text),
};

/**
 * Sanitizes publisher HTML for public display and storage.
 *
 * This is intentionally server-only: the allowlist and privacy scrub are a
 * publication boundary, not a client-side substitute for it.
 */
export function sanitizePublicBriefHtml(dirtyHtml: string): string {
  // Canonicalize nested entities before parsing so double-encoded markup and
  // private text cannot survive as recoverable entities in stored HTML.
  const canonical = decodeTextEntities(dirtyHtml);
  return sanitizeHtml(sanitizeHtml(canonical, options), options).trim();
}
