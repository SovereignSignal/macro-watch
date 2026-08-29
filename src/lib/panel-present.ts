import type { PanelRowItem } from '@/lib/panel-contract';

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

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, '').replace(/[^\d.+-]/g, '');
  if (!normalized || normalized === '+' || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function alreadyUnitized(value: string): boolean {
  return /(?:\$|bp|t\b|b\b|m\b|%|pts)/i.test(value);
}

function formatPanelValue(label: string, value: string): string {
  if (alreadyUnitized(value)) return value;
  const n = parseNumber(value);
  if (n === null) return value;

  if (/balance sheet/i.test(label) && Math.abs(n) >= 1000) {
    return `$${(n / 1_000_000).toFixed(2)}T`;
  }
  if (/reverse repo|rrp/i.test(label) && Math.abs(n) < 100) {
    return `$${n.toFixed(2)}B`;
  }
  if (/spread/i.test(label) && Math.abs(n) < 20) {
    return `${Math.round(n * 100)} bp`;
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
  return {
    label,
    value: formatPanelValue(label, value),
    change: formatPanelChange(label, row.change),
    note: tidyCell(row.note),
  };
}

export function presentPanelRows(rows: PanelRowItem[]): PanelRowItem[] {
  return rows.map(presentPanelRow);
}
