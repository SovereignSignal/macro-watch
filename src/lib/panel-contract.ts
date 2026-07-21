import { publicText } from '@/lib/public-copy';

export type PanelRowItem = {
  label: string;
  value: string;
  change: string | null;
  note: string | null;
};

export type PanelView = {
  rows: PanelRowItem[];
  coverage: string | null;
};

/**
 * Parse rows and provenance atomically from an untrusted jsonb panel payload.
 * Malformed rows are skipped. "Verified" coverage is emitted only when schema,
 * source hash, counts, and the defensively rendered row count all agree.
 */
export function panelView(payload: unknown): PanelView {
  if (typeof payload !== 'object' || payload === null) return { rows: [], coverage: null };
  const record = payload as Record<string, unknown>;
  const rawRows = record.rows;
  const rows: PanelRowItem[] = [];
  if (Array.isArray(rawRows)) {
    for (const raw of rawRows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const { label, value, change, note } = raw as Record<string, unknown>;
      if (typeof label !== 'string' || label.length === 0) continue;
      rows.push({
        label: publicText(label),
        value: typeof value === 'string' ? publicText(value) : typeof value === 'number' ? String(value) : 'n/a',
        change: typeof change === 'string' ? publicText(change) : null,
        note: typeof note === 'string' ? publicText(note) : null,
      });
    }
  }

  const selected = record.selected_count;
  const source = record.source_count;
  const sourceHash = record.source_sha256;
  const labels = new Set(rows.map((row) => row.label));
  const verified = (
    record.source_schema_version === 2
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
