import { FieldMap } from '@/components/FieldMap';
import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { getConvictionSparks, getRecentThemeEvents, getThemeMapCards } from '@/lib/queries/map';
import { pageMetadata } from '@/lib/metadata';
import { safeQuery } from '@/lib/safe';
import { isRetiredAlias } from '@/lib/theme-display';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Theme map',
  description: 'Macro themes tracked by conviction, directional pressure, triggers, and lifecycle.',
  path: '/map',
});

export default async function MapPage() {
  const db = getDb();
  const { takenAt, cards } = await safeQuery(() => getThemeMapCards(db), {
    takenAt: null,
    cards: [],
  });
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  const asOf = new Date().toISOString().slice(0, 10);
  const recent = await safeQuery(() => getRecentThemeEvents(db, asOf), {});
  const present = new Set(cards.map((c) => c.slug));
  const fieldThemes = cards
    .filter((c) => !isRetiredAlias(c.slug, c.status, present))
    .map((c) => ({
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
        <h1>Theme map</h1>
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </div>
      <p className="brief-meta">
        Conviction sets the row. Events from the last 30 days move themes left or right.
      </p>
      {cards.length > 0 ? (
        <section aria-labelledby="the-field">
          <h2 id="the-field">Position map</h2>
          <FieldMap themes={fieldThemes} asOf={asOf} />
        </section>
      ) : null}
      <ThemeGrid cards={cards} sparks={sparks} />
    </main>
  );
}
