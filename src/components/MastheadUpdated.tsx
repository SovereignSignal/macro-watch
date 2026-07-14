import { getDb } from '@/db/client';
import { getLatestPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { UpdatedAgo } from './UpdatedAgo';

/**
 * Masthead freshness chip: "updated Nm ago" from the latest dashboard
 * snapshot. Rendered behind <Suspense fallback={null}> in the root layout.
 * no data (or a DB blip) means no chip, never a broken masthead.
 */
export async function MastheadUpdated() {
  const panel = await safeQuery(() => getLatestPanel(getDb(), 'dashboard'), null);
  if (!panel) return null;
  return <UpdatedAgo takenAt={panel.takenAt.toISOString()} />;
}
