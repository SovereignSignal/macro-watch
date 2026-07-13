import { and, desc, eq, gte } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';

export type BriefRow = typeof briefs.$inferSelect;

// Smoke sentinels are written with pre-2000 dates (see scripts/smoke.mjs).
// They must NEVER surface on public listings — only their direct permalink
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

export async function getLatestBrief(db: Db): Promise<BriefRow | null> {
  const rows = await db
    .select()
    .from(briefs)
    .where(gte(briefs.date, PUBLIC_BRIEF_MIN_DATE))
    .orderBy(desc(briefs.date))
    .limit(1);
  return rows[0] ?? null;
}

// cache() dedupes generateMetadata + the page component's fetch into one
// query per request (Next.js request-scoped memoization).
export const getBriefByDate = cache(
  async (db: Db, date: string): Promise<BriefRow | null> => {
    const rows = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);
    return rows[0] ?? null;
  },
);

export async function listBriefs(
  db: Db,
  options: { limit?: number; offset?: number } = {},
): Promise<BriefListItem[]> {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)));
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
    .where(gte(briefs.date, PUBLIC_BRIEF_MIN_DATE))
    .orderBy(desc(briefs.date))
    .limit(limit)
    .offset(offset);
}
