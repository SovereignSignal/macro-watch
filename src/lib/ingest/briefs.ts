import { z } from 'zod';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';

export const briefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  kind: z.enum(['daily', 'weekend']),
  subject: z.string().min(1),
  telegram_ping: z.string().min(1),
  html: z.string().min(1),
  sent_verified_at: z.string().datetime({ offset: true }),
});

export type BriefPayload = z.infer<typeof briefSchema>;

/** Idempotent upsert on the natural key `date` (spec §4: briefs(date pk)). */
export async function upsertBrief(db: Db, p: BriefPayload): Promise<number> {
  const row = {
    kind: p.kind,
    subject: p.subject,
    ping: p.telegram_ping,
    html: p.html,
    sentVerifiedAt: new Date(p.sent_verified_at),
  };
  await db
    .insert(briefs)
    .values({ date: p.date, ...row })
    .onConflictDoUpdate({ target: briefs.date, set: { ...row, ingestedAt: new Date() } });
  return 1;
}
