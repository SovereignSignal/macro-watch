/**
 * The map's display read of a theme's lifecycle.
 *
 * The themes table stores three states, set by the newest event's direction:
 * active | candidate | retired. The map derives a fourth at render time:
 * a candidate whose last event is more than DORMANT_AFTER_DAYS before the
 * page's as-of date is *dormant*. Nothing is written; the theme is kept,
 * any new event revives it, and it is out of play: off the field and out of
 * the Candidates section. Same rule and numbers as the pipeline side.
 *
 * Pure and deterministic: same card and asOf give the same answer. Dates are
 * YYYY-MM-DD strings compared in UTC, like the field's 30-day window.
 */

export const DORMANT_AFTER_DAYS = 45;

export type LifecycleCard = { status: string; lastEventAt: string | null };

const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** Whole days from `from` to `to`; negative when `to` is the earlier date. */
function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

/** A candidate with no event for more than DORMANT_AFTER_DAYS as of `asOf`. */
export function isDormant(card: LifecycleCard, asOf: string): boolean {
  if (card.status !== 'candidate' || !card.lastEventAt) return false;
  return daysBetween(card.lastEventAt, asOf) > DORMANT_AFTER_DAYS;
}

/** The status the map shows: `dormant` for a stale candidate, else the stored status. */
export function displayStatus(card: LifecycleCard, asOf: string): string {
  return isDormant(card, asOf) ? 'dormant' : card.status;
}
