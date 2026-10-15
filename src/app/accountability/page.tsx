import { ClaimsBook } from '@/components/ClaimsBook';
import { ClaimsTable } from '@/components/ClaimsTable';
import { ExpiryHorizon } from '@/components/ExpiryHorizon';
import { GradeMeter, GradeRow } from '@/components/GradeMeter';
import { MembersOnly } from '@/components/MembersOnly';
import { getDb } from '@/db/client';
import { isQualitativeClaim, isScoreableClaim, qualityLabel } from '@/lib/claim-display';
import { publicThemeLabel } from '@/lib/theme-display';
import { formatDate } from '@/lib/format';
import { isMember } from '@/lib/member-session';
import { pageMetadata } from '@/lib/metadata';
import { getClaims, getClaimsPage, getThemeNames, LEDGER_PAGE_SIZE } from '@/lib/queries/accountability';
import { safeQuery } from '@/lib/safe';
import { decisionHorizon } from '@/lib/decision-horizon';
import { GROUP_MIN_SAMPLE, groupBoards, OVERALL_MIN_SAMPLE, qualityClass, scoreClaims } from '@/lib/scoring';

// Reads searchParams (ledger filters and page), so this page renders per-request.
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Accountability',
  description: 'Sources, due dates, and outcomes for measurable Sovs Macro calls.',
  path: '/accountability',
});

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AccountabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (!(await isMember())) {
    return <MembersOnly next="/accountability" error={sp.signin === 'failed'} />;
  }
  const filters = {
    kind: one(sp.kind),
    status: one(sp.status),
    theme: one(sp.theme),
    qualityClass: one(sp.class),
  };
  const page = pageNumber(sp.page);
  const db = getDb();
  // Filters and paging only narrow the ledger. Everything else on the
  // page (counts, boards, the book, the horizon) reads the whole record.
  const [all, ledger, themeNames] = await Promise.all([
    safeQuery(() => getClaims(db), []),
    safeQuery(() => getClaimsPage(db, filters, page), { rows: [], total: 0, page: 1, pageSize: LEDGER_PAGE_SIZE }),
    safeQuery(() => getThemeNames(db), {}),
  ]);
  const scoreable = all.filter(isScoreableClaim);
  const qualitative = all.filter(isQualitativeClaim);
  const smartMoney = scoreable.filter((claim) => claim.kind === 'smart_money');
  const mapClaims = scoreable.filter((claim) => claim.kind === 'map');
  const overall = scoreClaims(scoreable);
  const perTheme = [...groupBoards(scoreable, (c) => (c.themes.length > 0 ? c.themes : ['unthemed'])).entries()]
    .filter(([, board]) => board.resolved > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const perClass = [...groupBoards(scoreable, (c) => [qualityClass(c.payload)]).entries()]
    .filter(([, board]) => board.resolved > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const themeOptions = [...new Set(all.flatMap((c) => c.themes))].sort();
  const classOptions = [...new Set(all.map((c) => qualityClass(c.payload)))].sort();
  const today = new Date().toISOString().slice(0, 10);
  const { nextDecision, overdue } = decisionHorizon(scoreable, today);
  const phase = overall.resolved === 0 ? 'Tracking phase' : overall.resolved < OVERALL_MIN_SAMPLE ? 'Early record' : 'Performance active';

  return (
    <main className="container-wide">
      <h1>Accountability</h1>
      <p className="accountability-lede">
        The graded record of calls and outcomes, for members while it builds a track record. Forecast accuracy includes only eligible calls recorded before their outcome.
        Historical conditions and ambiguous tests remain visible for review and are excluded from that score.
      </p>

      <section className="accountability-summary" aria-labelledby="record-status">
        <p className="accountability-phase">{phase}</p>
        <h2 id="record-status">
          {overall.resolved === 0
            ? 'Waiting for markets to settle.'
            : `${overall.resolved} market${overall.resolved === 1 ? '' : 's'} ${overall.resolved === 1 ? 'has' : 'have'} settled.`}
        </h2>
        <p className="brief-meta">
          {overall.resolved === 0
            ? `${overall.pending} listed ${overall.pending === 1 ? 'market is' : 'markets are'} still open. Settled stays at 0 until those prints land.`
            : 'Hit or miss is taken from the source result, not from a person.'}
        </p>
        <dl className="accountability-stats">
          <div className={overall.resolved === 0 ? 'is-quiet' : undefined}>
            <dt>All entries</dt>
            <dd>{all.length}</dd>
          </div>
          <div className={overall.resolved === 0 ? 'is-quiet' : undefined}>
            <dt>Listed markets</dt>
            <dd>{scoreable.length}</dd>
          </div>
          <div>
            <dt>Settled</dt>
            <dd>{overall.resolved}</dd>
          </div>
          <div className={overall.resolved === 0 ? 'is-focus' : undefined}>
            <dt>Still open</dt>
            <dd>{overall.pending}</dd>
          </div>
          <div>
            <dt>Not scored</dt>
            <dd>{qualitative.length}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="method">
        <h2 id="method">How the record works</h2>
        <div className="accountability-method">
          <article>
            <p className="method-number">01</p>
            <h3>Record</h3>
            <p>The pipeline saves the call, the source, and the due date.</p>
          </article>
          <article>
            <p className="method-number">02</p>
            <h3>Settle</h3>
            <p>The market or official print closes. There is no decide button.</p>
          </article>
          <article>
            <p className="method-number">03</p>
            <h3>Score</h3>
            <p>Hits and misses only. Accuracy waits until eight markets have settled.</p>
          </article>
        </div>
        <aside className="coverage-note">
          Covers Polymarket wallet signals and weekly theme map calls. Daily brief commentary is excluded.
        </aside>
      </section>

      <section aria-labelledby="performance">
        <h2 id="performance">Performance by track</h2>
        <p className="brief-meta">
          Each track shows an accuracy rate after {OVERALL_MIN_SAMPLE} decisions. Counts appear immediately.
        </p>
        <div className="grade-grid">
          <GradeMeter
            title="Smart-money markets"
            description="Polymarket sides backed by tracked wallets."
            board={scoreClaims(smartMoney)}
            floor={OVERALL_MIN_SAMPLE}
          />
          <GradeMeter
            title="Map-derived checks"
            description="Dated conditions from the daily Next check lines and the reaction rules behind each Forward Event Checkpoint, settled on stored daily closes, plus market leans cited in the weekly map."
            board={scoreClaims(mapClaims)}
            floor={OVERALL_MIN_SAMPLE}
          />
        </div>
        {perTheme.length > 0 ? (
          <>
            <h3>Decided claims by theme</h3>
            <ul className="grade-rows">
              {perTheme.map(([key, board]) => (
                <GradeRow key={key} name={publicThemeLabel(key, themeNames)} board={board} floor={GROUP_MIN_SAMPLE} />
              ))}
            </ul>
          </>
        ) : null}
        {perClass.length > 0 ? (
          <>
            <h3>Decided claims by evidence type</h3>
            <ul className="grade-rows">
              {perClass.map(([key, board]) => (
                <GradeRow key={key} name={qualityLabel(key)} board={board} floor={GROUP_MIN_SAMPLE} />
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="upcoming-decisions">
        <h2 id="upcoming-decisions">Upcoming settlements</h2>
        <p className="brief-meta">
          {overdue > 0
            ? `${overdue} listed ${overdue === 1 ? 'market is past its due date' : 'markets are past their due date'}. `
            : ''}
          {nextDecision
            ? `Next dated settlement: ${formatDate(nextDecision)}. `
            : overdue === 0
              ? 'No dated markets are still open. '
              : ''}
          Only listed markets appear here.
        </p>
        <ExpiryHorizon claims={scoreable} />
      </section>

      {qualitative.length > 0 ? (
        <section className="qualitative-note" aria-labelledby="qualitative-review">
          <h2 id="qualitative-review">Qualitative map review</h2>
          <p>
            {qualitative.length} map condition{qualitative.length === 1 ? '' : 's'} {qualitative.length === 1 ? 'has' : 'have'} no market that can settle {qualitative.length === 1 ? 'it' : 'them'}.
            {qualitative.length === 1 ? ' It stays' : ' They stay'} off the scorecard.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="claim-history">
        <h2 id="claim-history">Claim history</h2>
        <p className="brief-meta">Listed markets, oldest first.</p>
        <ClaimsBook claims={scoreable} />
      </section>

      <section aria-labelledby="public-ledger">
        <h2 id="public-ledger">Call ledger</h2>
        <p className="brief-meta">Filters only affect this ledger.</p>
        <ClaimsTable
          page={ledger}
          filters={filters}
          themeOptions={themeOptions}
          classOptions={classOptions}
          themeNames={themeNames}
        />
      </section>
    </main>
  );
}
