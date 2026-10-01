import { publicText } from '@/lib/public-copy';

export type QuoteKind = 'intraday' | 'close';

export type PanelRowItem = {
  label: string;
  value: string;
  change: string | null;
  note: string | null;
  /** Optional history from the pipeline. Absent rows fall back to panel snapshots. */
  spark?: number[];
  /**
   * 1-day and 1-week changes from ingest fields `change_1d` and `change_1w`.
   * Omitted when the snapshot did not send them.
   */
  change1d?: string;
  change1w?: string;
  /**
   * Per-value as-of. A calendar date stays `YYYY-MM-DD`. A clock time is ISO.
   * Omitted when the snapshot did not send one.
   */
  asOf?: string;
  /** Intraday versus close. Omitted when the snapshot did not send a kind. */
  quoteKind?: QuoteKind;
  /** Subtle display label derived at present time, e.g. "as of 7:14a PDT". */
  freshness?: string;
  /** ISO instant or YYYY-MM-DD for the freshness label's datetime attribute. */
  freshnessAt?: string;
};

const AS_OF_KEYS = ['as_of', 'asOf', 'observed_at', 'quote_time', 'quote_as_of', 'price_as_of'] as const;
const QUOTE_KIND_KEYS = ['quote_kind', 'price_kind', 'value_kind', 'session', 'kind'] as const;

function normalizeQuoteKind(value: unknown): QuoteKind | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (['intraday', 'live', 'last', 'quote', 'realtime', 'real time'].includes(text)) return 'intraday';
  if (['close', 'closed', 'eod', 'official', 'prior close', 'settle', 'settlement'].includes(text)) return 'close';
  return undefined;
}

function parseAsOfValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function asOfFrom(raw: Record<string, unknown>): string | undefined {
  for (const key of AS_OF_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key) || raw[key] == null) continue;
    const parsed = parseAsOfValue(raw[key]);
    if (parsed) return parsed;
  }
  return undefined;
}

function quoteKindFrom(raw: Record<string, unknown>): QuoteKind | undefined {
  for (const key of QUOTE_KIND_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const kind = normalizeQuoteKind(raw[key]);
    if (kind) return kind;
  }
  return undefined;
}

function optionalChangeField(raw: Record<string, unknown>, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(raw, key) || raw[key] == null) return undefined;
  const value = raw[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) return `+${value}`;
    return String(value);
  }
  if (typeof value !== 'string') return undefined;
  const text = publicText(value).trim();
  return text.length > 0 ? text : undefined;
}

const SPARK_MAX = 120;

/** Keep a spark only when it is two or more finite numbers, capped at 120. */
export function finiteSpark(values: unknown): number[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const slice = values.slice(-SPARK_MAX);
  const nums: number[] = [];
  for (const value of slice) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    nums.push(value);
  }
  return nums.length >= 2 ? nums : undefined;
}

export type PanelView = {
  rows: PanelRowItem[];
  coverage: string | null;
};

/**
 * Parse rows and provenance atomically from an untrusted jsonb panel payload.
 * Malformed rows are skipped for rendering and invalidate the coverage claim.
 * "Verified" is emitted only when schema, hash, counts, and every source row agree.
 */
export function panelView(payload: unknown): PanelView {
  if (typeof payload !== 'object' || payload === null) return { rows: [], coverage: null };
  const record = payload as Record<string, unknown>;
  const rawRows = record.rows;
  const rows: PanelRowItem[] = [];
  let rowsValid = Array.isArray(rawRows);
  if (Array.isArray(rawRows)) {
    for (const raw of rawRows) {
      if (typeof raw !== 'object' || raw === null) {
        rowsValid = false;
        continue;
      }
      const { label, value, change, note } = raw as Record<string, unknown>;
      const valueValid = typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
      const changeValid = change === undefined || change === null || typeof change === 'string';
      const noteValid = note === undefined || note === null || typeof note === 'string';
      if (typeof label !== 'string' || label.trim().length === 0 || !valueValid || !changeValid || !noteValid) {
        rowsValid = false;
        continue;
      }
      const rowRecord = raw as Record<string, unknown>;
      const spark = finiteSpark(rowRecord.spark);
      const change1d = optionalChangeField(rowRecord, 'change_1d');
      const change1w = optionalChangeField(rowRecord, 'change_1w');
      const asOf = asOfFrom(rowRecord);
      const quoteKind = quoteKindFrom(rowRecord);
      rows.push({
        label: publicText(label),
        value: typeof value === 'string' ? publicText(value) : typeof value === 'number' ? String(value) : 'n/a',
        change: typeof change === 'string' ? publicText(change) : null,
        note: typeof note === 'string' ? publicText(note) : null,
        ...(spark ? { spark } : {}),
        ...(change1d ? { change1d } : {}),
        ...(change1w ? { change1w } : {}),
        ...(asOf ? { asOf } : {}),
        ...(quoteKind ? { quoteKind } : {}),
      });
    }
  }

  const selected = record.selected_count;
  const source = record.source_count;
  const sourceHash = record.source_sha256;
  const labels = new Set(rows.map((row) => row.label));
  const verified = (
    rowsValid
    && record.source_schema_version === 2
    && typeof sourceHash === 'string'
    && /^[a-f0-9]{64}$/i.test(sourceHash)
    && Number.isSafeInteger(selected)
    && Number.isSafeInteger(source)
    && (selected as number) >= 0
    && (source as number) >= (selected as number)
    && (selected as number) === rows.length
    && labels.size === rows.length
  );
  return {
    rows,
    coverage: verified
      ? `${selected} selected from ${source} verified schema-v2 AMS signals`
      : null,
  };
}

export function panelRows(payload: unknown): PanelRowItem[] {
  return panelView(payload).rows;
}

export function panelCoverage(payload: unknown): string | null {
  return panelView(payload).coverage;
}
