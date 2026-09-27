import { briefPermalinkKind } from '@/lib/brief-kind';
import { briefSchema, upsertBrief } from '@/lib/ingest/briefs';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: briefSchema,
  upsert: upsertBrief,
  revalidate: (p) => {
    const paths = new Set<string>([
      '/',
      '/briefs',
      `/briefs/${p.date}`,
      `/briefs/${p.date}/${p.kind}`,
      `/briefs/${p.date}/${briefPermalinkKind(p.kind, p.subject)}`,
      '/feed.xml',
    ]);
    return [...paths].map((path) => ({ path }));
  },
});
