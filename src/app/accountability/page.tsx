import { ClaimsBook } from '@/components/ClaimsBook';
import { ClaimsTable } from '@/components/ClaimsTable';
import { ExpiryHorizon } from '@/components/ExpiryHorizon';
import { GradeMeter, GradeRow } from '@/components/GradeMeter';
import { getDb } from '@/db/client';
import { humanizeSlug, isQualitativeClaim, isScoreableClaim, qualityLabel } from '@/lib/claim-display';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { getClaims, getThemeNames } from '@/lib/queries/accountability';
import { safeQuery } from '@/lib/safe';
import { GROUP_MIN_SAMPLE, groupBoards, OVERALL_MIN_SAMPLE, qualityClass, scoreClaims } from '@/lib/scoring';

// Reads searchParams (filters), so this page renders per-request.
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Accountability',
  description: 'Sources, due dates, and outcomes for measurable Sovs Macro calls.',
  path: '/accountability',
});

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export default async function AccountabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = {
    kind: one(sp.kind),
    status: one(sp.status),
    theme: one(sp.theme),
    qualityClass: one(sp.class),
  };
  const db = getDb();
  // Filters only narrow the public ledger. They never change performance math.
  const [all, filtered, themeNames] = await Promise.all([
    safeQuery(() => getClaims(db), []),
    safeQuery(() => getClaims(db, filters), []),
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
  const nextDecision = scoreable
    .filter((claim) => claim.status === 'pending' && claim.expiresAt)
    .map((claim) => claim.expiresAt as string)
    .sort()[0];
  const phase = overall.resolved === 0 ? 'Tracking phase' : overall.resolved < OVERALL_MIN_SAMPLE ? 'Early record' : 'Performance active';

  return (
    <main className="container-wide">
      <h1>Accountability</h1>
      <p className="accountability-lede">
        Measurable calls, sources, due dates, and outcomes.
      </p>

      <section className="accountability-summary" aria-labelledby="record-status">
        <p className="accountability-phase">{phase}</p>
        <h2 id="record-status">
          {overall.resolved === 0
            ? 'No eligible claims have resolved yet.'
            : `${overall.resolved} decision${overall.resolved === 1 ? '' : 's'} recorded.`}
        </h2>
        <dl className="accountability-stats">
          <div>
            <dt>All entries</dt>
            <dd>{all.length}</dd>
          </div>
          <div>
            <dt>Eligible claims</dt>
            <dd>{scoreable.length}</dd>
          </div>
          <div>
            <dt>Decided</dt>
            <dd>{overall.resolved}</dd>
          </div>
          <div>
            <dt>Pending</dt>
            <dd>{overall.pending}</dd>
          </div>
          <div>
            <dt>Human review</dt>
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
            <p>Save the claim, source, opening state, and due date.</p>
          </article>
          <article>
            <p className="method-number">02</p>
            <h3>Verify</h3>
            <p>Use the source&apos;s final result. No model judgment.</p>
          </article>
          <article>
            <p className="method-number">03</p>
            <h3>Score</h3>
            <p>Count correct and incorrect results. Exclude mixed, missing, duplicate, and qualitative rows.</p>
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
            title="Map-derived markets"
            description="Market leans cited in the weekly theme map."
            board={scoreClaims(mapClaims)}
            floor={OVERALL_MIN_SAMPLE}
          />
        </div>
        {perTheme.length > 0 ? (
          <>
            <h3>Decided claims by theme</h3>
            <ul className="grade-rows">
              {perTheme.map(([key, board]) => (
                <GradeRow key={key} name={themeNames[key] ?? humanizeSlug(key)} board={board} floor={GROUP_MIN_SAMPLE} />
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
        <h2 id="upcoming-decisions">Upcoming decisions</h2>
        <p className="brief-meta">
          {nextDecision
            ? `Next decision: ${formatDate(nextDecision)}. Only eligible claims appear here.`
            : 'No dated claims are pending.'}
        </p>
        <ExpiryHorizon claims={scoreable} />
      </section>

      {qualitative.length > 0 ? (
        <section className="qualitative-note" aria-labelledby="qualitative-review">
          <h2 id="qualitative-review">Qualitative map review</h2>
          <p>
            {qualitative.length} flip condition{qualitative.length === 1 ? '' : 's'} {qualitative.length === 1 ? 'needs' : 'need'} human review.
            They stay out of performance stats.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="claim-history">
        <h2 id="claim-history">Claim history</h2>
        <p className="brief-meta">Eligible claims, oldest first.</p>
        <ClaimsBook claims={scoreable} />
      </section>

      <section aria-labelledby="public-ledger">
        <h2 id="public-ledger">Public ledger</h2>
        <p className="brief-meta">Filters only affect this ledger.</p>
        <ClaimsTable
          claims={filtered}
          filters={filters}
          themeOptions={themeOptions}
          classOptions={classOptions}
          themeNames={themeNames}
        />
      </section>
    </main>
  );
}
