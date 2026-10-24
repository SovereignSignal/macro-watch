import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import type { PanelKind } from '@/lib/ingest/panels';
import { panelRows, panelView, type PanelView } from '@/lib/panel-contract';
import { panelSeriesNumber } from '@/lib/panel-present';
import { oddsLensState, type OddsLensState } from '@/lib/odds-state';

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
 *
 * `notBefore` bounds the search. Without it the scan can walk back to any
 * age: that is how the home page kept serving the Oct 2 odds panel for three
 * weeks after every newer panel failed verification.
 */
export async function getLatestVerifiedPanel(
  db: Db,
  kind: PanelKind,
  opts: { notBefore?: Date } = {},
): Promise<{ takenAt: Date; payload: unknown; view: PanelView } | null> {
  const pageSize = 20;
  const floor = opts.notBefore ?? null;
  let before: Date | null = null;
  while (true) {
    const conditions = [eq(panelSnapshots.kind, kind)];
    if (before !== null) conditions.push(lt(panelSnapshots.takenAt, before));
    if (floor !== null) conditions.push(gte(panelSnapshots.takenAt, floor));
    const rows: Array<{ takenAt: Date; payload: unknown }> = await db
      .select({ takenAt: panelSnapshots.takenAt, payload: panelSnapshots.payload })
      .from(panelSnapshots)
      .where(and(...conditions))
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

/** Odds older than this are never shown as current probabilities. */
export const ODDS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** How far back to look for the last verified odds when reporting staleness. */
export const ODDS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The home page odds state: fresh rows inside the age limit, otherwise an
 * explicit stale or unavailable state with no probabilities.
 */
export async function getOddsLensState(db: Db, now: Date = new Date()): Promise<OddsLensState> {
  const [latest, verified] = await Promise.all([
    getLatestPanel(db, 'odds_lens'),
    getLatestVerifiedPanel(db, 'odds_lens', { notBefore: new Date(now.getTime() - ODDS_LOOKBACK_MS) }),
  ]);
  return oddsLensState({ latest, verified, now, maxAgeMs: ODDS_MAX_AGE_MS });
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
