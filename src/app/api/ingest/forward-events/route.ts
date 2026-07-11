import { forwardEventsBodySchema, upsertForwardEvents } from '@/lib/ingest/claims';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: forwardEventsBodySchema,
  upsert: upsertForwardEvents,
  revalidate: () => [{ path: '/catalysts' }],
});
