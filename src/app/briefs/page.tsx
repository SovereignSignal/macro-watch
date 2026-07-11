import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { listBriefs } from '@/lib/queries/briefs';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Brief archive' };

export default async function BriefsPage() {
  const items = await safeQuery(() => listBriefs(getDb()), []);
  return (
    <main className="container">
      <h1>Brief archive</h1>
      {items.length === 0 ? (
        <EmptyState>
          No briefs yet. The archive grows from launch — daily at 14:00 UTC Monday–Friday, weekend
          reviews Saturday.
        </EmptyState>
      ) : (
        <ul className="archive-list">
          {items.map((b) => (
            <li key={b.date}>
              <span className="date">{formatDate(b.date)}</span>
              {b.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
              <div>
                <Link href={`/briefs/${b.date}`}>{b.subject}</Link>
              </div>
              <p className="excerpt">{b.ping}</p>
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
