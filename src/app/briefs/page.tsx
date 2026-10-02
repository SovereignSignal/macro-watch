import Link from 'next/link';
import { ArchiveByMonth } from '@/components/ArchiveByMonth';
import { BriefKindChip } from '@/components/BriefArticle';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { briefPath, parseBriefKindFilter, type BriefKind } from '@/lib/brief-kind';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { listBriefs } from '@/lib/queries/briefs';
import { safeQuery } from '@/lib/safe';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Brief archive',
  description: 'Daily macro briefs, weekend reviews, and week-ahead notes published by Sovs Macro.',
  path: '/briefs',
});

const PAGE_SIZE = 25;

const KIND_FILTERS: { kind: BriefKind | null; label: string }[] = [
  { kind: null, label: 'All' },
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekend', label: 'Weekend' },
  { kind: 'week-ahead', label: 'Week ahead' },
];

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function archiveHref(page: number, kind: BriefKind | null): string {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/briefs?${query}` : '/briefs';
}

export default async function BriefsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = pageNumber(params.page);
  const kind = parseBriefKindFilter(params.kind);
  const rows = await safeQuery(
    () => listBriefs(getDb(), {
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
      ...(kind ? { kind } : {}),
    }),
    [],
  );
  const hasNext = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  return (
    <main className="container">
      <h1>Brief archive</h1>
      <nav className="kind-filters" aria-label="Brief kind">
        {KIND_FILTERS.map((filter) => {
          const current = filter.kind === kind;
          return (
            <Link
              key={filter.label}
              href={archiveHref(1, filter.kind)}
              aria-current={current ? 'true' : undefined}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <EmptyState>
          {kind
            ? 'No briefs of this kind yet.'
            : 'No briefs yet. Daily briefs publish weekdays at 14:00 UTC, the Weekend Review Saturday at 17:00 UTC, and the Week Ahead Sunday at 23:00 UTC.'}
        </EmptyState>
      ) : (
        <ArchiveByMonth
          items={items.map((b) => ({
            key: `${b.date}:${b.kind}`,
            date: b.date,
            node: (
              <>
                <span className="date">{formatDate(b.date)}</span>
                <BriefKindChip kind={b.kind} subject={b.subject} />
                <div>
                  <Link href={briefPath(b.date, b.kind, b.subject)}>
                    {sanitizePublicBriefText(b.subject, b.date) || 'Brief'}
                  </Link>
                </div>
                <p className="excerpt">{sanitizePublicBriefText(b.ping, b.date)}</p>
              </>
            ),
          }))}
        />
      )}
      {page > 1 || hasNext ? (
        <nav className="archive-pagination" aria-label="Archive pagination">
          {page > 1 ? <Link href={archiveHref(page - 1, kind)}>← Newer briefs</Link> : <span />}
          {hasNext ? <Link href={archiveHref(page + 1, kind)}>Older briefs →</Link> : null}
        </nav>
      ) : null}
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
