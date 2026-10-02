import Link from 'next/link';
import { ArchiveByMonth } from '@/components/ArchiveByMonth';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { listResearch } from '@/lib/queries/research';
import { safeQuery } from '@/lib/safe';
import { publicResearchText } from '@/lib/research-public';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Research reports',
  description:
    'Daily decision-research memos: one thesis pressure-tested against primary sources, with the evidence, the call, and what to watch next.',
  path: '/research',
});

const PAGE_SIZE = 25;

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ResearchPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageNumber((await searchParams).page);
  const rows = await safeQuery(
    () => listResearch(getDb(), { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
    [],
  );
  const hasNext = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  return (
    <main className="container">
      <h1>Research reports</h1>
      <p className="excerpt">
        Each weekday morning the research loop takes the standing macro map&rsquo;s weakest
        assumption and pressure-tests it against primary sources. The memo states what the
        evidence changed, the call at the margin, and the observations that would flip it.
      </p>
      {items.length === 0 ? (
        <EmptyState>No research memos yet. Memos publish weekday mornings at 07:00 UTC.</EmptyState>
      ) : (
        <ArchiveByMonth
          items={items.map((m) => ({
            key: m.date,
            date: m.date,
            node: (
              <>
                <span className="date">{formatDate(m.date)}</span>
                <div>
                  <Link href={`/research/${m.date}`}>
                    {publicResearchText(sanitizePublicBriefText(m.topic, m.date)) || 'Research memo'}
                  </Link>
                </div>
                <p className="excerpt">
                  {publicResearchText(sanitizePublicBriefText(m.finding, m.date)).slice(0, 280)}
                </p>
              </>
            ),
          }))}
        />
      )}
      {page > 1 || hasNext ? (
        <nav className="archive-pagination" aria-label="Archive pagination">
          {page > 1 ? <Link href={`/research?page=${page - 1}`}>Newer</Link> : <span />}
          {hasNext ? <Link href={`/research?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
