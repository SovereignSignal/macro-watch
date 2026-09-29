import { asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents, themes, themeState } from '@/db/schema';
import { type FieldEvent, windowStart } from '@/lib/field-map';
import type { ThemeStateCard } from '@/lib/ingest/themes';
import { publicText, publicValue } from '@/lib/public-copy';
import { canonicalThemeSlug, displayThemeName, themeFamily, visibleThemeCards } from '@/lib/theme-display';

export type ThemeCard = {
  slug: string;
  name: string;
  description: string;
  status: string;
  phase?: string | null;
  firstSeen: string | null;
  lastEventAt: string | null;
  conviction: 'low' | 'medium' | 'high' | null;
  read: string | null;
  triggers: { name: string; state: string }[];
  raiseConditions: string[];
  lowerConditions: string[];
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
  'long-end-funding-pressure':
    'Tracks term premium and long-end Treasury supply as a funding-stress signal.',
  'dollar-plumbing-versus-gold':
    'Tracks whether reserve drain and a metals bid are reading the same plumbing shock.',
  'dollar-plumbing-vs-gold':
    'Tracks whether reserve drain and a metals bid are reading the same plumbing shock.',
  'gold-miners-real-assets':
    'Tracks gold, silver, and miners as a policy-credibility and real-rate signal.',
  'red-sea-bab-al-mandab-export-chokepoint':
    'Tracks whether Red Sea and Bab al-Mandab disruption is moving export costs.',
  'official-currency-defense-yen-funded-leverage':
    'Tracks yen-funded leverage and official defense of currency and duration.',
};

export const NEUTRAL_THEME_DESCRIPTION = 'No theme summary yet.';

function normalizeThemePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2014\u2013-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `Tracks japan repatriation.` restates the name. A real summary says more. */
function isAutoThemeDescription(description: string, slug: string, name: string): boolean {
  const normalized = normalizeThemePhrase(description);
  const labels = [displayThemeName(slug, name), name, slug.replace(/-/g, ' ')];
  return labels.some((label) => {
    const phrase = normalizeThemePhrase(`tracks ${label}`);
    return phrase.length > 'tracks '.length && phrase === normalized;
  });
}

function curatedThemeDescription(slug: string): string | undefined {
  return THEME_DESCRIPTIONS[slug] ?? THEME_DESCRIPTIONS[canonicalThemeSlug(slug)];
}

export function themeDescriptionFor(slug: string, name: string, supplied?: string | null): string {
  const suppliedText = supplied?.trim() ?? '';
  if (suppliedText && !isAutoThemeDescription(suppliedText, slug, name)) return publicText(suppliedText);
  return publicText(curatedThemeDescription(slug) ?? NEUTRAL_THEME_DESCRIPTION);
}

function toList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
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
/**
 * The map's clock: the newest event date in the pipeline's latest snapshot
 * (`last_event_date`). The pipeline dates dormancy from its own newest event,
 * never the wall clock, so a replay is deterministic and a quiet weekend does
 * not retire anything. The site reads the same clock so both sides count the
 * same candidates as dormant (2026-09-05: housing/residential was dormant on
 * the site at 46 days by the wall clock and a candidate in the pipeline at
 * 45 days by its own clock).
 */
export function mapClockOf(payload: unknown): string | null {
  const v = (payload as { last_event_date?: unknown } | null)?.last_event_date;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Latest snapshot's map clock, or null when no snapshot carries one. */
export async function getMapClock(db: Db): Promise<string | null> {
  const snaps = await db
    .select({ payload: themeState.payload })
    .from(themeState)
    .orderBy(desc(themeState.takenAt))
    .limit(1);
  return snaps[0] ? mapClockOf(snaps[0].payload) : null;
}

export async function getThemeMapCards(
  db: Db,
): Promise<{ takenAt: Date | null; cards: ThemeCard[]; asOf: string | null }> {
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
      name: displayThemeName(t.slug, publicText(t.name)),
      description: themeDescriptionFor(t.slug, t.name, s?.description),
      status: s?.status === 'invalidated' ? 'retired' : s?.status ?? t.status,
      phase: s?.cell_phase ?? null,
      firstSeen: t.firstSeen,
      lastEventAt: [t.lastEventAt, s?.last_seen].filter(Boolean).sort().at(-1) ?? null,
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
        name: displayThemeName(slug, s.name),
        description: themeDescriptionFor(slug, s.name, s.description),
        status: s.status === 'invalidated' ? 'retired' : s.status ?? 'active',
        phase: s.cell_phase ?? null,
        firstSeen: s.first_seen ?? null,
        lastEventAt: s.last_seen ?? null,
        conviction: s.conviction ?? null,
        read: s.current_read ?? null,
        triggers: s.triggers ?? [],
        raiseConditions: toList(s.raise_conditions),
        lowerConditions: toList(s.lower_conditions),
      });
    }
  }

  const order: Record<string, number> = { active: 0, candidate: 1, retired: 2 };
  const cards = visibleThemeCards([...bySlug.values()]).sort(
    (a, b) =>
      (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
      (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''),
  );
  return { takenAt: snap?.takenAt ?? null, cards, asOf: snap ? mapClockOf(snap.payload) : null };
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
      source: themeEvents.source,
      date: themeEvents.date,
    })
    .from(themeEvents)
    .where(gte(themeEvents.date, windowStart(asOf)));
  const out: Record<string, FieldEvent[]> = {};
  for (const r of rows) (out[r.slug] ??= []).push({ direction: r.direction, date: r.date, source: r.source });
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

function convictionLevel(card: ThemeStateCard | undefined): 1 | 2 | 3 | undefined {
  return card?.conviction ? CONVICTION_LEVEL[card.conviction] : undefined;
}

/** Prefer a family card that has a conviction, canonical name first. */
function familyStateCard(cards: Map<string, ThemeStateCard>, slug: string): ThemeStateCard | undefined {
  const members = themeFamily(slug);
  for (const member of members) {
    const card = cards.get(member);
    if (card?.conviction) return card;
  }
  for (const member of members) {
    const card = cards.get(member);
    if (card) return card;
  }
  return undefined;
}

/** Conviction-over-time from theme_state history (spec §5 /map/[theme]). */
export async function getConvictionSeries(db: Db, slug: string): Promise<ConvictionPoint[]> {
  const snaps = await db
    .select({ takenAt: themeState.takenAt, payload: themeState.payload })
    .from(themeState)
    .orderBy(asc(themeState.takenAt));
  const out: ConvictionPoint[] = [];
  for (const s of snaps) {
    const level = convictionLevel(familyStateCard(stateCardsOf(s.payload), slug));
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
  const parsed = snaps.map((s) => stateCardsOf(s.payload));
  const seen = new Set(parsed.flatMap((cards) => [...cards.keys()]));
  const out: Record<string, number[]> = {};
  for (const cards of parsed) {
    const used = new Set<string>();
    const entries = [...cards.entries()].sort((a, b) => {
      const aAlias = a[0] === canonicalThemeSlug(a[0]) ? 0 : 1;
      const bAlias = b[0] === canonicalThemeSlug(b[0]) ? 0 : 1;
      return aAlias - bAlias;
    });
    for (const [slug, card] of entries) {
      const canonical = canonicalThemeSlug(slug);
      const key = canonical !== slug && seen.has(canonical) ? canonical : slug;
      if (used.has(key)) continue;
      const level = convictionLevel(card);
      if (!level) continue;
      used.add(key);
      (out[key] ??= []).push(level);
    }
  }
  return out;
}

/** True when the canonical slug has its own theme row or snapshot card. */
export async function hasCanonicalTheme(db: Db, slug: string): Promise<boolean> {
  const canonical = canonicalThemeSlug(slug);
  if (canonical === slug) return false;
  const rows = await db.select({ slug: themes.slug }).from(themes).where(eq(themes.slug, canonical)).limit(1);
  if (rows.length > 0) return true;
  const snaps = await db
    .select({ payload: themeState.payload })
    .from(themeState)
    .orderBy(desc(themeState.takenAt))
    .limit(1);
  return snaps[0] ? stateCardsOf(snaps[0].payload).has(canonical) : false;
}

// cache() dedupes generateMetadata + the page component's fetch into one
// query per request (Next.js request-scoped memoization).
export const getThemeDetail = cache(async (db: Db, slug: string): Promise<ThemeDetail | null> => {
  const family = themeFamily(slug);
  const themeRows = await db.select().from(themes).where(inArray(themes.slug, family));
  const themeRow = themeRows.find((row) => row.slug === slug) ?? null;
  const { cards } = await getThemeMapCards(db);
  const card = cards.find((c) => c.slug === slug) ?? null;
  if (!themeRow && !card) return null;

  const events = publicValue(await db
    .select()
    .from(themeEvents)
    .where(inArray(themeEvents.themeSlug, family))
    .orderBy(desc(themeEvents.date), desc(themeEvents.eventId)));

  const eventDates = [...new Set(events.map((e) => e.date))];
  const briefRows = eventDates.length
    ? await db.select({ date: briefs.date }).from(briefs).where(inArray(briefs.date, eventDates))
    : [];
  const briefDates = [...new Set(briefRows.map((b) => b.date))];

  const claimRows = await db
    .select({
      claimId: claims.claimId,
      openedAt: claims.openedAt,
      payload: claims.payload,
      status: claims.status,
    })
    .from(claims)
    .where(or(...family.map((member) => sql`${member} = any(${claims.themes})`)))
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
    name: displayThemeName(slug, publicText(themeRow?.name ?? card?.name ?? slug)),
    status: themeRow?.status ?? card?.status ?? 'active',
    firstSeen: themeRows.map((row) => row.firstSeen).filter(Boolean).sort()[0] ?? themeRow?.firstSeen ?? null,
    lastEventAt: themeRows.map((row) => row.lastEventAt).filter((value): value is string => Boolean(value)).sort().at(-1)
      ?? themeRow?.lastEventAt
      ?? null,
    card,
    events,
    relatedClaims,
    conviction: await getConvictionSeries(db, slug),
    briefDates,
  };
});
