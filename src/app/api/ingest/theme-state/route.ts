import { createIngestHandler } from '@/lib/ingest/handler';
import { themeStateSchema, upsertThemeState } from '@/lib/ingest/themes';

export const POST = createIngestHandler({
  schema: themeStateSchema,
  upsert: upsertThemeState,
  revalidate: () => [{ path: '/' }, { path: '/map', type: 'layout' }],
});
