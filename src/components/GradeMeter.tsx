import { battingAverage, type ScoreBoard } from '@/lib/scoring';
import { StatusMark } from './StatusMark';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Segmented unlock meter: one segment per resolved claim the grading floor
 * requires, using the same unit-counting language as the book. Fill is the house
 * amber (progress), never hit/miss colors: nothing gets pre-graded.
 */
function Meter({ resolved, floor }: { resolved: number; floor: number }) {
  return (
    <span
      className="meter"
      role="img"
      aria-label={`${Math.min(resolved, floor)} of ${floor} decisions`}
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
 * - locked (resolved < floor): the unlock meter plus `N resolved; grading
 *   unlocks at F`. A designed state, not a fallback.
 * - unlocked: the batting average as the hero number, hits/misses beneath.
 */
export function GradeMeter({
  title,
  description,
  board,
  floor,
}: {
  title: string;
  description?: string;
  board: ScoreBoard;
  floor: number;
}) {
  const rate = battingAverage(board, floor);
  const excluded = board.partial + board.expired + board.void;
  return (
    <div className="grade">
      <h3>{title}</h3>
      {description ? <p className="grade-description">{description}</p> : null}
      {rate === null ? (
        <>
          <Meter resolved={board.resolved} floor={floor} />
          <p className="grade-note">
            {board.resolved} of {floor} decisions
          </p>
        </>
      ) : (
        <>
          <p className="grade-hero">{pct(rate)}</p>
          <p className="grade-sub">accuracy</p>
        </>
      )}
      <p className="grade-record">
        <StatusMark status="hit" size={12} decorative /> {board.hits} correct
        <span aria-hidden="true">·</span>
        <StatusMark status="miss" size={12} decorative /> {board.misses} incorrect
      </p>
      <p className="grade-context">
        {board.pending} pending{excluded > 0 ? `, ${excluded} excluded` : ''}
      </p>
      {board.resolved >= floor && board.meanImpliedProbability !== null ? (
        <p className="grade-benchmark">
          {pct(board.meanImpliedProbability)} opening probability
          {board.liftVsImplied !== null
            ? `, ${board.liftVsImplied >= 0 ? '+' : ''}${Math.round(board.liftVsImplied * 100)} pts vs market`
            : `, ${board.probabilitySample} priced decision${board.probabilitySample === 1 ? '' : 's'}`}
        </p>
      ) : null}
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
            {board.hits} correct, {board.misses} incorrect, {board.resolved} of {floor} decided
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
