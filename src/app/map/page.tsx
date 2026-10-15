import { FieldMap } from '@/components/FieldMap';
import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { audienceFor, redactCardText } from '@/lib/audience';
import { isMember } from '@/lib/member-session';
import { getConvictionSparks, getRecentThemeEvents, getThemeMapCards } from '@/lib/queries/map';
import { pageMetadata } from '@/lib/metadata';
import { safeQuery } from '@/lib/safe';
import { isRetiredAlias, themeFamily } from '@/lib/theme-display';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Theme map',
  description: 'Macro themes tracked by conviction, directional pressure, triggers, and lifecycle.',
  path: '/map',
});

export default async function MapPage() {
  const db = getDb();
  const audience = audienceFor(await isMember());
  const {
    takenAt,
    cards: rawCards,
    asOf: mapClock,
  } = await safeQuery(() => getThemeMapCards(db), {
    takenAt: null,
    cards: [],
    asOf: null,
  });
  const cards = rawCards.map((card) => redactCardText(card, audience));
  const sparks = await safeQuery(() => getConvictionSparks(db), {});
  // Dormancy and the 30-day field window run on the map's own clock (the
  // snapshot's newest event date), the same clock the pipeline uses; today
  // is only the fallback when no snapshot has arrived yet.
  const asOf = mapClock ?? new Date().toISOString().slice(0, 10);
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
      events: themeFamily(c.slug).flatMap((member) => recent[member] ?? []),
    }));
  return (
    <main className="container-wide">
      <div className="page-head">
        <h1>Theme map</h1>
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </div>
      <p className="brief-meta">
        High conviction sits at the top. Events from the last 30 days move a theme left when it was
        lowered and right when it was raised.
      </p>
      {cards.length > 0 ? (
        <section aria-labelledby="the-field">
          <h2 id="the-field">Where themes stand</h2>
          <FieldMap themes={fieldThemes} asOf={asOf} />
        </section>
      ) : null}
      <ThemeGrid cards={cards} sparks={sparks} asOf={asOf} />
    </main>
  );
}
