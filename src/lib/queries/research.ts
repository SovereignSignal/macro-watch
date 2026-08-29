import { desc, eq, gte } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { researchMemos } from '@/db/schema';
import { PUBLIC_BRIEF_MIN_DATE } from '@/lib/queries/briefs';
import { isPlaceholderResearch } from '@/lib/research-public';

export type ResearchRow = typeof researchMemos.$inferSelect;

export type ResearchListItem = {
  date: string;
  topic: string;
  finding: string;
  generatedAt: Date;
};

function isPublicResearch(row: ResearchPublicish): boolean {
  return row.date >= PUBLIC_BRIEF_MIN_DATE && !isPlaceholderResearch(row);
}

type ResearchPublicish = {
  date: string;
  topic: string;
  finding: string;
  changed?: string;
  decision?: string;
  watch?: string;
  citations?: unknown;
};

export const getResearchByDate = cache(
  async (db: Db, date: string): Promise<ResearchRow | null> => {
    const rows = await db.select().from(researchMemos).where(eq(researchMemos.date, date)).limit(1);
    const row = rows[0] ?? null;
    if (!row || !isPublicResearch(row)) return null;
    return row;
  },
);

export async function listResearch(
  db: Db,
  options: { limit?: number; offset?: number } = {},
): Promise<ResearchListItem[]> {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const rows = await db
    .select({
      date: researchMemos.date,
      topic: researchMemos.topic,
      finding: researchMemos.finding,
      changed: researchMemos.changed,
      watch: researchMemos.watch,
      citations: researchMemos.citations,
      generatedAt: researchMemos.generatedAt,
    })
    .from(researchMemos)
    .where(gte(researchMemos.date, PUBLIC_BRIEF_MIN_DATE))
    .orderBy(desc(researchMemos.date));
  return rows
    .filter((row) => !isPlaceholderResearch(row))
    .slice(offset, offset + limit)
    .map(({ date, topic, finding, generatedAt }) => ({ date, topic, finding, generatedAt }));
}
