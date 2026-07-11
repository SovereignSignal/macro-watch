import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { getConvictionSparks, getThemeMapCards } from '@/lib/queries/map';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Living theme map' };

export default async function MapPage() {
  const db = getDb();
  const { takenAt, cards } = await safeQuery(() => getThemeMapCards(db), {
    takenAt: null,
    cards: [],
  });
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  return (
    <main className="container-wide">
      <div className="page-head">
        <h1>Living theme map</h1>
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </div>
      <p className="brief-meta">
        Every theme the system is tracking — conviction, current read, live triggers, lifecycle.
      </p>
      <ThemeGrid cards={cards} sparks={sparks} />
    </main>
  );
}
