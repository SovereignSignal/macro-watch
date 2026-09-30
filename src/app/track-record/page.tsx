import { TrackRecord } from '@/components/TrackRecord';
import { getDb } from '@/db/client';
import { pageMetadata } from '@/lib/metadata';
import { EMPTY_WATCH } from '@/lib/public-watch';
import { getPublishedWatch } from '@/lib/queries/watch';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Track record',
  description: 'Hit rate, Brier score, and open calls from Sovs Macro.',
  path: '/track-record',
});

export default async function TrackRecordPage() {
  const watch = await safeQuery(() => getPublishedWatch(getDb()), EMPTY_WATCH);
  return (
    <main className="container-wide">
      <h1>Track record</h1>
      <p className="accountability-lede">
        Sovs Macro&rsquo;s own calls. The <a href="/accountability">accountability ledger</a> grades
        a separate set of market claims.
      </p>
      <TrackRecord scoreboard={watch.scoreboard} />
    </main>
  );
}
