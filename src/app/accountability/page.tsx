import { ClaimsTable } from '@/components/ClaimsTable';
import { Scoreboards } from '@/components/Scoreboards';
import { getDb } from '@/db/client';
import { getClaims } from '@/lib/queries/accountability';
import { safeQuery } from '@/lib/safe';
import { groupBoards, qualityClass, scoreClaims } from '@/lib/scoring';

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
  // Scoreboards are computed from the whole ledger (single source of truth);
  // only the table below is narrowed by the filters — filtering never
  // changes the math (spec §5).
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
      <Scoreboards overall={scoreClaims(all)} perTheme={perTheme} perClass={perClass} />
      <h2>Claims</h2>
      <ClaimsTable claims={filtered} filters={filters} themeOptions={themeOptions} classOptions={classOptions} />
    </main>
  );
}
