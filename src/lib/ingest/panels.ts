import { z } from 'zod';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';

export type PanelKind = 'dashboard' | 'odds_lens' | 'scoreboard';

export const panelSchema = z.object({
  kind: z.enum(['dashboard', 'odds_lens', 'scoreboard']),
  taken_at: z.string().datetime({ offset: true }),
  // jsonb passthrough of the pipeline's existing cache shapes (spec §3).
  payload: z.record(z.unknown()),
});

export type PanelPayload = z.infer<typeof panelSchema>;

/** Idempotent on the natural key (kind, taken_at). */
export async function upsertPanel(db: Db, p: PanelPayload): Promise<number> {
  await db
    .insert(panelSnapshots)
    .values({ kind: p.kind, takenAt: new Date(p.taken_at), payload: p.payload })
    .onConflictDoUpdate({
      target: [panelSnapshots.kind, panelSnapshots.takenAt],
      set: { payload: p.payload },
    });
  return 1;
}
