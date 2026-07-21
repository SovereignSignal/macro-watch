import { publicText } from '@/lib/public-copy';

export type PanelRowItem = {
  label: string;
  value: string;
  change: string | null;
  note: string | null;
};

/**
 * Panel payloads are a jsonb passthrough of the pipeline's cache shapes
 * (spec §3). The rendering contract with the publisher: payload.rows is an
 * array of { label, value, change?, note? }. Anything malformed is skipped;
 * a bad payload renders as an empty panel, never a broken page.
 */
export function panelRows(payload: unknown): PanelRowItem[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const rows = (payload as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  const out: PanelRowItem[] = [];
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const { label, value, change, note } = r as Record<string, unknown>;
    if (typeof label !== 'string' || label.length === 0) continue;
    out.push({
      label: publicText(label),
      value: typeof value === 'string' ? publicText(value) : typeof value === 'number' ? String(value) : 'n/a',
      change: typeof change === 'string' ? publicText(change) : null,
      note: typeof note === 'string' ? publicText(note) : null,
    });
  }
  return out;
}

export function panelCoverage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const selected = record.selected_count;
  const source = record.source_count;
  const schema = record.source_schema_version;
  if (!Number.isInteger(selected) || !Number.isInteger(source)) return null;
  if ((selected as number) < 0 || (source as number) < (selected as number)) return null;
  const schemaLabel = schema === 2 ? 'schema-v2 ' : '';
  return `${selected} selected from ${source} verified ${schemaLabel}AMS signals`;
}
