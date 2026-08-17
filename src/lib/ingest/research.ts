import { z } from 'zod';
import type { Db } from '@/db/client';
import { researchMemos } from '@/db/schema';
import { sanitizePublicBriefText } from '@/lib/security/public-brief-html';

const publicTextSchema = z
  .string()
  .min(1)
  .transform(sanitizePublicBriefText)
  .refine((text) => text.length > 0, 'field has no public content after sanitization');

const citationSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'citation urls must be https'),
  title: z.string().max(300).optional(),
});

export const researchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  topic: publicTextSchema,
  finding: publicTextSchema,
  changed: publicTextSchema,
  decision: publicTextSchema,
  watch: publicTextSchema,
  citations: z.array(citationSchema).max(15).default([]),
  generated_at: z.string().datetime({ offset: true }),
});

export type ResearchPayload = z.infer<typeof researchSchema>;

/** Idempotent upsert on the natural key `date` (one memo per day). */
export async function upsertResearch(db: Db, p: ResearchPayload): Promise<number> {
  const row = {
    topic: sanitizePublicBriefText(p.topic),
    finding: sanitizePublicBriefText(p.finding),
    changed: sanitizePublicBriefText(p.changed),
    decision: sanitizePublicBriefText(p.decision),
    watch: sanitizePublicBriefText(p.watch),
    citations: p.citations.map((c) => ({
      url: c.url,
      ...(c.title ? { title: sanitizePublicBriefText(c.title) } : {}),
    })),
    generatedAt: new Date(p.generated_at),
  };
  await db
    .insert(researchMemos)
    .values({ date: p.date, ...row })
    .onConflictDoUpdate({ target: researchMemos.date, set: { ...row, ingestedAt: new Date() } });
  return 1;
}
