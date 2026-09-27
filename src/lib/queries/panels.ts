import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import type { PanelKind } from '@/lib/ingest/panels';
import { panelRows, panelView, type PanelView } from '@/lib/panel-contract';
import { panelSeriesNumber } from '@/lib/panel-present';

export async function getLatestPanel(
  db: Db,
  kind: PanelKind,
): Promise<{ takenAt: Date; payload: unknown } | null> {
  const rows = await db
    .select({ takenAt: panelSnapshots.takenAt, payload: panelSnapshots.payload })
    .from(panelSnapshots)
    .where(and(eq(panelSnapshots.kind, kind)))
    .orderBy(desc(panelSnapshots.takenAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Return the newest recent panel whose payload passes the complete provenance
 * contract. A newer legacy or malformed row must not shadow a valid snapshot.
 */
export async function getLatestVerifiedPanel(
  db: Db,
  kind: PanelKind,
): Promise<{ takenAt: Date; payload: unknown; view: PanelView } | null> {
  const pageSize = 20;
  let before: Date | null = null;
  while (true) {
    const rows: Array<{ takenAt: Date; payload: unknown }> = await db
      .select({ takenAt: panelSnapshots.takenAt, payload: panelSnapshots.payload })
      .from(panelSnapshots)
      .where(before === null
        ? eq(panelSnapshots.kind, kind)
        : and(eq(panelSnapshots.kind, kind), lt(panelSnapshots.takenAt, before)))
      .orderBy(desc(panelSnapshots.takenAt))
      .limit(pageSize);
    for (const row of rows) {
      const view = panelView(row.payload);
      if (view.coverage !== null) return { ...row, view };
    }
    if (rows.length < pageSize) return null;
    before = rows[rows.length - 1].takenAt;
  }
}

const DASHBOARD_HISTORY_MAX = 120;

/**
 * Numeric dashboard levels, oldest to newest, keyed by row label.
 * Series shorter than two points are omitted so a single snapshot renders
 * the table without an empty trend column.
 */
export async function getDashboardHistory(
  db: Db,
  limit = DASHBOARD_HISTORY_MAX,
): Promise<Record<string, number[]>> {
  const cap = Math.min(DASHBOARD_HISTORY_MAX, Math.max(1, Math.trunc(limit)));
  const rows = await db
    .select({ payload: panelSnapshots.payload })
    .from(panelSnapshots)
    .where(eq(panelSnapshots.kind, 'dashboard'))
    .orderBy(desc(panelSnapshots.takenAt))
    .limit(cap);
  rows.reverse();
  const series: Record<string, number[]> = {};
  for (const row of rows) {
    for (const item of panelRows(row.payload)) {
      const value = panelSeriesNumber(item.value);
      if (value === null) continue;
      (series[item.label] ??= []).push(value);
    }
  }
  const out: Record<string, number[]> = {};
  for (const [label, points] of Object.entries(series)) {
    if (points.length >= 2) out[label] = points.slice(-DASHBOARD_HISTORY_MAX);
  }
  return out;
}
