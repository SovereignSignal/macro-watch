import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { searchAll } from '@/lib/queries/search';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const results = q.trim() !== '' ? await safeQuery(() => searchAll(getDb(), q), []) : [];
  return (
    <main className="container">
      <h1>Search</h1>
      <form method="get" action="/search" className="search-form">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="briefs, theme events, claims…"
          aria-label="Search query"
        />
        <button type="submit">Search</button>
      </form>
      {q.trim() === '' ? (
        <p className="brief-meta">Full-text search across every brief, theme event, and claim.</p>
      ) : results.length === 0 ? (
        <EmptyState>
          Nothing matched “{q}”. Try a ticker, a theme name, or a phrase from a brief.
        </EmptyState>
      ) : (
        <ul className="archive-list">
          {results.map((r, i) => (
            <li key={`${r.type}-${i}`}>
              <span className="badge">{r.type.replaceAll('-', ' ')}</span>{' '}
              <span className="date">{formatDate(r.date)}</span>
              <div>
                <Link href={r.href}>{r.title}</Link>
              </div>
              <p className="excerpt">{r.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
