import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { isMember } from '@/lib/member-session';
import { pageMetadata } from '@/lib/metadata';
import { searchAll } from '@/lib/queries/search';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Search',
  description: 'Search Sovs Macro briefs, theme events, claims, and research.',
  path: '/search',
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const member = await isMember();
  const results =
    q.trim() !== '' ? await safeQuery(() => searchAll(getDb(), q, { includeClaims: member }), []) : [];
  return (
    <main className="container">
      <h1>Search</h1>
      <form method="get" action="/search" className="search-form">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={member ? 'briefs, themes, claims, research' : 'briefs, themes, research'}
          aria-label="Search query"
        />
        <button type="submit">Search</button>
      </form>
      {q.trim() === '' ? (
        <p className="brief-meta">
          {member
            ? 'Search briefs, theme events, claims, and research.'
            : 'Search briefs, theme events, and research.'}
        </p>
      ) : results.length === 0 ? (
        <EmptyState>
          No results for “{q}”. Try a ticker, theme, or phrase.
        </EmptyState>
      ) : (
        <>
          <p className="brief-meta">
            {results.length} result{results.length === 1 ? '' : 's'}
          </p>
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
        </>
      )}
    </main>
  );
}
