import { battingAverage, type ScoreBoard } from '@/lib/scoring';
import { StatusMark } from './StatusMark';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Segmented unlock meter: one segment per resolved claim the grading floor
 * requires — the same unit-counting language as the book. Fill is the house
 * amber (progress), never hit/miss colors: nothing gets pre-graded.
 */
function Meter({ resolved, floor }: { resolved: number; floor: number }) {
  return (
    <span
      className="meter"
      role="img"
      aria-label={`${Math.min(resolved, floor)} of ${floor} resolved claims needed to grade`}
    >
      {Array.from({ length: floor }, (_, i) => (
        <span key={i} className={i < Math.min(resolved, floor) ? 'm-fill' : undefined} />
      ))}
    </span>
  );
}

/**
 * A grading board with two honest states (spec §5, honest denominator:
 * batting = hits / (hits + misses), floors 8 overall / 4 per group):
 *
 * - locked (resolved < floor): the unlock meter + `N resolved — grading
 *   unlocks at F`. A designed state, not a fallback.
 * - unlocked: the batting average as the hero number, hits/misses beneath.
 */
export function GradeMeter({ title, board, floor }: { title: string; board: ScoreBoard; floor: number }) {
  const rate = battingAverage(board, floor);
  return (
    <div className="grade">
      <h3>{title}</h3>
      {rate === null ? (
        <>
          <Meter resolved={board.resolved} floor={floor} />
          <p className="grade-note">
            {board.resolved} resolved — grading unlocks at {floor}
          </p>
        </>
      ) : (
        <>
          <p className="grade-hero">{pct(rate)}</p>
          <p className="grade-sub">batting average</p>
          <p className="grade-record">
            <StatusMark status="hit" size={12} decorative /> {board.hits} hits
            <span aria-hidden="true">·</span>
            <StatusMark status="miss" size={12} decorative /> {board.misses} misses
          </p>
        </>
      )}
    </div>
  );
}

/** The same two states as a quiet ledger row (per-theme / per-class lists). */
export function GradeRow({ name, board, floor }: { name: string; board: ScoreBoard; floor: number }) {
  const rate = battingAverage(board, floor);
  return (
    <li>
      <span className="grade-row-name">{name}</span>
      {rate === null ? (
        <>
          <Meter resolved={board.resolved} floor={floor} />
          <span className="grade-note">
            {board.resolved} resolved — grading unlocks at {floor}
          </span>
        </>
      ) : (
        <>
          <span className="grade-row-rate">{pct(rate)}</span>
          <span className="grade-record">
            <StatusMark status="hit" size={11} decorative /> {board.hits}
            <StatusMark status="miss" size={11} decorative /> {board.misses}
          </span>
        </>
      )}
    </li>
  );
}
