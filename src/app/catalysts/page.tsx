import { CatalystBoard } from '@/components/CatalystBoard';
import { getDb } from '@/db/client';
import { getForwardEvents } from '@/lib/queries/catalysts';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catalysts' };

export default async function CatalystsPage() {
  const { upcoming, resolved } = await safeQuery(() => getForwardEvents(getDb()), {
    upcoming: [],
    resolved: [],
  });
  return (
    <main className="container">
      <h1>Catalyst board</h1>
      <p className="brief-meta">
        Events the system is watching, what it expects, and what would count as a surprise.
        Resolved events show expectation against outcome.
      </p>
      <CatalystBoard upcoming={upcoming} resolved={resolved} />
    </main>
  );
}
