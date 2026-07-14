import { desc, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents } from '@/db/schema';
import { PUBLIC_BRIEF_MIN_DATE } from '@/lib/queries/briefs';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';
import { publicText } from '@/lib/public-copy';

export type SearchResult = {
  type: 'brief' | 'theme-event' | 'claim';
  title: string;
  href: string;
  snippet: string;
  date: string;
};

const LIMIT = 20;

/**
 * Postgres full-text across briefs, theme events, claims (spec §5 /search).
 * `q` always travels as a bound parameter via drizzle's `sql` tag, never
 * string-concatenated, so quotes and injection attempts are just inert
 * search text (see tests/search.test.tsx).
 */
export async function searchAll(db: Db, q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query === '') return [];

  const briefHits = await db
    .select({ date: briefs.date, subject: briefs.subject, ping: briefs.ping })
    .from(briefs)
    .where(sql`${briefs.search} @@ websearch_to_tsquery('english', ${query}) AND ${briefs.date} >= ${PUBLIC_BRIEF_MIN_DATE}`)
    .orderBy(sql`ts_rank(${briefs.search}, websearch_to_tsquery('english', ${query})) desc`)
    .limit(LIMIT);

  const eventHits = await db
    .select({
      eventId: themeEvents.eventId,
      date: themeEvents.date,
      slug: themeEvents.themeSlug,
      direction: themeEvents.direction,
      evidence: themeEvents.evidence,
    })
    .from(themeEvents)
    .where(sql`${themeEvents.search} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(desc(themeEvents.date))
    .limit(LIMIT);

  const claimHits = await db
    .select({
      claimId: claims.claimId,
      openedAt: claims.openedAt,
      payload: claims.payload,
      status: claims.status,
    })
    .from(claims)
    .where(sql`${claims.search} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(desc(claims.openedAt))
    .limit(LIMIT);

  return [
    ...briefHits.map(
      (b): SearchResult => ({
        type: 'brief',
        title: sanitizePublicBriefText(b.subject),
        href: `/briefs/${b.date}`,
        snippet: sanitizePublicBriefText(b.ping),
        date: b.date,
      }),
    ),
    ...eventHits.map(
      (e): SearchResult => ({
        type: 'theme-event',
        title: `${e.slug}: ${e.direction}`,
        href: `/map/${e.slug}`,
        snippet: publicText(e.evidence),
        date: e.date,
      }),
    ),
    ...claimHits.map((c): SearchResult => {
      const predicate = (c.payload as Record<string, unknown>).predicate;
      return {
        type: 'claim',
        title: typeof predicate === 'string' ? publicText(predicate) : c.claimId,
        href: '/accountability',
        snippet: `status: ${c.status.replaceAll('-', ' ')}`,
        date: c.openedAt,
      };
    }),
  ];
}
