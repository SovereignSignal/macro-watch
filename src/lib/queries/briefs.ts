import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';

export type BriefRow = typeof briefs.$inferSelect;

export type BriefListItem = {
  date: string;
  kind: string;
  subject: string;
  ping: string;
  sentVerifiedAt: Date;
};

export async function getLatestBrief(db: Db): Promise<BriefRow | null> {
  const rows = await db.select().from(briefs).orderBy(desc(briefs.date)).limit(1);
  return rows[0] ?? null;
}

export async function getBriefByDate(db: Db, date: string): Promise<BriefRow | null> {
  const rows = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);
  return rows[0] ?? null;
}

export async function listBriefs(db: Db): Promise<BriefListItem[]> {
  return db
    .select({
      date: briefs.date,
      kind: briefs.kind,
      subject: briefs.subject,
      ping: briefs.ping,
      sentVerifiedAt: briefs.sentVerifiedAt,
    })
    .from(briefs)
    .orderBy(desc(briefs.date));
}
