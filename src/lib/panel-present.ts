import { formatCompactPacificTime, pacificDate } from '@/lib/format';
import { finiteSpark, type PanelRowItem, type QuoteKind } from '@/lib/panel-contract';

const ETF_LABELS: Record<string, string> = {
  'S&P 500 (SPY)': 'SPY (S&P 500 ETF)',
  'Nasdaq (QQQ)': 'QQQ (Nasdaq-100 ETF)',
  'Russell 2000 (IWM)': 'IWM (Russell 2000 ETF)',
  'Semiconductors (SMH)': 'SMH (semiconductor ETF)',
  'Japan (EWJ)': 'EWJ (Japan ETF)',
  'Europe (VGK)': 'VGK (Europe ETF)',
  'China (FXI)': 'FXI (China ETF)',
  'Emerging Markets (EEM)': 'EEM (emerging-markets ETF)',
  'Gold (GLD)': 'GLD (gold ETF)',
  'Silver (SLV)': 'SLV (silver ETF)',
  'Gold Miners (GDX)': 'GDX (gold-miners ETF)',
};

function tidyCell(value: string | null): string | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/(?:\s*,\s*)+$/g, '')
    .replace(/^(?:\s*,\s*)+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

const AS_OF_SUFFIX = /\s*(\(\s*as of\s+[^)]+\))\s*$/i;

function splitAsOf(value: string): { core: string; suffix: string | null } {
  const match = value.match(AS_OF_SUFFIX);
  if (!match || match.index === undefined) return { core: value.trim(), suffix: null };
  return {
    core: value.slice(0, match.index).trim(),
    suffix: match[1].replace(/\s+/g, ' ').trim(),
  };
}

export function panelSeriesNumber(value: string): number | null {
  const { core } = splitAsOf(value);
  return parseNumber(core);
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, '').replace(/[^\d.+-]/g, '');
  if (!normalized || normalized === '+' || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function alreadyUnitized(value: string): boolean {
  return /(?:\$|bp|t\b|b\b|m\b|%|pts)/i.test(value);
}

function withAsOf(formatted: string, suffix: string | null): string {
  return suffix ? `${formatted} ${suffix}` : formatted;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function calendarDateIn(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (named) {
    const month = MONTH_INDEX[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const mdy = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function clockIn(text: string): string | null {
  if (!/(?:T|\d{1,2}:\d{2})/.test(text)) return null;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function kindFromPhrase(text: string): QuoteKind | undefined {
  if (/\b(intraday|real-?time|last)\b/i.test(text)) return 'intraday';
  if (/\b(close|closed|eod|settle(?:ment)?)\b/i.test(text)) return 'close';
  return undefined;
}

function isClockStamp(value: string): boolean {
  return /T\d{2}:\d{2}/.test(value);
}

function monthDay(day: string): string | null {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${Number(match[2])}/${Number(match[3])}`;
}

type PeeledFreshness = { core: string; asOf?: string; quoteKind?: QuoteKind; loose?: string };

/** Pull a trailing as-of or close/intraday parenthetical off a value cell. */
function peelQuoteFreshness(value: string): PeeledFreshness {
  const match = value.match(/\s*\(([^)]{1,80})\)\s*$/);
  if (!match || match.index === undefined) return { core: value.trim() };
  const inner = match[1].replace(/\s+/g, ' ').trim();
  const phrase = inner.replace(/^as of\s+/i, '').trim();
  const quoteKind = kindFromPhrase(phrase);
  const day = calendarDateIn(phrase);
  const clock = clockIn(inner);
  if (!quoteKind && !day && !clock && !/^as of\b/i.test(inner)) return { core: value.trim() };
  return {
    core: value.slice(0, match.index).trim(),
    ...(clock ? { asOf: clock } : day ? { asOf: day } : {}),
    ...(quoteKind ? { quoteKind } : {}),
    loose: phrase,
  };
}

function formatQuoteFreshness(input: {
  asOf?: string;
  quoteKind?: QuoteKind;
  loose?: string;
}): { label: string; dateTime?: string } | null {
  const asOf = input.asOf;
  const dateOnly = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null;
  const clock = asOf && isClockStamp(asOf) ? asOf : null;
  const day = dateOnly ?? (clock ? pacificDate(clock) : null);

  if (input.quoteKind === 'close') {
    const label = day ? monthDay(day) : null;
    if (label) return { label: `close ${label}`, dateTime: day ?? undefined };
    if (input.loose && input.loose.toLowerCase() !== 'close') return { label: input.loose };
    return { label: 'close' };
  }

  if (input.quoteKind === 'intraday' || clock) {
    if (clock) {
      const label = formatCompactPacificTime(clock);
      if (label) return { label: `as of ${label}`, dateTime: new Date(clock).toISOString() };
    }
    if (input.quoteKind === 'intraday') return { label: 'intraday' };
  }

  if (day) {
    const label = monthDay(day);
    if (label) return { label: `as of ${label}`, dateTime: day };
  }
  if (input.loose) return { label: input.loose };
  return null;
}

function formatPanelValue(label: string, value: string): string {
  const { core, suffix } = splitAsOf(value);
  if (!core) return value;
  // Only inspect the numeric core. The as-of clause can contain month names
  // ("August") that would otherwise trip the `t\b` unit heuristic.
  if (alreadyUnitized(core)) return withAsOf(core, suffix);
  const n = parseNumber(core);
  if (n === null) return value;

  if (/balance sheet/i.test(label) && Math.abs(n) >= 1000) {
    return withAsOf(`$${(n / 1_000_000).toFixed(2)}T`, suffix);
  }
  if (/reverse repo|rrp/i.test(label) && Math.abs(n) < 100) {
    return withAsOf(`$${n.toFixed(2)}B`, suffix);
  }
  if (/spread/i.test(label) && Math.abs(n) < 20) {
    return withAsOf(`${Math.round(n * 100)} bp`, suffix);
  }
  return value;
}

function formatPanelChange(label: string, change: string | null): string | null {
  const tidy = tidyCell(change);
  if (!tidy) return null;
  if (/vix/i.test(label) && /^-?\d+(?:\.\d+)?$/.test(tidy)) {
    return `${tidy} pts`;
  }
  return tidy;
}

export function presentPanelRow(row: PanelRowItem): PanelRowItem {
  const label = ETF_LABELS[row.label] ?? row.label;
  const value = tidyCell(row.value) ?? row.value;
  const peeled = peelQuoteFreshness(value);
  const formatted = formatPanelValue(label, peeled.core || value);
  const spark = finiteSpark(row.spark);
  const change1d = formatPanelChange(label, row.change1d ?? null);
  const change1w = formatPanelChange(label, row.change1w ?? null);
  const structured = Boolean(row.asOf || row.quoteKind);
  const freshness = formatQuoteFreshness({
    asOf: row.asOf ?? peeled.asOf,
    quoteKind: row.quoteKind ?? peeled.quoteKind,
    loose: structured ? undefined : peeled.loose,
  });
  return {
    label,
    value: splitAsOf(formatted).core || formatted,
    change: formatPanelChange(label, row.change),
    note: tidyCell(row.note),
    ...(spark ? { spark } : {}),
    ...(change1d ? { change1d } : {}),
    ...(change1w ? { change1w } : {}),
    ...(freshness ? { freshness: freshness.label, ...(freshness.dateTime ? { freshnessAt: freshness.dateTime } : {}) } : {}),
  };
}

/** Inline `spark` wins. Otherwise use snapshot history for the original label. */
export function dashboardSpark(row: PanelRowItem, history?: Record<string, number[]>): number[] | undefined {
  const inline = finiteSpark(row.spark);
  if (inline) return inline;
  const series = history?.[row.label];
  if (!series) return undefined;
  const cleaned = series.filter((value) => Number.isFinite(value)).slice(-120);
  return cleaned.length >= 2 ? cleaned : undefined;
}

export function presentPanelRows(rows: PanelRowItem[]): PanelRowItem[] {
  return rows.map((row) => presentPanelRow(row));
}

const HORIZON_7D = /\s*\(7d\)\s*$/i;

export type HorizonChangeColumn = { key: 'change1d' | 'change1w'; label: string };

/** Columns for 1-day / 1-week changes. Empty when the snapshot did not send them. */
export function dashboardHorizonColumns(rows: PanelRowItem[]): HorizonChangeColumn[] {
  const columns: HorizonChangeColumn[] = [];
  if (rows.some((row) => row.change1d)) columns.push({ key: 'change1d', label: '1-day' });
  if (rows.some((row) => row.change1w)) columns.push({ key: 'change1w', label: '1-week' });
  return columns;
}

/** Homepage tape: per-value as-of sits beside the number, and 7d is one column label. */
export function presentDashboardRows(rows: PanelRowItem[], history?: Record<string, number[]>): {
  rows: PanelRowItem[];
  changeColumn: string;
  horizonColumns: HorizonChangeColumn[];
} {
  const presented = rows.map((row) => {
    const spark = dashboardSpark(row, history);
    const next = presentPanelRow(row);
    return spark ? { ...next, spark } : next;
  });
  const changes = presented.map((row) => row.change).filter((change): change is string => Boolean(change));
  const all7d = changes.length > 0 && changes.every((change) => HORIZON_7D.test(change));
  const horizonColumns = dashboardHorizonColumns(presented);
  if (!all7d) return { rows: presented, changeColumn: 'Change', horizonColumns };
  return {
    changeColumn: 'Change (7d)',
    horizonColumns,
    rows: presented.map((row) => ({
      ...row,
      change: row.change ? row.change.replace(HORIZON_7D, '') : row.change,
    })),
  };
}
