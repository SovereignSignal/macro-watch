const PLACEHOLDER_FINDINGS = new Set(['finding', 'claim finding']);
const PLACEHOLDER_TOPICS = new Set(['claim', 'credit']);

export type ResearchPublicFields = {
  topic: string;
  finding: string;
  changed?: string;
  decision?: string;
  watch?: string;
  citations?: unknown;
};

function citationsAreExampleOnly(citations: unknown): boolean {
  if (!Array.isArray(citations) || citations.length === 0) return false;
  return citations.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const url = (item as { url?: unknown }).url;
    return typeof url === 'string' && /example\.com/i.test(url);
  });
}

/** Dummy ingest rows that must never appear on public listings or search. */
export function isPlaceholderResearch(row: ResearchPublicFields): boolean {
  const topic = row.topic.trim().toLowerCase();
  const finding = row.finding.trim().toLowerCase();
  if (PLACEHOLDER_FINDINGS.has(finding)) return true;
  if ((row.changed ?? '').trim().toLowerCase() === 'changed'
    && (row.watch ?? '').trim().toLowerCase() === 'watch trigger') {
    return true;
  }
  if (PLACEHOLDER_TOPICS.has(topic) && finding.length < 80) return true;
  return citationsAreExampleOnly(row.citations);
}

const FOOTNOTE_RE = /\[(?:\d+|[a-z])\]/gi;

/** Strip leftover numeric footnote markers after citation links are removed. */
export function publicResearchText(value: string): string {
  return value
    .replace(FOOTNOTE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
