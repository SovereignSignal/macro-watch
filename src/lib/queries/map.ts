import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents, themes, themeState } from '@/db/schema';
import type { ThemeStateCard } from '@/lib/ingest/themes';

export type ThemeCard = {
  slug: string;
  name: string;
  status: string;
  firstSeen: string | null;
  lastEventAt: string | null;
  conviction: 'low' | 'medium' | 'high' | null;
  read: string | null;
  triggers: { name: string; state: string }[];
  raiseConditions: string[];
  lowerConditions: string[];
};

function toList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function stateCardsOf(payload: unknown): Map<string, ThemeStateCard> {
  const out = new Map<string, ThemeStateCard>();
  const cards = (payload as { themes?: ThemeStateCard[] })?.themes;
  if (Array.isArray(cards)) {
    for (const c of cards) out.set(c.slug, c);
  }
  return out;
}

/**
 * The map = lifecycle truth from the themes table (fed by events) merged with
 * the latest theme_state snapshot's curated card fields (spec §5 /map).
 * Ordered: active, then candidate, then retired; newest activity first.
 */
export async function getThemeMapCards(
  db: Db,
): Promise<{ takenAt: Date | null; cards: ThemeCard[] }> {
  const themeRows = await db.select().from(themes);
  const snaps = await db
    .select({ takenAt: themeState.takenAt, payload: themeState.payload })
    .from(themeState)
    .orderBy(desc(themeState.takenAt))
    .limit(1);
  const snap = snaps[0] ?? null;
  const stateCards = snap ? stateCardsOf(snap.payload) : new Map<string, ThemeStateCard>();

  const bySlug = new Map<string, ThemeCard>();
  for (const t of themeRows) {
    const s = stateCards.get(t.slug);
    bySlug.set(t.slug, {
      slug: t.slug,
      name: t.name,
      status: t.status,
      firstSeen: t.firstSeen,
      lastEventAt: t.lastEventAt,
      conviction: s?.conviction ?? null,
      read: s?.current_read ?? null,
      triggers: s?.triggers ?? [],
      raiseConditions: toList(s?.raise_conditions),
      lowerConditions: toList(s?.lower_conditions),
    });
  }
  // Themes that only exist in the snapshot (state arrived before any event).
  for (const [slug, s] of stateCards) {
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        slug,
        name: s.name,
        status: 'active',
        firstSeen: null,
        lastEventAt: null,
        conviction: s.conviction ?? null,
        read: s.current_read ?? null,
        triggers: s.triggers ?? [],
        raiseConditions: toList(s.raise_conditions),
        lowerConditions: toList(s.lower_conditions),
      });
    }
  }

  const order: Record<string, number> = { active: 0, candidate: 1, retired: 2 };
  const cards = [...bySlug.values()].sort(
    (a, b) =>
      (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
      (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''),
  );
  return { takenAt: snap?.takenAt ?? null, cards };
}

// ----------------------------------------------------- per-theme dossier ---

export type ThemeEventRow = typeof themeEvents.$inferSelect;
export type ConvictionPoint = { takenAt: string; level: 1 | 2 | 3 };
export type RelatedClaim = { claimId: string; openedAt: string; predicate: string; status: string };

export type ThemeDetail = {
  slug: string;
  name: string;
  status: string;
  firstSeen: string | null;
  lastEventAt: string | null;
  card: ThemeCard | null;
  events: ThemeEventRow[];
  relatedClaims: RelatedClaim[];
  conviction: ConvictionPoint[];
  // Event dates (subset of `events[].date`) that have a matching published
  // brief — most theme events land on days without one, so the timeline
  // only links the ones that resolve to a real permalink (spec §5).
  briefDates: string[];
};

const CONVICTION_LEVEL: Record<string, 1 | 2 | 3> = { low: 1, medium: 2, high: 3 };

/** Conviction-over-time from theme_state history (spec §5 /map/[theme]). */
export async function getConvictionSeries(db: Db, slug: string): Promise<ConvictionPoint[]> {
  const snaps = await db
    .select({ takenAt: themeState.takenAt, payload: themeState.payload })
    .from(themeState)
    .orderBy(asc(themeState.takenAt));
  const out: ConvictionPoint[] = [];
  for (const s of snaps) {
    const card = stateCardsOf(s.payload).get(slug);
    const level = card?.conviction ? CONVICTION_LEVEL[card.conviction] : undefined;
    if (level) out.push({ takenAt: s.takenAt.toISOString(), level });
  }
  return out;
}

// cache() dedupes generateMetadata + the page component's fetch into one
// query per request (Next.js request-scoped memoization).
export const getThemeDetail = cache(async (db: Db, slug: string): Promise<ThemeDetail | null> => {
  const themeRows = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
  const themeRow = themeRows[0] ?? null;
  const { cards } = await getThemeMapCards(db);
  const card = cards.find((c) => c.slug === slug) ?? null;
  if (!themeRow && !card) return null;

  const events = await db
    .select()
    .from(themeEvents)
    .where(eq(themeEvents.themeSlug, slug))
    .orderBy(desc(themeEvents.date), desc(themeEvents.eventId));

  const eventDates = [...new Set(events.map((e) => e.date))];
  const briefRows = eventDates.length
    ? await db.select({ date: briefs.date }).from(briefs).where(inArray(briefs.date, eventDates))
    : [];
  const briefDates = briefRows.map((b) => b.date);

  const claimRows = await db
    .select({
      claimId: claims.claimId,
      openedAt: claims.openedAt,
      payload: claims.payload,
      status: claims.status,
    })
    .from(claims)
    .where(sql`${slug} = any(${claims.themes})`)
    .orderBy(desc(claims.openedAt));
  const relatedClaims: RelatedClaim[] = claimRows.map((c) => {
    const predicate = (c.payload as Record<string, unknown>).predicate;
    return {
      claimId: c.claimId,
      openedAt: c.openedAt,
      status: c.status,
      predicate: typeof predicate === 'string' ? predicate : c.claimId,
    };
  });

  return {
    slug,
    name: themeRow?.name ?? card?.name ?? slug,
    status: themeRow?.status ?? card?.status ?? 'active',
    firstSeen: themeRow?.firstSeen ?? null,
    lastEventAt: themeRow?.lastEventAt ?? null,
    card,
    events,
    relatedClaims,
    conviction: await getConvictionSeries(db, slug),
    briefDates,
  };
});
