import 'server-only';

import { isIP } from 'node:net';
import sanitizeHtml, { type Attributes, type IOptions } from 'sanitize-html';
import { publicText } from '@/lib/public-copy';

const ALLOWED_TAGS = [
  'section',
  'aside',
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
    'daily-front', 'front-line', 'front-quiet',
  ]),
  span: new Set(['event-theme', 'open']),
  aside: new Set(['sweep-finding']),
  section: new Set(['convective-front']),
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
const PUBLIC_ORIGIN = 'https://web-production-cb2e81.up.railway.app';
