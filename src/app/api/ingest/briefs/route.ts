import { briefSchema, upsertBrief } from '@/lib/ingest/briefs';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: briefSchema,
  upsert: upsertBrief,
  revalidate: (p) => [
    { path: '/' },
    { path: '/briefs' },
    { path: `/briefs/${p.date}` },
    { path: '/feed.xml' },
  ],
});
