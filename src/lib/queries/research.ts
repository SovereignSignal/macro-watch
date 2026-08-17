import { desc, eq, gte } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { researchMemos } from '@/db/schema';
import { PUBLIC_BRIEF_MIN_DATE } from '@/lib/queries/briefs';

export type ResearchRow = typeof researchMemos.$inferSelect;

export type ResearchListItem = {
  date: string;
  topic: string;
  finding: string;
  generatedAt: Date;
};

export const getResearchByDate = cache(
  async (db: Db, date: string): Promise<ResearchRow | null> => {
    const rows = await db.select().from(researchMemos).where(eq(researchMemos.date, date)).limit(1);
    return rows[0] ?? null;
  },
);

export async function listResearch(
  db: Db,
  options: { limit?: number; offset?: number } = {},
): Promise<ResearchListItem[]> {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return db
    .select({
      date: researchMemos.date,
      topic: researchMemos.topic,
      finding: researchMemos.finding,
      generatedAt: researchMemos.generatedAt,
    })
    .from(researchMemos)
    .where(gte(researchMemos.date, PUBLIC_BRIEF_MIN_DATE))
    .orderBy(desc(researchMemos.date))
    .limit(limit)
    .offset(offset);
}
