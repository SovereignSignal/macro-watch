import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';
import { rejectBlockedPublishers } from '@/lib/security/blocked-publishers';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';
import { revisionSchema, type UpsertCounts } from './revision';

const publicHtmlSchema = z
  .string()
  .min(1)
  .transform(sanitizePublicBriefHtml)
  .refine((html) => html.length > 0, 'html has no public content after sanitization');

const publicTextSchema = z
  .string()
  .min(1)
  .transform(sanitizePublicBriefText)
  .refine((text) => text.length > 0, 'field has no public content after sanitization');

export const briefSchema = rejectBlockedPublishers(z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  kind: z.enum(['daily', 'weekend', 'week-ahead']),
  subject: publicTextSchema,
  telegram_ping: publicTextSchema,
  html: publicHtmlSchema,
  sent_verified_at: z.string().datetime({ offset: true }),
  revision: revisionSchema,
}));

export type BriefPayload = z.infer<typeof briefSchema>;

/**
 * Idempotent upsert on (date, kind). A second kind on the same date is inserted.
 * The row is only rewritten when the incoming revision is >= the stored one:
 * a delayed retry of older content is counted as stale and changes nothing.
 */
export async function upsertBrief(db: Db, p: BriefPayload): Promise<UpsertCounts> {
  const revision = p.revision ?? 0;
  const row = {
    kind: p.kind,
    subject: sanitizePublicBriefText(p.subject),
    ping: sanitizePublicBriefText(p.telegram_ping),
    // Keep the persistence boundary safe even for internal callers that have
    // already typed (but not schema-parsed) a payload.
    html: sanitizePublicBriefHtml(p.html),
    sentVerifiedAt: new Date(p.sent_verified_at),
    revision,
  };
  const written = await db
    .insert(briefs)
    .values({ date: p.date, ...row })
    .onConflictDoUpdate({
      target: [briefs.date, briefs.kind],
      set: { ...row, ingestedAt: new Date() },
      setWhere: sql`excluded.revision >= ${briefs.revision}`,
    })
    .returning({ date: briefs.date });
  return { upserted: written.length, stale: written.length === 0 ? 1 : 0 };
}
