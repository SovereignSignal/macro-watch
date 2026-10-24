import type { PanelRowItem, PanelView } from '@/lib/panel-contract';

export type OddsStatus = 'fresh' | 'stale' | 'unavailable';

export type OddsLensState = {
  status: OddsStatus;
  /** Rows to render. Always empty unless status is fresh. */
  rows: PanelRowItem[];
  summary: string | null;
  /** When the shown (fresh) or last verified (stale) odds were observed. */
  observedAt: string | null;
  /** Reader-facing explanation for stale and unavailable states. */
  message: string | null;
};

type Snap = { takenAt: Date; payload: unknown };

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function utcLabel(date: Date): string {
  const day = date.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const time = date.toISOString().slice(11, 16);
  return `${day} ${time} UTC`;
}

/**
 * Decide what the odds panel may show. Pure, so it is tested without a db.
 *
 * - fresh: the newest verified panel is within `maxAgeMs`, the producer did
 *   not mark it stale, and no newer explicit "unavailable" post supersedes it.
 * - stale: a verified panel exists but is too old (or marked stale). No
 *   probabilities are rendered; the reader sees when odds were last verified.
 * - unavailable: nothing verified in the lookback, or the producer posted an
 *   explicit unavailable state after the last verified panel.
 */
export function oddsLensState(input: {
  latest: Snap | null;
  verified: (Snap & { view: PanelView }) | null;
  now: Date;
  maxAgeMs: number;
}): OddsLensState {
  const { latest, verified, now, maxAgeMs } = input;
  const latestStatus = record(latest?.payload).status;
  const supersededByUnavailable = latest !== null && latestStatus === 'unavailable'
    && (verified === null || latest.takenAt.getTime() > verified.takenAt.getTime());
  if (verified === null || supersededByUnavailable) {
    const last = verified ? ` Last verified odds: ${utcLabel(verified.takenAt)}.` : '';
    return {
      status: 'unavailable',
      rows: [],
      summary: null,
      observedAt: verified ? verified.takenAt.toISOString() : null,
      message: `Prediction market odds are unavailable right now.${last}`,
    };
  }
  const age = now.getTime() - verified.takenAt.getTime();
  const markedStale = record(verified.payload).status === 'stale';
  if (age > maxAgeMs || markedStale) {
    const hours = Math.round(maxAgeMs / 3_600_000);
    return {
      status: 'stale',
      rows: [],
      summary: null,
      observedAt: verified.takenAt.toISOString(),
      message: `Odds last verified ${utcLabel(verified.takenAt)}. Not shown: older than ${hours} hours.`,
    };
  }
  return {
    status: 'fresh',
    rows: verified.view.rows,
    summary: verified.view.coverage,
    observedAt: verified.takenAt.toISOString(),
    message: null,
  };
}
