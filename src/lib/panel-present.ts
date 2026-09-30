import { finiteSpark, type PanelRowItem } from '@/lib/panel-contract';

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

export type PresentPanelOptions = {
  /** Drop a repeated as-of clause when the panel header already carries freshness. */
  omitAsOf?: boolean;
};

export function presentPanelRow(row: PanelRowItem, options?: PresentPanelOptions): PanelRowItem {
  const label = ETF_LABELS[row.label] ?? row.label;
  const value = tidyCell(row.value) ?? row.value;
  const formatted = formatPanelValue(label, value);
  const spark = finiteSpark(row.spark);
  const change1d = formatPanelChange(label, row.change1d ?? null);
  const change1w = formatPanelChange(label, row.change1w ?? null);
  return {
    label,
    value: options?.omitAsOf ? (splitAsOf(formatted).core || formatted) : formatted,
    change: formatPanelChange(label, row.change),
    note: tidyCell(row.note),
    ...(spark ? { spark } : {}),
    ...(change1d ? { change1d } : {}),
    ...(change1w ? { change1w } : {}),
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

export function presentPanelRows(rows: PanelRowItem[], options?: PresentPanelOptions): PanelRowItem[] {
  return rows.map((row) => presentPanelRow(row, options));
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

/** Homepage tape: one as-of in the header, one 7d label on the column. */
export function presentDashboardRows(rows: PanelRowItem[], history?: Record<string, number[]>): {
  rows: PanelRowItem[];
  changeColumn: string;
  horizonColumns: HorizonChangeColumn[];
} {
  const presented = rows.map((row) => {
    const spark = dashboardSpark(row, history);
    const next = presentPanelRow(row, { omitAsOf: true });
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
