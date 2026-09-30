import 'server-only';

import { isIP } from 'node:net';
import sanitizeHtml, { type Attributes, type IOptions } from 'sanitize-html';
import { publicText } from '@/lib/public-copy';
import { isBlockedPublisherHost, mentionsBlockedPublisher, stripBlockedPublisherHtml } from '@/lib/security/blocked-publishers';

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
    'decision', 'forward-event', 'event-resolution', 'prediction-lens',
    'prediction-strip', 'prediction-strip-title', 'prediction-odds-row',
    'prediction-card', 'prediction-card-title', 'prediction-card-stats',
    'prediction-card-quality', 'prediction-card-read', 'prediction-lens-read',
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
  /^\/briefs\/\d{4}-\d{2}-\d{2}\/(?:daily|weekend|week-ahead)$/,
  /^\/catalysts$/,
  /^\/feed\.xml$/,
  /^\/map(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)?$/,
  /^\/robots\.txt$/,
  /^\/search$/,
  /^\/sitemap\.xml$/,
  /^\/research(?:\/\d{4}-\d{2}-\d{2})?$/,
];

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const NOTION_URL_RE = /\bhttps?:\/\/(?:[a-z0-9-]+\.)*notion\.(?:so|site|com)(?::\d+)?(?:\/[^\s<>'"]*)?/gi;
const PRIVATE_URL_RE = /\bhttps?:\/\/(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[[^\]]+\]|[a-z0-9.-]+\.(?:internal|local))(?::\d+)?(?:\/[^\s<>'"]*)?/gi;
const FILE_URL_RE = /\bfile:\/\/\/[^\s<>'"]+/gi;
// Boundary guards keep real filesystem leaks (`/home/ubuntu/...`) caught while
// leaving public URLs whose hostname starts with a reserved word intact
// (`https://home.treasury.gov/...` previously lost its href here).
const POSIX_PATH_RE = /(?<![\w.-])\/(?:home|Users|root|tmp|private|opt|srv|var\/(?:lib|log|run))(?![\w.-])(?:\/[^\s<>'"]*)?/g;
const WINDOWS_PATH_RE = /\b[A-Z]:\\(?:Users|Windows|Program Files|tmp)(?:\\[^\s<>'"]*)*/gi;
const PRIVATE_ENDPOINT_RE = /\/(?:api\/(?:ingest|admin|internal|private|debug|webhooks?)|admin|internal|private)(?:\/[^\s<>'"]*)?/gi;
const SAFE_ID_RE = /^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
const PRIVATE_FOOTER_RE = /(?:📄\s*)?View this brief in Notion|(?:📋\s*)?SovsClaw Macro Brief Log\s*[\u2014-]\s*all briefs/gi;
// Email chrome and private-artifact pointers that survive legacy ingest as
// dead text: the wordmark+date masthead flattens into `SOV'S MACROMonday...`
// once its divs unwrap, and Notion-pointer paragraphs lose their href but
// keep their label. Render-time sanitization removes both from stored rows.
const EMAIL_MASTHEAD_TEXT_RE = /SOV[\u2019']S MACRO\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4})?/g;
const DEAD_POINTER_TEXT_RE = /^\s*(?:Full decision memo|Research log\s*:.*)$/is;
// Legacy weekend rows carry the pointer as a bare text run (not a <p>), so a
// frame-level filter cannot see it. Bounded to the text run: stops at the
// sentence end or line end so surrounding analysis is untouched.
const DEAD_POINTER_RUN_RE = /(?:Full decision memo|Research log\s*:[^<\n]*?)(?:\.|$|\n)/gi;
// The pipeline fills an empty Prediction Market Lens cell with a lone em dash.
// Blank those cells before the em-dash pass would turn them into a stray ", ".
// A cell holding only an em dash (pipeline placeholder) or only a comma (what the
// copy pass made of that dash in briefs stored before 2026-09-02) carries nothing.
const EMPTY_DASH_CELL_RE = /<(t[dh])(\s[^>]*)?>\s*(?:\u2014|&mdash;|&#8212;|&#x2014;|,)\s*<\/\1\s*>/gi;
const PUBLIC_ORIGIN = 'https://macro-watch-production.up.railway.app';

function hasPrivateFooter(text: string): boolean {
  PRIVATE_FOOTER_RE.lastIndex = 0;
  return PRIVATE_FOOTER_RE.test(text);
}
const PRIVATE_BLOCK_RE = /(?:file:\/\/\/|\/(?:home|Users|root|tmp|private|opt|srv|var\/(?:lib|log|run))(?:\/[^\s<>'"]*)?|\b[A-Z]:\\(?:Users|Windows|Program Files|tmp))/i;

function scrubPrivateText(text: string): string {
  return publicText(text.replace(PRIVATE_FOOTER_RE, ''))
    .replace(EMAIL_MASTHEAD_TEXT_RE, '')
    .replace(DEAD_POINTER_RUN_RE, '')
    .replace(NOTION_URL_RE, '[redacted workspace link]')
    .replace(PRIVATE_URL_RE, '[redacted internal URL]')
    .replace(FILE_URL_RE, '[redacted path]')
    .replace(WINDOWS_PATH_RE, '[redacted path]')
    .replace(POSIX_PATH_RE, '[redacted path]')
    .replace(PRIVATE_ENDPOINT_RE, '[redacted endpoint]')
    .replace(EMAIL_RE, '[redacted email]');
}

function decodeTextEntities(text: string): string {
  // `mdash` decodes here so a sentence's em dash stays inside its text run;
  // left to the parser, the entity reaches textFilter as its own chunk and
  // reads as a lone placeholder.
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '\u2014',
  };
  let out = text;
  for (let pass = 0; pass < 32; pass += 1) {
    const decoded = out.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash);/gi, (_, token: string) => {
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
    if (decoded === out) return out;
    out = decoded;
  }
  // Deeply recoverable entities are safer dropped than partially decoded.
  return '';
}

export function sanitizePublicBriefText(text: string): string {
  const canonical = decodeTextEntities(text);
  const stripped = sanitizeHtml(canonical, { allowedTags: [], allowedAttributes: {} });
  return publicText(scrubPrivateText(decodeTextEntities(stripped))).replace(/\s+/g, ' ').trim();
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
      parsed = new URL(value, PUBLIC_ORIGIN);
      decodeURIComponent(parsed.pathname);
    } catch {
      return null;
    }
    if (parsed.origin !== PUBLIC_ORIGIN || parsed.username || parsed.password || parsed.search) return null;
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
  if (isBlockedPublisherHost(parsed.hostname) || mentionsBlockedPublisher(parsed.toString())) return null;
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

function cleanOrderedList(attribs: Attributes): Attributes {
  const clean: Attributes = {};
  if (/^-?\d{1,7}$/.test(attribs.start ?? '')) clean.start = attribs.start;
  if (attribs.reversed === '' || attribs.reversed?.toLowerCase() === 'reversed') clean.reversed = '';
  return clean;
}

function cleanDateTime(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return undefined;
  }
  return Number.isNaN(Date.parse(value)) ? undefined : value;
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
    ol: (tagName, attribs) => ({ tagName, attribs: cleanOrderedList(attribs) }),
    time: (tagName, attribs) => {
      const clean: Attributes = {};
      const datetime = cleanDateTime(attribs.datetime);
      if (datetime) clean.datetime = datetime;
      return { tagName, attribs: clean };
    },
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
    if (frame.tag === 'p' && DEAD_POINTER_TEXT_RE.test(frame.text)) return true;
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
 * Legacy stored forward-event cards can repeat the baseline sentence under
 * "Expected signal:" and "Why it matters:" labels (producer bug fixed
 * 2026-07-27). Render-time dedupe removes echo paragraphs inside each
 * forward-event block so archived briefs read cleanly without re-ingestion.
 */
function dedupeForwardEventEchoes(html: string): string {
  return html.replace(
    /<div class="forward-event">([\s\S]*?)<\/div>/g,
    (block, inner: string) => {
      const paragraphRe = /<p(?: class="(event-[a-z-]+)")?>([\s\S]*?)<\/p>/g;
      const seen = new Set<string>();
      const cleaned = inner.replace(paragraphRe, (paragraph, cls: string | undefined, body: string) => {
        const text = body
          .replace(/<[^>]+>/g, '')
          .replace(/^\s*(?:Baseline|Expected signal|Why it matters|Date|Resolve with|Surprise|Market impact):\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (!text) return paragraph;
        // Titles, dates, resolve-with, and sources always render; only the
        // analytic fields participate in echo suppression.
        const comparable = cls === undefined || ['event-baseline', 'event-expectation'].includes(cls);
        const isEcho = comparable && seen.has(text);
        if (comparable) seen.add(text);
        return isEcho ? '' : paragraph;
      });
      return `<div class="forward-event">${cleaned}</div>`;
    },
  );
}

function blankPlaceholderCells(html: string): string {
  return html.replace(EMPTY_DASH_CELL_RE, (_, tag: string, attribs = '') => `<${tag}${attribs}></${tag}>`);
}

const DELTA_STATUS = 'New candidate|Invalidated|(?:\\u2191\\s*)?Raised|(?:\\u2193\\s*)?Lowered|Held';
const DELTA_STATUS_EXACT = new RegExp(`^(?:${DELTA_STATUS})$`, 'i');

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeBriefText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function displayDeltaStatus(status: string): string {
  const text = status.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  if (lower === 'held') return 'Held';
  if (lower === 'invalidated') return 'Invalidated';
  if (lower === 'new candidate') return 'New candidate';
  if (lower.replace(/^\u2191\s*/, '') === 'raised') return text.includes('\u2191') ? '\u2191 Raised' : 'Raised';
  if (lower.replace(/^\u2193\s*/, '') === 'lowered') return text.includes('\u2193') ? '\u2193 Lowered' : 'Lowered';
  return text;
}

function cleanDeltaTheme(theme: string): string {
  return theme.replace(/[\s\u2014\u2013\u00b7,|:/]+$/g, '').trim();
}

/**
 * Delta rows are a theme in <strong> followed by a status in an unclassed
 * span. The em dash between them is its own text node, so the placeholder
 * pass deletes it and the span unwraps, which renders "LeverageHeld". Keep
 * the status in the same text node as the theme, separated by a middle dot.
 */
function splitDeltaTitle(innerHtml: string): { theme: string; status: string } | null {
  const strong = innerHtml.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
  if (strong) {
    const spans = [...innerHtml.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)];
    for (let i = spans.length - 1; i >= 0; i -= 1) {
      const status = visibleText(spans[i][1]);
      if (!DELTA_STATUS_EXACT.test(status)) continue;
      const theme = cleanDeltaTheme(visibleText(strong[1]));
      if (theme) return { theme, status: displayDeltaStatus(status) };
    }
  }
  const text = innerHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const separated = text.match(new RegExp(`^(.*?)\\s*(?:[\\u2014\\u2013\\u00b7]|,)\\s*(${DELTA_STATUS})$`, 'i'));
  if (separated) {
    const theme = cleanDeltaTheme(separated[1]);
    if (theme) return { theme, status: displayDeltaStatus(separated[2]) };
  }
  const glued = text.match(new RegExp(`^(.*[a-z0-9)])(${DELTA_STATUS})$`));
  if (glued) {
    const theme = cleanDeltaTheme(glued[1]);
    if (theme) return { theme, status: displayDeltaStatus(glued[2]) };
  }
  return null;
}

function separateDeltaLabels(html: string): string {
  return html.replace(
    /<p\b([^>]*\bclass\s*=\s*(["'])[^"']*\bdelta-title\b[^"']*\2[^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs: string, _quote: string, inner: string) => {
      const split = splitDeltaTitle(inner);
      if (!split) return full;
      return `<p${attrs}><strong>${escapeBriefText(split.theme)} \u00b7 ${escapeBriefText(split.status)}</strong></p>`;
    },
  );
}

/** "Decision:" lines are portfolio actions. The public footer forbids those. */
function dropPublicDecisionLines(html: string): string {
  return html.replace(/<(p|li)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => (
    /^decision\s*:/i.test(visibleText(block)) ? '' : block
  ));
}

/**
 * Sanitizes publisher HTML for public display and storage.
 *
 * This is intentionally server-only: the allowlist and privacy scrub are a
 * publication boundary, not a client-side substitute for it.
 */
export function sanitizePublicBriefHtml(dirtyHtml: string): string {
  // Canonicalize nested entities before parsing so double-encoded markup and
  // private text cannot survive as recoverable entities in stored HTML.
  // Paywalled-publisher blocks are dropped before the allowlist pass, and
  // publicText redacts any name that still reaches a text node.
  const prepared = dropPublicDecisionLines(separateDeltaLabels(decodeTextEntities(dirtyHtml)));
  const canonical = stripBlockedPublisherHtml(blankPlaceholderCells(prepared));
  return dedupeForwardEventEchoes(
    publicText(sanitizeHtml(sanitizeHtml(canonical, options), options)),
  ).trim();
}
