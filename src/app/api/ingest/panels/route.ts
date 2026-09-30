import { createIngestHandler, type RevalidateTarget } from '@/lib/ingest/handler';
import { panelSchema, upsertPanel } from '@/lib/ingest/panels';

function revalidate(p: { kind: string }): RevalidateTarget[] {
  const targets: RevalidateTarget[] = [{ path: '/' }, { path: '/track-record' }];
  if (p.kind === 'scoreboard') targets.push({ path: '/accountability' });
  return targets;
}

export const POST = createIngestHandler({
  schema: panelSchema,
  upsert: upsertPanel,
  revalidate,
});
