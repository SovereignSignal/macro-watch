import { desc, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { briefs, claims, researchMemos, themeEvents } from '@/db/schema';
import { PUBLIC_BRIEF_MIN_DATE } from '@/lib/queries/briefs';
import { isPlaceholderResearch, publicResearchText } from '@/lib/research-public';
import { briefPath } from '@/lib/brief-kind';
import { mentionsBlockedPublisher } from '@/lib/security/blocked-publishers';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';
import { publicText } from '@/lib/public-copy';

export type SearchResult = {
  type: 'brief' | 'theme-event' | 'claim' | 'research';
  title: string;
  href: string;
  snippet: string;
  date: string;
};

const LIMIT = 20;

/**
 * Postgres full-text across briefs, theme events, claims, and research.
 * `q` always travels as a bound parameter via drizzle's `sql` tag, never
 * string-concatenated, so quotes and injection attempts are just inert
 * search text (see tests/search.test.tsx).
 */
export async function searchAll(db: Db, q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query === '' || mentionsBlockedPublisher(query)) return [];

  const briefHits = await db
    .select({ date: briefs.date, kind: briefs.kind, subject: briefs.subject, ping: briefs.ping })
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

  const researchHits = await db
    .select({
      date: researchMemos.date,
      topic: researchMemos.topic,
      finding: researchMemos.finding,
      citations: researchMemos.citations,
    })
    .from(researchMemos)
    .where(sql`${researchMemos.search} @@ websearch_to_tsquery('english', ${query}) AND ${researchMemos.date} >= ${PUBLIC_BRIEF_MIN_DATE}`)
    .orderBy(desc(researchMemos.date))
    .limit(LIMIT);

  return [
    ...briefHits
      .filter((b) => !mentionsBlockedPublisher(b.subject) && !mentionsBlockedPublisher(b.ping))
      .map(
      (b): SearchResult => ({
        type: 'brief',
        title: sanitizePublicBriefText(b.subject),
        href: briefPath(b.date, b.kind, b.subject),
        snippet: sanitizePublicBriefText(b.ping),
        date: b.date,
      }),
    ),
    ...eventHits
      .filter((e) => !mentionsBlockedPublisher(e.evidence))
      .map(
      (e): SearchResult => ({
        type: 'theme-event',
        title: `${e.slug}: ${e.direction}`,
        href: `/map/${e.slug}`,
        snippet: publicText(e.evidence),
        date: e.date,
      }),
    ),
    ...claimHits
      .filter((c) => {
        const predicate = (c.payload as Record<string, unknown>).predicate;
        const anchor = (c.payload as Record<string, unknown>).data_anchor;
        return !mentionsBlockedPublisher(`${typeof predicate === 'string' ? predicate : ''} ${typeof anchor === 'string' ? anchor : ''}`);
      })
      .map((c): SearchResult => {
      const predicate = (c.payload as Record<string, unknown>).predicate;
      return {
        type: 'claim',
        title: typeof predicate === 'string' ? publicText(predicate) : c.claimId,
        href: '/accountability',
        snippet: `status: ${c.status.replaceAll('-', ' ')}`,
        date: c.openedAt,
      };
    }),
    ...researchHits
      .filter((row) => !isPlaceholderResearch(row))
      .filter((row) => !mentionsBlockedPublisher(`${row.topic} ${row.finding}`))
      .map(
        (row): SearchResult => ({
          type: 'research',
          title: publicResearchText(sanitizePublicBriefText(row.topic)) || 'Research memo',
          href: `/research/${row.date}`,
          snippet: publicResearchText(sanitizePublicBriefText(row.finding)).slice(0, 220),
          date: row.date,
        }),
      ),
  ];
}
