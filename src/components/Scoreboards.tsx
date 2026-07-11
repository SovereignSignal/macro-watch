import { battingAverage, GROUP_MIN_SAMPLE, OVERALL_MIN_SAMPLE, type ScoreBoard } from '@/lib/scoring';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Board({ title, board, minSample }: { title: string; board: ScoreBoard; minSample: number }) {
  const rate = battingAverage(board, minSample);
  return (
    <div className="board">
      <h3>{title}</h3>
      {rate === null ? (
        <p className="brief-meta">{board.resolved} resolved — not enough to grade yet.</p>
      ) : (
        <p className="hit-rate">
          {pct(rate)} <span className="brief-meta">batting average</span>
        </p>
      )}
      <dl>
        <dt>resolved</dt>
        <dd>{board.resolved}</dd>
        <dt>hits</dt>
        <dd>{board.hits}</dd>
        <dt>misses</dt>
        <dd>{board.misses}</dd>
        <dt>pending</dt>
        <dd>{board.pending}</dd>
        <dt>partial</dt>
        <dd>{board.partial}</dd>
        <dt>judgment required</dt>
        <dd>{board.judgmentRequired}</dd>
        <dt>expired</dt>
        <dd>{board.expired}</dd>
        <dt>void</dt>
        <dd>{board.void}</dd>
      </dl>
    </div>
  );
}

/**
 * Overall + per-theme + per-quality-class scoreboards (spec §5
 * /accountability). Minimum-sample suppression is per Board: the overall
 * board needs 8 resolved (hits+misses) before it shows a number, every
 * per-theme/per-class row needs 4 — otherwise the honest resolved-count
 * message renders instead (a designed feature, not a fallback).
 */
export function Scoreboards(props: {
  overall: ScoreBoard;
  perTheme: [string, ScoreBoard][];
  perClass: [string, ScoreBoard][];
}) {
  return (
    <>
      <section>
        <h2>Overall</h2>
        <div className="boards">
          <Board title="All claims" board={props.overall} minSample={OVERALL_MIN_SAMPLE} />
        </div>
      </section>
      {props.perTheme.length > 0 ? (
        <section>
          <h2>By theme</h2>
          <div className="boards">
            {props.perTheme.map(([k, b]) => (
              <Board key={k} title={k} board={b} minSample={GROUP_MIN_SAMPLE} />
            ))}
          </div>
        </section>
      ) : null}
      {props.perClass.length > 0 ? (
        <section>
          <h2>By quality class</h2>
          <div className="boards">
            {props.perClass.map(([k, b]) => (
              <Board key={k} title={k} board={b} minSample={GROUP_MIN_SAMPLE} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
