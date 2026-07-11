import { ClaimsBook } from '@/components/ClaimsBook';
import { ClaimsTable } from '@/components/ClaimsTable';
import { ExpiryHorizon } from '@/components/ExpiryHorizon';
import { GradeMeter, GradeRow } from '@/components/GradeMeter';
import { getDb } from '@/db/client';
import { getClaims } from '@/lib/queries/accountability';
import { safeQuery } from '@/lib/safe';
import { GROUP_MIN_SAMPLE, groupBoards, OVERALL_MIN_SAMPLE, qualityClass, scoreClaims } from '@/lib/scoring';

// Reads searchParams (filters), so this page renders per-request.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accountability' };

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
  // The book, meters, and horizon are computed from the whole ledger (single
  // source of truth); only the ledger table below is narrowed by the filters —
  // filtering never changes the math (spec §5).
  const all = await safeQuery(() => getClaims(db), []);
  const filtered = await safeQuery(() => getClaims(db, filters), []);
  const perTheme = [...groupBoards(all, (c) => (c.themes.length > 0 ? c.themes : ['unthemed'])).entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const perClass = [...groupBoards(all, (c) => [qualityClass(c.payload)]).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const themeOptions = [...new Set(all.flatMap((c) => c.themes))].sort();
  const classOptions = [...new Set(all.map((c) => qualityClass(c.payload)))].sort();
  return (
    <main className="container-wide">
      <h1>Accountability</h1>
      <p className="brief-meta">
        Every falsifiable claim the system has made, and how it resolved. No memory-holing.
      </p>

      <section aria-labelledby="the-book">
        <h2 id="the-book">The book</h2>
        <p className="brief-meta">One cell per claim, oldest first — hover a cell for the claim.</p>
        <ClaimsBook claims={all} />
      </section>

      <section aria-labelledby="grading">
        <h2 id="grading">Grading</h2>
        <p className="brief-meta">
          Batting average = hits ÷ (hits + misses). Pending, partial, expired, and void claims never
          enter the denominator — and small samples don’t grade.
        </p>
        <div className="grade-grid">
          <GradeMeter title="All claims" board={scoreClaims(all)} floor={OVERALL_MIN_SAMPLE} />
          <GradeMeter
            title="Smart money"
            board={scoreClaims(all.filter((c) => c.kind === 'smart_money'))}
            floor={OVERALL_MIN_SAMPLE}
          />
          <GradeMeter
            title="Map calls"
            board={scoreClaims(all.filter((c) => c.kind === 'map'))}
            floor={OVERALL_MIN_SAMPLE}
          />
        </div>
        {perTheme.length > 0 ? (
          <>
            <h3>By theme</h3>
            <ul className="grade-rows">
              {perTheme.map(([k, b]) => (
                <GradeRow key={k} name={k} board={b} floor={GROUP_MIN_SAMPLE} />
              ))}
            </ul>
          </>
        ) : null}
        {perClass.length > 0 ? (
          <>
            <h3>By quality class</h3>
            <ul className="grade-rows">
              {perClass.map(([k, b]) => (
                <GradeRow key={k} name={k} board={b} floor={GROUP_MIN_SAMPLE} />
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="the-horizon">
        <h2 id="the-horizon">The horizon</h2>
        <p className="brief-meta">When the open book comes due.</p>
        <ExpiryHorizon claims={all} />
      </section>

      <h2>The ledger</h2>
      <ClaimsTable claims={filtered} filters={filters} themeOptions={themeOptions} classOptions={classOptions} />
    </main>
  );
}
