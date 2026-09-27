import { and, asc, desc, eq, gte, or, sql, type SQL } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';
import type { BriefKind } from '@/lib/brief-kind';

export type BriefRow = typeof briefs.$inferSelect;

// Smoke sentinels are written with pre-2000 dates (see scripts/smoke.mjs).
// They must NEVER surface on public listings. Only their direct permalink
// renders (which is how the smoke round-trip verifies without polluting the
// site). Every listing/latest/RSS/search query filters through this bound.
export const PUBLIC_BRIEF_MIN_DATE = '2000-01-01';


export type BriefListItem = {
  date: string;
  kind: string;
  subject: string;
  ping: string;
  sentVerifiedAt: Date;
};

const LIST_MAX = 500;

function publicKindFilter(kind?: BriefKind): SQL | undefined {
  const pub = gte(briefs.date, PUBLIC_BRIEF_MIN_DATE);
  // Keep this predicate aligned with briefPermalinkKind: a weekend row whose
  // subject says "week ahead" is a week-ahead note, not a weekend review.
  if (kind === 'daily') {
    return and(pub, eq(briefs.kind, 'daily'), sql`${briefs.subject} !~* 'week ahead'`);
  }
  if (kind === 'weekend') {
    return and(pub, eq(briefs.kind, 'weekend'), sql`${briefs.subject} !~* 'week ahead'`);
  }
  if (kind === 'week-ahead') {
    return and(pub, or(eq(briefs.kind, 'week-ahead'), sql`${briefs.subject} ~* 'week ahead'`));
  }
  return pub;
}

export async function getLatestBrief(db: Db): Promise<BriefRow | null> {
  const rows = await db
    .select()
    .from(briefs)
    .where(gte(briefs.date, PUBLIC_BRIEF_MIN_DATE))
    .orderBy(desc(briefs.date), desc(briefs.sentVerifiedAt), asc(briefs.kind))
    .limit(1);
  return rows[0] ?? null;
}

export const listBriefsForDate = cache(async (db: Db, date: string): Promise<BriefRow[]> => {
  return db
    .select()
    .from(briefs)
    .where(eq(briefs.date, date))
    .orderBy(desc(briefs.sentVerifiedAt), asc(briefs.kind));
});

// cache() dedupes generateMetadata + the page component's fetch into one
// query per request (Next.js request-scoped memoization).
export const getBriefByDate = cache(async (db: Db, date: string): Promise<BriefRow | null> => {
  const rows = await listBriefsForDate(db, date);
  return rows[0] ?? null;
});

export async function listBriefs(
  db: Db,
  options: { limit?: number; offset?: number; kind?: BriefKind } = {},
): Promise<BriefListItem[]> {
  const limit = Math.min(LIST_MAX, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return db
    .select({
      date: briefs.date,
      kind: briefs.kind,
      subject: briefs.subject,
      ping: briefs.ping,
      sentVerifiedAt: briefs.sentVerifiedAt,
    })
    .from(briefs)
    .where(publicKindFilter(options.kind))
    .orderBy(desc(briefs.date), desc(briefs.sentVerifiedAt), asc(briefs.kind))
    .limit(limit)
    .offset(offset);
}
