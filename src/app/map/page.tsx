import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { getThemeMapCards } from '@/lib/queries/map';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Living Theme Map' };

export default async function MapPage() {
  const { takenAt, cards } = await safeQuery(() => getThemeMapCards(getDb()), {
    takenAt: null,
    cards: [],
  });
  return (
    <main className="container-wide">
      <h1>Living Theme Map</h1>
      <p className="brief-meta">
        Every theme the system is tracking — conviction, current read, live triggers, lifecycle.{' '}
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </p>
      <ThemeGrid cards={cards} />
    </main>
  );
}
