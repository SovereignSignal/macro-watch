import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import type { PanelKind } from '@/lib/ingest/panels';

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
