import type { Db } from '@/db/client';
import { parsePublishedWatch, parseUpdatedAt, type PublishedWatch } from '@/lib/public-watch';
import { panelView } from '@/lib/panel-contract';
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
 * payloads. The header uses the newest of those stamps, but an odds post only
 * counts when it actually refreshed the odds: it passes verification and is
 * not an explicit stale or unavailable state. Otherwise the header claimed a
 * fresh update while the odds panel showed numbers weeks old.
 */
export function oddsRefreshedPayload(payload: unknown): boolean {
  const status = payloadRecord(payload)?.status;
  if (status === 'stale' || status === 'unavailable') return false;
  return panelView(payload).coverage !== null;
}

export async function getPublishedWatch(db: Db): Promise<PublishedWatch> {
  const [dashboard, odds, scoreboard] = await Promise.all([
    getLatestPanel(db, 'dashboard'),
    getLatestPanel(db, 'odds_lens'),
    getLatestPanel(db, 'scoreboard'),
  ]);
  const board = parsePublishedWatch(scoreboard?.payload);
  const oddsRefreshed = odds !== null && oddsRefreshedPayload(odds.payload);
  const stamps = [dashboard, oddsRefreshed ? odds : null, scoreboard]
    .map((snap) => parseUpdatedAt(payloadRecord(snap?.payload)?.updated_at))
    .filter((stamp): stamp is string => stamp != null)
    .sort();
  return {
    updatedAt: stamps.at(-1) ?? null,
    scoreboard: board.scoreboard,
    kalshiMovers: board.kalshiMovers,
  };
}
