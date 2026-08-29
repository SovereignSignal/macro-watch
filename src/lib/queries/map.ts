import { asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents, themes, themeState } from '@/db/schema';
import { parseCellPhase } from '@/lib/cell-phase';
import { type FieldEvent, windowStart } from '@/lib/field-map';
import type { ThemeStateCard } from '@/lib/ingest/themes';
import { publicText, publicValue } from '@/lib/public-copy';

export type ThemeCard = {
  slug: string;
  name: string;
  description: string;
  status: string;
  firstSeen: string | null;
  lastEventAt: string | null;
  conviction: 'low' | 'medium' | 'high' | null;
  read: string | null;
  triggers: { name: string; state: string }[];
  raiseConditions: string[];
  lowerConditions: string[];
  cellPhase: string | null;
  phaseAgeDays: number | null;
};

const THEME_DESCRIPTIONS: Record<string, string> = {
  'narrative-rotation':
    'Tracks shifts between crowded market narratives.',
  'iran-hormuz-oil':
    'Tracks whether Iran and Hormuz risk is causing a real oil shortage.',
  'fed-inflation-rates':
    'Tracks how inflation and jobs data change the expected Fed path.',
  'ai-semis-momentum':
    'Tracks AI demand against valuation, crowding, and financing risk.',
  'stablecoins-tokenized-cash':
    'Tracks stablecoins and tokenized cash as financial infrastructure.',
  'china-capital-tech':
    'Tracks how Chinese policy and technology restrictions affect global demand.',
  'credit-private-markets':
    'Tracks stress and liquidity in private credit and leveraged finance.',
  'supply-chains-trade':
    'Tracks how tariffs, export controls, and logistics disruptions change trade.',
  'em-political-stress':
    'Tracks political and fiscal stress across emerging markets.',
  'crypto-btc':
    'Tracks crypto as a signal for liquidity, policy, and risk appetite.',
  'rate-path-repricing':
    'Tracks how new data changes the expected path of policy rates.',
  'dollar-downtrend':
    'Tracks whether rates and capital flows support a weaker US dollar.',
  'china-reflation':
    'Tracks whether Chinese stimulus is reviving demand and commodity growth.',
};

function themeDescription(slug: string, name: string, supplied?: string | null): string {
  return publicText(
    supplied?.trim() ||
    THEME_DESCRIPTIONS[slug] ||
    `Tracks ${name.toLowerCase()}.`
  );
}

function toList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function phaseAgeDaysOf(card: ThemeStateCard | undefined): number | null {
  const value = card?.phase_age_days;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cardFields(s: ThemeStateCard | undefined) {
  return {
    conviction: s?.conviction ?? null,
    read: s?.current_read ?? null,
    triggers: s?.triggers ?? [],
    raiseConditions: toList(s?.raise_conditions),
    lowerConditions: toList(s?.lower_conditions),
    cellPhase: parseCellPhase(s?.cell_phase),
    phaseAgeDays: phaseAgeDaysOf(s),
  };
}

function stateCardsOf(payload: unknown): Map<string, ThemeStateCard> {
  const out = new Map<string, ThemeStateCard>();
  const cards = (payload as { themes?: ThemeStateCard[] })?.themes;
  if (Array.isArray(cards)) {
    for (const c of cards) {
      const clean = publicValue(c);
      out.set(clean.slug, clean);
    }
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
      name: publicText(t.name),
      description: themeDescription(t.slug, t.name, s?.description),
      status: t.status,
      firstSeen: t.firstSeen,
      lastEventAt: t.lastEventAt,
      ...cardFields(s),
    });
  }
  // Themes that only exist in the snapshot (state arrived before any event).
  for (const [slug, s] of stateCards) {
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        slug,
        name: s.name,
        description: themeDescription(slug, s.name, s.description),
        status: 'active',
        firstSeen: null,
        lastEventAt: null,
        ...cardFields(s),
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

/**
 * Every theme event inside the field's 30-day pressure window, grouped by
 * theme. Feeds the /map hero's x-axis (presentation read only).
 */
export async function getRecentThemeEvents(
  db: Db,
  asOf: string,
): Promise<Record<string, FieldEvent[]>> {
  const rows = await db
    .select({
      slug: themeEvents.themeSlug,
      direction: themeEvents.direction,
      date: themeEvents.date,
    })
    .from(themeEvents)
    .where(gte(themeEvents.date, windowStart(asOf)));
  const out: Record<string, FieldEvent[]> = {};
  for (const r of rows) (out[r.slug] ??= []).push({ direction: r.direction, date: r.date });
  return out;
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
  // brief. Most theme events land on days without one, so the timeline
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

/**
 * Conviction levels per theme across the most recent snapshots (oldest →
 * newest) for the instrument-card sparklines. Presentation-only read,
 * bounded to the last `limit` snapshots so it stays cheap as history grows.
 */
export async function getConvictionSparks(
  db: Db,
  limit = 32,
): Promise<Record<string, number[]>> {
  const snaps = await db
    .select({ payload: themeState.payload })
    .from(themeState)
    .orderBy(desc(themeState.takenAt))
    .limit(limit);
  snaps.reverse();
  const out: Record<string, number[]> = {};
  for (const s of snaps) {
    for (const [slug, card] of stateCardsOf(s.payload)) {
      const level = card.conviction ? CONVICTION_LEVEL[card.conviction] : undefined;
      if (level) (out[slug] ??= []).push(level);
    }
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

  const events = publicValue(await db
    .select()
    .from(themeEvents)
    .where(eq(themeEvents.themeSlug, slug))
    .orderBy(desc(themeEvents.date), desc(themeEvents.eventId)));

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
      predicate: typeof predicate === 'string' ? publicText(predicate) : c.claimId,
    };
  });

  return {
    slug,
    name: publicText(themeRow?.name ?? card?.name ?? slug),
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
