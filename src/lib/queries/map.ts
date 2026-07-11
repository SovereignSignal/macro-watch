import { desc } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { themes, themeState } from '@/db/schema';
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
