import { researchSchema, upsertResearch } from '@/lib/ingest/research';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: researchSchema,
  upsert: upsertResearch,
  revalidate: (p) => [
    { path: '/research' },
    { path: `/research/${p.date}` },
  ],
});
