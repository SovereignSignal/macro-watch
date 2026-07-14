import { CatalystBoard } from '@/components/CatalystBoard';
import { getDb } from '@/db/client';
import { getForwardEvents } from '@/lib/queries/catalysts';
import { pageMetadata } from '@/lib/metadata';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Catalysts',
  description: 'Upcoming macro events, base cases, surprises, and outcomes.',
  path: '/catalysts',
});

export default async function CatalystsPage() {
  const { upcoming, resolved } = await safeQuery(() => getForwardEvents(getDb()), {
    upcoming: [],
    resolved: [],
  });
  return (
    <main className="container">
      <h1>Catalyst board</h1>
      <p className="brief-meta">
        Upcoming events show the base case and surprise threshold. Resolved events compare the call
        with the outcome.
      </p>
      <CatalystBoard upcoming={upcoming} resolved={resolved} />
    </main>
  );
}
