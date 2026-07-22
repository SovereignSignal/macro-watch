import { asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { cache } from 'react';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents, themes, themeState } from '@/db/schema';
import { type FieldEvent, windowStart } from '@/lib/field-map';
import {
  type EvidenceLifecycle,
  type ThemeStateCard,
  themeStateCardSchema,
} from '@/lib/ingest/themes';
import { publicText, publicValue } from '@/lib/public-copy';

export type ThemeStatus = 'active' | 'candidate' | 'retired';
export type EvidenceAttentionStatus =
  | 'live'
  | 'stale'
  | 'retire_review'
  | 'unassessed'
  | 'date_error'
  | 'archived';

export type ThemeCard = {
  slug: string;
  name: string;
  description: string;
  status: ThemeStatus;
  firstSeen: string | null;
  lastEventAt: string | null;
  conviction: 'low' | 'medium' | 'high' | null;
  read: string | null;
  triggers: { name: string; state: string }[];
  raiseConditions: string[];
  lowerConditions: string[];
  evidence: string | null;
  evidenceLifecycle: EvidenceLifecycle | null;
  lastSeen: string | null;
  lastChanged: string | null;
  nextCheck: string | null;
  attentionStatus: EvidenceAttentionStatus;
  evidenceAgeDays: number | null;
};

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC timestamp for a real ISO civil day, or null for rollover/format errors. */
function isoDay(value: string): number | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? [];
  const parsed = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(parsed);
  if (
    Number.isNaN(parsed) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

/** Read-time freshness from UTC civil days. It never mutates lifecycle status. */
export function evidenceFreshness(
  lastBasisChangeDate: string | null | undefined,
  asOf: string,
  themeStatus: ThemeStatus = 'active',
): { attentionStatus: EvidenceAttentionStatus; evidenceAgeDays: number | null } {
  const asOfDay = isoDay(asOf);
  if (asOfDay === null) throw new RangeError('asOf must be a valid YYYY-MM-DD date');
  if (themeStatus === 'retired') {
    return { attentionStatus: 'archived', evidenceAgeDays: null };
  }
  if (lastBasisChangeDate === null || lastBasisChangeDate === undefined) {
    return { attentionStatus: 'unassessed', evidenceAgeDays: null };
  }
  const basisDay = isoDay(lastBasisChangeDate);
  if (basisDay === null || basisDay > asOfDay) {
    return { attentionStatus: 'date_error', evidenceAgeDays: null };
  }
  const evidenceAgeDays = (asOfDay - basisDay) / DAY_MS;
  const attentionStatus = evidenceAgeDays <= 7
    ? 'live'
    : evidenceAgeDays <= 21
      ? 'stale'
      : 'retire_review';
  return { attentionStatus, evidenceAgeDays };
}

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

function stateCardsOf(payload: unknown): Map<string, ThemeStateCard> {
  const out = new Map<string, ThemeStateCard>();
  const cards = (payload as { themes?: unknown })?.themes;
  if (Array.isArray(cards)) {
    for (const candidate of cards) {
      const parsed = themeStateCardSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const clean = publicValue(parsed.data);
      out.set(clean.slug, clean);
    }
  }
  return out;
}

function normalizeStatus(status: unknown, fallback: ThemeStatus): ThemeStatus {
  if (status === 'invalidated' || status === 'retired') return 'retired';
  if (status === 'candidate' || status === 'active') return status;
  return fallback;
}

function evidenceFields(s: ThemeStateCard | undefined, asOf: string, status: ThemeStatus) {
  const lifecycle = s?.evidence_lifecycle ?? null;
  return {
    evidence: s?.evidence ? publicText(s.evidence) : null,
    evidenceLifecycle: lifecycle ? publicValue(lifecycle) : null,
    lastSeen: s?.last_seen ?? null,
    lastChanged: s?.last_changed ?? null,
    nextCheck: s?.next_check ? publicText(s.next_check) : null,
    ...evidenceFreshness(lifecycle?.last_basis_change_date, asOf, status),
  };
}

/**
 * The latest snapshot reducer status is authoritative; the themes table is a
 * legacy fallback only. Silence/freshness never changes lifecycle status.
 * Ordered: active, then candidate, then retired; newest activity first.
 */
export async function getThemeMapCards(
  db: Db,
  asOf = new Date().toISOString().slice(0, 10),
): Promise<{ takenAt: Date | null; cards: ThemeCard[] }> {
  // Validate the injected clock even when there are no cards.
  evidenceFreshness(null, asOf);
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
    const status = normalizeStatus(s?.status, normalizeStatus(t.status, 'active'));
    bySlug.set(t.slug, {
      slug: t.slug,
      name: publicText(t.name),
      description: themeDescription(t.slug, t.name, s?.description),
      status,
      firstSeen: t.firstSeen,
      lastEventAt: t.lastEventAt,
      conviction: s?.conviction ?? null,
      read: s?.current_read ? publicText(s.current_read) : null,
      triggers: publicValue(s?.triggers ?? []),
      raiseConditions: publicValue(toList(s?.raise_conditions)),
      lowerConditions: publicValue(toList(s?.lower_conditions)),
      ...evidenceFields(s, asOf, status),
    });
  }
  // Themes that only exist in the snapshot (state arrived before any event).
  for (const [slug, s] of stateCards) {
    if (!bySlug.has(slug)) {
      const status = normalizeStatus(s.status, 'active');
      bySlug.set(slug, {
        slug,
        name: publicText(s.name),
        description: themeDescription(slug, s.name, s.description),
        status,
        firstSeen: null,
        lastEventAt: null,
        conviction: s.conviction ?? null,
        read: s.current_read ? publicText(s.current_read) : null,
        triggers: publicValue(s.triggers ?? []),
        raiseConditions: publicValue(toList(s.raise_conditions)),
        lowerConditions: publicValue(toList(s.lower_conditions)),
        ...evidenceFields(s, asOf, status),
      });
    }
  }

  const order: Record<ThemeStatus, number> = { active: 0, candidate: 1, retired: 2 };
  const cards = [...bySlug.values()].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
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
  status: ThemeStatus;
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
export const getThemeDetail = cache(async (
  db: Db,
  slug: string,
  asOf = new Date().toISOString().slice(0, 10),
): Promise<ThemeDetail | null> => {
  const themeRows = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
  const themeRow = themeRows[0] ?? null;
  const { cards } = await getThemeMapCards(db, asOf);
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
    status: card?.status ?? normalizeStatus(themeRow?.status, 'active'),
    firstSeen: themeRow?.firstSeen ?? null,
    lastEventAt: themeRow?.lastEventAt ?? null,
    card,
    events,
    relatedClaims,
    conviction: await getConvictionSeries(db, slug),
    briefDates,
  };
});
