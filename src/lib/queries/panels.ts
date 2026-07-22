import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import type { PanelKind } from '@/lib/ingest/panels';
import { panelView, type PanelView } from '@/lib/panel-contract';

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
