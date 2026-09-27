import { z } from 'zod';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';
import { rejectBlockedPublishers } from '@/lib/security/blocked-publishers';
import { sanitizePublicBriefHtml, sanitizePublicBriefText } from '@/lib/security/public-brief-html';

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
}));

export type BriefPayload = z.infer<typeof briefSchema>;

/** Idempotent upsert on (date, kind). A second kind on the same date is inserted. */
export async function upsertBrief(db: Db, p: BriefPayload): Promise<number> {
  const row = {
    kind: p.kind,
    subject: sanitizePublicBriefText(p.subject),
    ping: sanitizePublicBriefText(p.telegram_ping),
    // Keep the persistence boundary safe even for internal callers that have
    // already typed (but not schema-parsed) a payload.
    html: sanitizePublicBriefHtml(p.html),
    sentVerifiedAt: new Date(p.sent_verified_at),
  };
  await db
    .insert(briefs)
    .values({ date: p.date, ...row })
    .onConflictDoUpdate({
      target: [briefs.date, briefs.kind],
      set: { ...row, ingestedAt: new Date() },
    });
  return 1;
}
