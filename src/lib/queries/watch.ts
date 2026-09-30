import type { Db } from '@/db/client';
import { parsePublishedWatch, parseUpdatedAt, type PublishedWatch } from '@/lib/public-watch';
import { getLatestPanel } from '@/lib/queries/panels';

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

/**
 * Track record and Kalshi movers come from the latest scoreboard panel
 * (`payload.scoreboard`, `payload.kalshi_movers`). `payload.rows` on that
 * panel is not part of this view.
 *
 * `updated_at` is stamped on the latest dashboard, odds_lens, and scoreboard
 * payloads. The header uses the newest of those stamps.
 */
export async function getPublishedWatch(db: Db): Promise<PublishedWatch> {
  const [dashboard, odds, scoreboard] = await Promise.all([
    getLatestPanel(db, 'dashboard'),
    getLatestPanel(db, 'odds_lens'),
    getLatestPanel(db, 'scoreboard'),
  ]);
  const board = parsePublishedWatch(scoreboard?.payload);
  const stamps = [dashboard, odds, scoreboard]
    .map((snap) => parseUpdatedAt(payloadRecord(snap?.payload)?.updated_at))
    .filter((stamp): stamp is string => stamp != null)
    .sort();
  return {
    updatedAt: stamps.at(-1) ?? null,
    scoreboard: board.scoreboard,
    kalshiMovers: board.kalshiMovers,
  };
}
