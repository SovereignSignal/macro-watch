import { and, eq, lte, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';
import { publicHttpsUrl, publicValue } from '@/lib/public-copy';
import { rejectBlockedPublishers } from '@/lib/security/blocked-publishers';
import { revisionSchema, type UpsertCounts } from './revision';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// ---------------------------------------------------------------- claims ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// sovs-macro pipeline vocabulary (not the site-plan draft's
// open/resolved_correct/resolved_incorrect/invalidated). hit|miss|partial|void
// are resolved terminal states alongside expired; pending and
// judgment-required are not yet resolved.
const CLAIM_STATUSES = [
  'pending',
  'hit',
  'miss',
  'partial',
  'expired',
  'judgment-required',
  'void',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const claimSchema = z
  .object({
    claim_id: z.string().min(1),
    kind: z.enum(['smart_money', 'map']),
    themes: z.array(z.string()).default([]),
    predicate: z.string().min(1),
    data_anchor: z.string().nullish(),
    source_url: z.string().url().refine((value) => publicHttpsUrl(value) !== null, {
      message: 'must be a public HTTPS URL',
    }).nullish(),
    checkable: z.boolean().nullish(),
    claim_kind: z.string().nullish(),
    opening_probability: z.number().min(0).max(1).nullish(),
    // Quality fields (spec §3): market_type + observable/narrative/geo scores.
    market_type: z.string().nullish(),
    observable_score: z.number().nullish(),
    narrative_score: z.number().nullish(),
    geo_score: z.number().nullish(),
    opened_at: z.string().regex(DATE_RE, 'expected YYYY-MM-DD'),
    expires_at: z.string().regex(DATE_RE).nullish(),
    status: z.enum(CLAIM_STATUSES),
    resolved_at: z.string().regex(DATE_RE).nullish(),
    resolution_note: z.string().nullish(),
    revision: revisionSchema,
  })
  .passthrough()
  .superRefine((claim, ctx) => {
    if (['hit', 'miss', 'partial'].includes(claim.status) && !claim.resolved_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved_at'],
        message: `${claim.status} claims require resolved_at`,
      });
    }
    if (['pending', 'judgment-required'].includes(claim.status) && claim.resolved_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved_at'],
        message: `${claim.status} claims cannot carry resolved_at`,
      });
    }
  });

export type ClaimPayload = z.infer<typeof claimSchema>;

export const claimsBodySchema = rejectBlockedPublishers(z.union([
  z.array(claimSchema).min(1),
  claimSchema.transform((c) => [c]),
]));

/** Prediction fields that are frozen at first sight of a claim. */
const PREDICTION_KEYS = [
  'predicate',
  'opening_probability',
  'opened_at',
  'data_anchor',
  'kind',
  'themes',
  'claim_kind',
  'market_type',
] as const;

function pickPrediction(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PREDICTION_KEYS) out[key] = src[key] ?? null;
  return out;
}

function applyOriginal(
  payload: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  for (const key of PREDICTION_KEYS) {
    const value = original[key];
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

async function lockClaim(tx: Tx, claimId: string) {
  const rows = await tx.select().from(claims).where(eq(claims.claimId, claimId)).for('update');
  return rows[0];
}

/**
 * Idempotent upsert on claim_id; the full body rides in payload jsonb.
 *
 * - A payload whose revision is lower than the stored one is stale and ignored.
 * - The prediction fields of the first stored version are immutable; later
 *   revisions may only change resolution/status/expiry/score fields.
 */
export async function upsertClaims(db: Db, list: ClaimPayload[]): Promise<UpsertCounts> {
  return db.transaction(async (tx) => {
    let upserted = 0;
    let stale = 0;
    for (const c of list) {
      const clean = publicValue(c);
      const revision = c.revision ?? 0;
      const cleanPayload = clean as Record<string, unknown>;

      let existing = await lockClaim(tx, c.claim_id);
      if (!existing) {
        const inserted = await tx
          .insert(claims)
          .values({
            claimId: c.claim_id,
            kind: clean.kind,
            themes: clean.themes,
            payload: cleanPayload,
            status: clean.status,
            openedAt: clean.opened_at,
            expiresAt: clean.expires_at ?? null,
            resolvedAt: clean.resolved_at ?? null,
            revision,
            original: pickPrediction(cleanPayload),
          })
          .onConflictDoNothing()
          .returning({ claimId: claims.claimId });
        if (inserted.length > 0) {
          upserted += 1;
          continue;
        }
        // Lost a race with a concurrent insert; fall through to the update path.
        existing = await lockClaim(tx, c.claim_id);
        if (!existing) {
          stale += 1;
          continue;
        }
      }

      if (revision < existing.revision) {
        stale += 1;
        continue;
      }

      // Legacy rows (pre-migration) have no `original`: freeze what is stored.
      const original =
        (existing.original as Record<string, unknown> | null) ??
        pickPrediction(existing.payload as Record<string, unknown>);

      const updated = await tx
        .update(claims)
        .set({
          kind: (original.kind as 'smart_money' | 'map' | null) ?? clean.kind,
          themes: (original.themes as string[] | null) ?? clean.themes,
          payload: applyOriginal(cleanPayload, original),
          status: clean.status,
          openedAt: (original.opened_at as string | null) ?? clean.opened_at,
          expiresAt: clean.expires_at ?? null,
          resolvedAt: clean.resolved_at ?? null,
          revision,
          original,
        })
        .where(and(eq(claims.claimId, c.claim_id), lte(claims.revision, revision)))
        .returning({ claimId: claims.claimId });
      if (updated.length > 0) upserted += 1;
      else stale += 1;
    }
    return { upserted, stale };
  });
}

// -------------------------------------------------------- forward events ---

export const forwardEventSchema = z
  .object({
    event_id: z.string().min(1),
    date: z.string().regex(DATE_RE, 'expected YYYY-MM-DD'),
    event: z.string().min(1),
    expectation: z.string().min(1),
    surprise: z.string().min(1), // what-would-surprise framing (spec §5)
    resolution: z
      .object({
        outcome: z.string().min(1),
        resolved_at: z.string().regex(DATE_RE).nullish(),
        note: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    revision: revisionSchema,
  })
  .passthrough();

export type ForwardEventPayload = z.infer<typeof forwardEventSchema>;

const forwardEventSnapshotSchema = z.object({
  events: z.array(forwardEventSchema),
  replace: z.literal(true),
  // Applies to events that do not carry their own revision.
  revision: revisionSchema,
});

export const forwardEventsBodySchema = z.union([
  forwardEventSnapshotSchema,
  z.array(forwardEventSchema).min(1).transform((events) => ({
    events,
    replace: false as const,
    revision: undefined as number | undefined,
  })),
  forwardEventSchema.transform((event) => ({
    events: [event],
    replace: false as const,
    revision: undefined as number | undefined,
  })),
]);

export type ForwardEventsBody = z.infer<typeof forwardEventsBodySchema>;

async function lockForwardEvent(tx: Tx, eventId: string) {
  const rows = await tx
    .select()
    .from(forwardEvents)
    .where(eq(forwardEvents.eventId, eventId))
    .for('update');
  return rows[0];
}

function snapshotRevision(body: ForwardEventsBody): number {
  if (body.revision !== undefined) return body.revision;
  let max = 0;
  for (const event of body.events) max = Math.max(max, event.revision ?? 0);
  return max;
}

/**
 * Idempotent upsert on event_id. Authoritative snapshots also remove rows that
 * are no longer in the public projection; incremental legacy posts never do.
 *
 * - Rows with a lower revision than stored are stale and ignored.
 * - The first stored `expectation` and `surprise` are immutable.
 * - A replace snapshot older than the newest stored row skips its delete step
 *   (still applying guarded per-row upserts) and is reported as stale.
 */
export async function upsertForwardEvents(db: Db, body: ForwardEventsBody): Promise<UpsertCounts> {
  return db.transaction(async (tx) => {
    let upserted = 0;
    let stale = 0;
    let snapshotStale = false;

    if (body.replace) {
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${forwardEvents.revision}), 0)`.mapWith(Number) })
        .from(forwardEvents);
      snapshotStale = snapshotRevision(body) < max;
    }

    for (const f of body.events) {
      const clean = publicValue(f);
      const revision = f.revision ?? body.revision ?? 0;
      const { resolution, event_id, date, ...payload } = clean;
      const newPayload = { event_id, date, ...payload } as Record<string, unknown>;
      const newResolution = (resolution ?? null) as Record<string, unknown> | null;

      let existing = await lockForwardEvent(tx, event_id);
      if (!existing) {
        const inserted = await tx
          .insert(forwardEvents)
          .values({
            eventId: event_id,
            eventDate: date,
            payload: newPayload,
            resolution: newResolution,
            revision,
          })
          .onConflictDoNothing()
          .returning({ eventId: forwardEvents.eventId });
        if (inserted.length > 0) {
          upserted += 1;
          continue;
        }
        existing = await lockForwardEvent(tx, event_id);
        if (!existing) {
          stale += 1;
          continue;
        }
      }

      if (revision < existing.revision) {
        stale += 1;
        continue;
      }

      const stored = existing.payload as Record<string, unknown>;
      const nextPayload = { ...newPayload };
      if (typeof stored.expectation === 'string') nextPayload.expectation = stored.expectation;
      if (typeof stored.surprise === 'string') nextPayload.surprise = stored.surprise;

      const updated = await tx
        .update(forwardEvents)
        .set({
          eventDate: date,
          payload: nextPayload,
          resolution: newResolution,
          revision,
        })
        .where(and(eq(forwardEvents.eventId, event_id), lte(forwardEvents.revision, revision)))
        .returning({ eventId: forwardEvents.eventId });
      if (updated.length > 0) upserted += 1;
      else stale += 1;
    }

    if (body.replace) {
      if (snapshotStale) {
        // The snapshot itself is out of date: never delete newer rows.
        stale = Math.max(stale, 1);
      } else {
        const ids = body.events.map((event) => event.event_id);
        if (ids.length > 0) {
          await tx.delete(forwardEvents).where(notInArray(forwardEvents.eventId, ids));
        } else {
          await tx.delete(forwardEvents);
        }
      }
    }
    return { upserted, stale };
  });
}
