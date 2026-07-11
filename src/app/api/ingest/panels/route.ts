import { createIngestHandler } from '@/lib/ingest/handler';
import { panelSchema, upsertPanel } from '@/lib/ingest/panels';

export const POST = createIngestHandler({
  schema: panelSchema,
  upsert: upsertPanel,
  revalidate: (p) => (p.kind === 'scoreboard' ? [{ path: '/accountability' }] : [{ path: '/' }]),
});
