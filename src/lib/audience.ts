import markers from '@/lib/security/privacy-markers.json';
import {
  decodeBasicEntities,
  hasPrivateClass,
  parseAttributes,
  PRIVATE_CLASSES,
} from '@/lib/security/private-classes';

/**
 * Audience policy. Smart-money information (wallet counts, deployed capital,
 * positioning, flows) is visible to members only. Everything here is pure so
 * tests and components can use it; the caller decides the audience.
 */
export type Audience = 'public' | 'member' | 'private';

export function audienceFor(member: boolean): Audience {
  return member ? 'member' : 'public';
}

export { PRIVATE_CLASSES };

export const RESTRICTED_RE: readonly RegExp[] = markers.restricted_patterns.map(
  (pattern) => new RegExp(pattern, 'i'),
);

export function containsRestricted(text: string): boolean {
  if (!text) return false;
  if (RESTRICTED_RE.some((re) => re.test(text))) return true;
  if (!text.includes('&')) return false;
  const decoded = decodeBasicEntities(text);
  return RESTRICTED_RE.some((re) => re.test(decoded));
}

function isFullAccess(audience: Audience): boolean {
  return audience === 'member' || audience === 'private';
}

// ---------------------------------------------------------------------------
// Text redaction
// ---------------------------------------------------------------------------

// Keeps "U.S." / "e.g." together so an abbreviation is not read as a sentence end.
const ABBREVIATION_END = /(?:\b[A-Za-z]\.)+$/;
const CLAUSE_SPLIT = /\s+[\u00b7\u2022|]\s+/;
// Bare statistic fragments ("$719K", "24h +$8K") that travel with a wallet clause.
const STAT_CLAUSE =
  /^(?:\d+\s?[hdw]\s+)?[+\-\u2212~\u2248]?\$?[0-9][0-9.,]*\s*(?:[kmb]|thousand|million|billion|%|\u00a2)?(?:\s+(?:net|in|out))?$/i;

function splitSentences(text: string): string[] {
  // Split after . ! ? ; (plus closing quotes/brackets) only when whitespace
  // follows, so decimals such as $1.07M and 83.5\u00a2 stay intact.
  const parts = text.split(/(?<=[.!?;]["'\u201d\u2019)\]]*)\s+/);
  const out: string[] = [];
  for (const part of parts) {
    const previous = out[out.length - 1];
    if (previous !== undefined && ABBREVIATION_END.test(previous)) {
      out[out.length - 1] = `${previous} ${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
}

function redactSentence(sentence: string): string {
  const match = /^([\s\S]*?)([.!?;]+["'\u201d\u2019)\]]*)?$/.exec(sentence);
  const body = (match?.[1] ?? sentence).trim();
  const terminator = match?.[2] ?? '';
  const clauses = body.split(CLAUSE_SPLIT);
  if (clauses.length > 1 && clauses.some((clause) => containsRestricted(clause))) {
    const kept = clauses.filter(
      (clause) => !containsRestricted(clause) && !STAT_CLAUSE.test(clause.trim()),
    );
    return kept.length > 0 ? `${kept.join(' \u00b7 ')}${terminator}` : '';
  }
  return containsRestricted(sentence) ? '' : sentence;
}

/**
 * Public text keeps the macro analysis and loses every sentence (or middot /
 * parenthetical fragment) that carries wallet counts, deployed capital,
 * positioning, or flows. Members and private callers get the text unchanged.
 */
export function redactRestrictedText(text: string, audience: Audience): string {
  if (isFullAccess(audience)) return text;
  let working = text.replace(/\s+/g, ' ').trim();
  if (!working) return '';
  if (!containsRestricted(working)) return working;

  let strippedParenthetical = false;
  working = working.replace(/\([^()]*\)/g, (group) => {
    if (!containsRestricted(group)) return group;
    strippedParenthetical = true;
    return '';
  });
  if (strippedParenthetical) {
    working = working.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  const kept = splitSentences(working)
    .map((sentence) => redactSentence(sentence))
    .filter((sentence) => sentence !== '');
  const out = kept.join(' ').replace(/\s+/g, ' ').trim();
  return containsRestricted(out) ? '' : out;
}

/** Theme-card text (description, read, conditions) for a given audience. */
export function redactCardText<
  T extends {
    description?: string | null;
    read?: string | null;
    raiseConditions?: string[];
    lowerConditions?: string[];
  },
>(card: T, audience: Audience): T {
  if (isFullAccess(audience)) return card;
  const next = { ...card } as Record<string, unknown>;
  if (typeof card.description === 'string') {
    next.description = redactRestrictedText(card.description, audience);
  }
  if (typeof card.read === 'string') {
    next.read = redactRestrictedText(card.read, audience) || null;
  }
  if (Array.isArray(card.raiseConditions)) {
    next.raiseConditions = card.raiseConditions
      .map((c) => redactRestrictedText(c, audience))
      .filter((c) => c !== '');
  }
  if (Array.isArray(card.lowerConditions)) {
    next.lowerConditions = card.lowerConditions
      .map((c) => redactRestrictedText(c, audience))
      .filter((c) => c !== '');
  }
  return next as unknown as T;
}

// ---------------------------------------------------------------------------
// HTML redaction (small tokenizer + tree; unchanged markup round-trips byte for byte)
// ---------------------------------------------------------------------------

type RawNode = { kind: 'raw'; raw: string };
type TextNode = { kind: 'text'; raw: string };
type ElNode = {
  kind: 'el';
  tag: string;
  open: string;
  attrs: string;
  close: string;
  children: Node[];
  leaf: boolean;
};
type Node = RawNode | TextNode | ElNode;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'img', 'ins',
  'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);
const TEXT_BLOCKS = new Set([
  'p', 'li', 'td', 'th', 'dd', 'dt', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption', 'caption',
]);
const CELL_TAGS = new Set(['td', 'th']);
// Block boundary marker: no restricted pattern can match across it.
const BLOCK_SEP = '\u0001';

const TOKEN_RE =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function parse(html: string): Node[] {
  const root: Node[] = [];
  const stack: ElNode[] = [];
  const push = (node: Node) => (stack.length > 0 ? stack[stack.length - 1].children : root).push(node);
  let cursor = 0;
  for (const match of html.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    const full = match[0];
    if (index > cursor) push({ kind: 'text', raw: html.slice(cursor, index) });
    cursor = index + full.length;
    if (full.startsWith('<!--')) {
      push({ kind: 'raw', raw: full });
      continue;
    }
    if (full.startsWith('</')) {
      const tag = (match[1] ?? '').toLowerCase();
      let i = stack.length - 1;
      while (i >= 0 && stack[i].tag !== tag) i -= 1;
      if (i < 0) {
        push({ kind: 'raw', raw: full });
        continue;
      }
      stack[i].close = full;
      stack.length = i;
      continue;
    }
    const tag = (match[2] ?? '').toLowerCase();
    const attrs = match[3] ?? '';
    const leaf = VOID_TAGS.has(tag) || /\/\s*$/.test(attrs);
    const el: ElNode = { kind: 'el', tag, open: full, attrs, close: '', children: [], leaf };
    push(el);
    if (!leaf) stack.push(el);
  }
  if (cursor < html.length) push({ kind: 'text', raw: html.slice(cursor) });
  return root;
}

function serialize(nodes: Node[]): string {
  let out = '';
  for (const node of nodes) {
    out += node.kind === 'el' ? node.open + serialize(node.children) + node.close : node.raw;
  }
  return out;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textOf(nodes: Node[], sep: string): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') out += decodeBasicEntities(node.raw);
    else if (node.kind === 'el') {
      if (node.tag === 'br') out += sep;
      else if (INLINE_TAGS.has(node.tag)) out += textOf(node.children, sep);
      else out += sep + textOf(node.children, sep) + sep;
    }
  }
  return out;
}

function nodeMatches(nodes: Node[]): boolean {
  return containsRestricted(textOf(nodes, BLOCK_SEP));
}

function hasDescendant(el: ElNode, tag: string): boolean {
  return el.children.some((child) => child.kind === 'el' && (child.tag === tag || hasDescendant(child, tag)));
}

function isInlineOnly(nodes: Node[]): boolean {
  return nodes.every(
    (node) =>
      node.kind !== 'el' ||
      ((INLINE_TAGS.has(node.tag) || node.tag === 'br') && isInlineOnly(node.children)),
  );
}

// (a) private class blocks ---------------------------------------------------

function dropPrivateClassBlocks(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.kind === 'el') {
      if (hasPrivateClass(node.attrs)) continue;
      node.children = dropPrivateClassBlocks(node.children);
    }
    out.push(node);
  }
  return out;
}

// (b) restricted table columns -----------------------------------------------

function cellsOf(row: ElNode): ElNode[] {
  return row.children.filter(
    (child): child is ElNode => child.kind === 'el' && (child.tag === 'th' || child.tag === 'td'),
  );
}

function colspanOf(cell: ElNode): number {
  const raw = parseAttributes(cell.attrs).find((attr) => attr.name === 'colspan')?.value ?? '1';
  const span = Number.parseInt(raw, 10);
  return Number.isFinite(span) && span >= 1 ? Math.min(span, 50) : 1;
}

function collectRows(node: ElNode, out: { row: ElNode; head: boolean }[], inHead: boolean): void {
  for (const child of node.children) {
    if (child.kind !== 'el' || child.tag === 'table') continue; // nested tables handle themselves
    if (child.tag === 'tr') out.push({ row: child, head: inHead });
    else collectRows(child, out, inHead || child.tag === 'thead');
  }
}

function filterTable(table: ElNode): void {
  const rows: { row: ElNode; head: boolean }[] = [];
  collectRows(table, rows, false);
  if (rows.length === 0) return;
  const removed = new Set<number>();
  rows.forEach(({ row, head }, index) => {
    const cells = cellsOf(row);
    const isHeader = head || index === 0 || (cells.length > 0 && cells.every((cell) => cell.tag === 'th'));
    if (!isHeader) return;
    let col = 0;
    for (const cell of cells) {
      const span = colspanOf(cell);
      if (nodeMatches(cell.children)) {
        for (let k = 0; k < span; k += 1) removed.add(col + k);
      }
      col += span;
    }
  });
  if (removed.size === 0) return;
  for (const { row } of rows) {
    const dropped = new Set<ElNode>();
    let col = 0;
    for (const cell of cellsOf(row)) {
      if (removed.has(col)) dropped.add(cell);
      col += colspanOf(cell);
    }
    row.children = row.children.filter((child) => !(child.kind === 'el' && dropped.has(child)));
  }
}

function dropRestrictedColumns(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.kind !== 'el') continue;
    dropRestrictedColumns(node.children);
    if (node.tag === 'table') filterTable(node);
  }
}

// (c) text-bearing blocks -----------------------------------------------------

function hasContent(el: ElNode): boolean {
  return textOf(el.children, ' ').trim() !== '' || hasDescendant(el, 'img');
}

function redactBlocks(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.kind !== 'el') {
      out.push(node);
      continue;
    }
    if (TEXT_BLOCKS.has(node.tag) && isInlineOnly(node.children)) {
      const original = textOf(node.children, ' ').replace(/\s+/g, ' ').trim();
      const redacted = redactRestrictedText(original, 'public');
      if (redacted === original) {
        out.push(node);
        continue;
      }
      if (redacted === '') {
        // An emptied table cell keeps its shell so the columns stay aligned;
        // an emptied row is dropped by the tr rule below.
        if (CELL_TAGS.has(node.tag)) {
          node.children = [];
          out.push(node);
        }
        continue;
      }
      node.children = [{ kind: 'text', raw: escapeText(redacted) }];
      out.push(node);
      continue;
    }
    const hadCells = node.tag === 'tr' ? cellsOf(node).some(hasContent) : false;
    const itemsBefore = node.children.filter((c) => c.kind === 'el' && c.tag === 'li').length;
    node.children = redactBlocks(node.children);
    if (node.tag === 'tr') {
      const cells = cellsOf(node);
      if (cells.length === 0 || (hadCells && !cells.some(hasContent))) continue;
    }
    if (node.tag === 'table' && !hasDescendant(node, 'tr')) continue;
    if (
      (node.tag === 'ul' || node.tag === 'ol') &&
      itemsBefore > 0 &&
      !node.children.some((c) => c.kind === 'el' && c.tag === 'li')
    ) {
      continue;
    }
    out.push(node);
  }
  return out;
}

// (d) final pass --------------------------------------------------------------

function attributeLeak(el: ElNode): boolean {
  return parseAttributes(el.attrs).some(
    (attr) => ['title', 'alt', 'aria-label'].includes(attr.name) && containsRestricted(attr.value),
  );
}

function leaks(el: ElNode): boolean {
  return (
    attributeLeak(el) ||
    nodeMatches([el]) ||
    el.children.some((child) => child.kind === 'el' && leaks(child))
  );
}

function scrub(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.kind === 'raw') {
      if (!node.raw.startsWith('<!--')) out.push(node); // comments never ship publicly
      continue;
    }
    if (node.kind === 'text') {
      const text = decodeBasicEntities(node.raw);
      if (!containsRestricted(text)) {
        out.push(node);
        continue;
      }
      const redacted = redactRestrictedText(text, 'public');
      if (redacted) out.push({ kind: 'text', raw: escapeText(redacted) });
      continue;
    }
    if (!leaks(node)) {
      out.push(node);
      continue;
    }
    if (attributeLeak(node)) continue;
    node.children = scrub(node.children);
    // Still matching means the phrase spans children: remove this (smallest enclosing) element.
    if (leaks(node)) continue;
    out.push(node);
  }
  return out;
}

/**
 * Public HTML: removes private-class blocks (nested, quoted or unquoted class
 * attributes), strips restricted table columns, redacts restricted sentences
 * in text blocks, and finally guarantees no restricted pattern remains in
 * visible text. Members and private callers get the HTML unchanged.
 */
export function redactRestrictedHtml(html: string, audience: Audience): string {
  if (isFullAccess(audience)) return html;
  if (!html) return html;
  let tree = parse(html);
  tree = dropPrivateClassBlocks(tree);
  dropRestrictedColumns(tree);
  tree = redactBlocks(tree);
  tree = scrub(tree);
  if (nodeMatches(tree)) return '';
  return serialize(tree);
}
