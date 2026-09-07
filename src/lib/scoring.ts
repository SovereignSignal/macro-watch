/**
 * Scoreboard math over the sovs-macro pipeline's claim vocabulary
 * (`pending | hit | miss | partial | expired | judgment-required | void`:
 * schema.ts / ingest/claims.ts; NOT the site-plan draft's
 * open/resolved_correct/resolved_incorrect/invalidated).
 *
 * Honest denominator (controller-adjudicated): batting average =
 * hits / (hits + misses) ONLY. `pending` never enters the denominator.
 * there is nothing to grade yet. `partial`, `expired`, `judgment-required`,
 * and `void` are each tracked and tallied but never counted toward the
 * average: none of them is a hit or a miss.
 */
export type ScoreBoard = {
  pending: number;
  hits: number;
  misses: number;
  resolved: number; // hits + misses, the only quantity that ever feeds hitRate
  partial: number;
  expired: number;
  judgmentRequired: number;
  void: number;
  hitRate: number | null; // hits / resolved; null when resolved === 0 (nothing to grade)
  probabilitySample: number;
  meanImpliedProbability: number | null;
  brierScore: number | null;
  liftVsImplied: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function probability(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** Opening probability assigned to the recorded side of a market claim. */
export function openingProbability(payload: unknown): number | null {
  const body = record(payload);
  const explicit = probability(body.opening_probability);
  if (explicit !== null) return explicit;

  const snapshot = record(body.creation_snapshot);
  const currentPrice = probability(snapshot.current_price);
  if (currentPrice !== null) return currentPrice;

  const oddsYes = snapshot.odds_yes_pct;
  if (typeof oddsYes !== 'number' || !Number.isFinite(oddsYes) || oddsYes < 0 || oddsYes > 100) return null;
  const side = String(record(body.predicate_detail).threshold ?? '').toUpperCase();
  if (side === 'YES') return oddsYes / 100;
  if (side === 'NO') return 1 - oddsYes / 100;
  return null;
}

/** Scoreboard math over claim statuses (pipeline vocabulary). */
export function requiresForecastReview(payload: unknown): boolean {
  const body = record(payload);
  return (body.claim_kind === 'series-check' || body.claim_kind === 'release-reaction')
    && (body.scoring_version !== 2 || body.scoring_eligible !== true || body.cohort !== 'prospective');
}

export function scoreClaims(rows: { status: string; payload?: unknown }[]): ScoreBoard {
  const b: ScoreBoard = {
    pending: 0,
    hits: 0,
    misses: 0,
    resolved: 0,
    partial: 0,
    expired: 0,
    judgmentRequired: 0,
    void: 0,
    hitRate: null,
    probabilitySample: 0,
    meanImpliedProbability: null,
    brierScore: null,
    liftVsImplied: null,
  };
  let impliedTotal = 0;
  let brierTotal = 0;
  for (const r of rows) {
    if (requiresForecastReview(r.payload)) {
      if (r.status === 'void') b.void += 1;
      else b.judgmentRequired += 1;
      continue;
    }
    switch (r.status) {
      case 'pending':
        b.pending += 1;
        break;
      case 'hit':
        b.hits += 1;
        break;
      case 'miss':
        b.misses += 1;
        break;
      case 'partial':
        b.partial += 1;
        break;
      case 'expired':
        b.expired += 1;
        break;
      case 'judgment-required':
        b.judgmentRequired += 1;
        break;
      case 'void':
        b.void += 1;
        break;
      default:
        break; // unknown status: tallied nowhere, never silently folded into the average
    }
    if (r.status === 'hit' || r.status === 'miss') {
      const p = openingProbability(r.payload);
      if (p !== null) {
        const actual = r.status === 'hit' ? 1 : 0;
        b.probabilitySample += 1;
        impliedTotal += p;
        brierTotal += (p - actual) ** 2;
      }
    }
  }
  b.resolved = b.hits + b.misses;
  b.hitRate = b.resolved > 0 ? b.hits / b.resolved : null;
  if (b.probabilitySample > 0) {
    b.meanImpliedProbability = impliedTotal / b.probabilitySample;
    b.brierScore = brierTotal / b.probabilitySample;
    b.liftVsImplied =
      b.probabilitySample === b.resolved && b.hitRate !== null
        ? b.hitRate - b.meanImpliedProbability
        : null;
  }
  return b;
}

/** One board per key; a claim contributes to every key it carries. */
export function groupBoards<T extends { status: string }>(
  rows: T[],
  keysOf: (row: T) => string[],
): Map<string, ScoreBoard> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    for (const k of keysOf(r)) {
      const list = groups.get(k) ?? [];
      list.push(r);
      groups.set(k, list);
    }
  }
  return new Map([...groups.entries()].map(([k, list]) => [k, scoreClaims(list)]));
}

/** Quality class = the claim's market_type quality field (spec §3). */
export function qualityClass(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const mt = (payload as Record<string, unknown>).market_type;
    if (typeof mt === 'string' && mt.length > 0) return mt;
  }
  return 'unclassified';
}

// Minimum-sample suppression (controller-adjudicated): the numeric batting
// average is a designed honest-empty-state feature, not a fallback. Below
// the floor the board reports its resolved count instead of a number that
// would overstate confidence on a handful of claims.
export const OVERALL_MIN_SAMPLE = 8;
export const GROUP_MIN_SAMPLE = 4;

/** The displayable batting average: hitRate once the sample clears minSample, else null. */
export function battingAverage(board: ScoreBoard, minSample: number): number | null {
  return board.resolved >= minSample ? board.hitRate : null;
}
