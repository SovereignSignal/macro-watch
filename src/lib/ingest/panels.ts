import { z } from 'zod';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import { publicValue } from '@/lib/public-copy';
import { omitPrivateWatchItems } from '@/lib/security/private-sources';

export type PanelKind = 'dashboard' | 'odds_lens' | 'scoreboard';

export const panelSchema = z.object({
  kind: z.enum(['dashboard', 'odds_lens', 'scoreboard']),
  taken_at: z.string().datetime({ offset: true }),
  // jsonb passthrough. The scoreboard payload may also carry updated_at,
  // scoreboard, and kalshi_movers beside rows. Dashboard and odds_lens may
  // carry updated_at. Older posts omit those keys.
  payload: z.record(z.unknown()),
});

export type PanelPayload = z.infer<typeof panelSchema>;

/** Idempotent on the natural key (kind, taken_at). */
export async function upsertPanel(db: Db, p: PanelPayload): Promise<number> {
  const filtered = omitPrivateWatchItems(p.payload);
  const payload = publicValue(
    filtered && typeof filtered === 'object' ? filtered : {},
  ) as Record<string, unknown>;
  await db
    .insert(panelSnapshots)
    .values({ kind: p.kind, takenAt: new Date(p.taken_at), payload })
    .onConflictDoUpdate({
      target: [panelSnapshots.kind, panelSnapshots.takenAt],
      set: { payload },
    });
  return 1;
}
