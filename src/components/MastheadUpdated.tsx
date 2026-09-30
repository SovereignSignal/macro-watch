import { getDb } from '@/db/client';
import { getLatestPanel } from '@/lib/queries/panels';
import { getPublishedWatch } from '@/lib/queries/watch';
import { EMPTY_WATCH } from '@/lib/public-watch';
import { safeQuery } from '@/lib/safe';
import { UpdatedAgo } from './UpdatedAgo';

async function payloadStamp(): Promise<string | null> {
  const watch = await safeQuery(() => getPublishedWatch(getDb()), EMPTY_WATCH);
  return watch.updatedAt;
}

/**
 * Masthead freshness chip. Prefers the payload `updated_at`. Older snapshots
 * that omit it keep the dashboard snapshot time.
 */
export async function MastheadUpdated() {
  const updatedAt = await payloadStamp();
  if (updatedAt) return <UpdatedAgo takenAt={updatedAt} lead="Updated" />;
  const panel = await safeQuery(() => getLatestPanel(getDb(), 'dashboard'), null);
  if (!panel) return null;
  return <UpdatedAgo takenAt={panel.takenAt.toISOString()} />;
}

/** Footer copy of the payload timestamp. Missing `updated_at` renders nothing. */
export async function FooterUpdated() {
  const updatedAt = await payloadStamp();
  if (!updatedAt) return null;
  return (
    <p>
      <UpdatedAgo takenAt={updatedAt} lead="Updated" />
    </p>
  );
}
