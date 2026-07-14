import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { listBriefs } from '@/lib/queries/briefs';
import { safeQuery } from '@/lib/safe';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Brief archive',
  description: 'Daily macro briefs and weekend reviews published by SovsClaw.',
  path: '/briefs',
});

const PAGE_SIZE = 25;

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function BriefsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageNumber((await searchParams).page);
  const rows = await safeQuery(
    () => listBriefs(getDb(), { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
    [],
  );
  const hasNext = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  return (
    <main className="container">
      <h1>Brief archive</h1>
      {items.length === 0 ? (
        <EmptyState>
          No briefs yet. Daily briefs publish weekdays at 14:00 UTC. Weekend reviews publish
          Saturday at 12:00 UTC.
        </EmptyState>
      ) : (
        <ul className="archive-list">
          {items.map((b) => (
            <li key={b.date}>
              <span className="date">{formatDate(b.date)}</span>
              {b.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
              <div>
                <Link href={`/briefs/${b.date}`}>{sanitizePublicBriefText(b.subject) || 'Brief'}</Link>
              </div>
              <p className="excerpt">{sanitizePublicBriefText(b.ping)}</p>
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasNext ? (
        <nav className="archive-pagination" aria-label="Archive pagination">
          {page > 1 ? <Link href={`/briefs?page=${page - 1}`}>← Newer briefs</Link> : <span />}
          {hasNext ? <Link href={`/briefs?page=${page + 1}`}>Older briefs →</Link> : null}
        </nav>
      ) : null}
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
