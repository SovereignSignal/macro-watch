import { FieldMap } from '@/components/FieldMap';
import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { getConvictionSparks, getRecentThemeEvents, getThemeMapCards } from '@/lib/queries/map';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Living theme map' };

export default async function MapPage() {
  const db = getDb();
  const { takenAt, cards } = await safeQuery(() => getThemeMapCards(db), {
    takenAt: null,
    cards: [],
  });
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  const asOf = new Date().toISOString().slice(0, 10);
  const recent = await safeQuery(() => getRecentThemeEvents(db, asOf), {});
  const fieldThemes = cards.map((c) => ({
    slug: c.slug,
    name: c.name,
    status: c.status,
    conviction: c.conviction,
    lastEventAt: c.lastEventAt,
    events: recent[c.slug] ?? [],
  }));
  return (
    <main className="container-wide">
      <div className="page-head">
        <h1>Living theme map</h1>
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </div>
      <p className="brief-meta">
        Every theme the system is tracking — conviction, current read, live triggers, lifecycle.
      </p>
      {cards.length > 0 ? (
        <section aria-labelledby="the-field">
          <h2 id="the-field">The field</h2>
          <p className="brief-meta">
            Where each theme sits: conviction as the band, the last 30 days of events as the
            pressure that moves it left or right.
          </p>
          <FieldMap themes={fieldThemes} asOf={asOf} />
        </section>
      ) : null}
      <ThemeGrid cards={cards} sparks={sparks} />
    </main>
  );
}
