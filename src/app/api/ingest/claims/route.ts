import { claimsBodySchema, upsertClaims } from '@/lib/ingest/claims';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: claimsBodySchema,
  upsert: upsertClaims,
  // Claims render on /accountability and as "related claims" on theme pages.
  revalidate: () => [{ path: '/accountability' }, { path: '/map', type: 'layout' }],
});
