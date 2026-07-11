import { createIngestHandler } from '@/lib/ingest/handler';
import { themeEventsBodySchema, upsertThemeEvents } from '@/lib/ingest/themes';

export const POST = createIngestHandler({
  schema: themeEventsBodySchema,
  upsert: upsertThemeEvents,
  // 'layout' on /map busts /map and every /map/[theme] page in one call.
  revalidate: () => [{ path: '/' }, { path: '/map', type: 'layout' }],
});
