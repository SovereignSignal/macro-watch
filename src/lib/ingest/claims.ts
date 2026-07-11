import { z } from 'zod';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';

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
  })
  .passthrough();

export type ClaimPayload = z.infer<typeof claimSchema>;

export const claimsBodySchema = z.union([
  z.array(claimSchema).min(1),
  claimSchema.transform((c) => [c]),
]);

/** Idempotent upsert on claim_id; the full body rides in payload jsonb. */
export async function upsertClaims(db: Db, list: ClaimPayload[]): Promise<number> {
  for (const c of list) {
    const row = {
      kind: c.kind,
      themes: c.themes,
      payload: c as Record<string, unknown>,
      status: c.status,
      openedAt: c.opened_at,
      expiresAt: c.expires_at ?? null,
      resolvedAt: c.resolved_at ?? null,
    };
    await db
      .insert(claims)
      .values({ claimId: c.claim_id, ...row })
      .onConflictDoUpdate({ target: claims.claimId, set: row });
  }
  return list.length;
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
  })
  .passthrough();

export type ForwardEventPayload = z.infer<typeof forwardEventSchema>;

export const forwardEventsBodySchema = z.union([
  z.array(forwardEventSchema).min(1),
  forwardEventSchema.transform((f) => [f]),
]);

/** Idempotent upsert on event_id; resolution lives in its own column. */
export async function upsertForwardEvents(db: Db, list: ForwardEventPayload[]): Promise<number> {
  for (const f of list) {
    const { resolution, event_id, date, ...payload } = f;
    const row = {
      eventDate: date,
      payload: { event_id, date, ...payload } as Record<string, unknown>,
      resolution: (resolution ?? null) as Record<string, unknown> | null,
    };
    await db
      .insert(forwardEvents)
      .values({ eventId: event_id, ...row })
      .onConflictDoUpdate({ target: forwardEvents.eventId, set: row });
  }
  return list.length;
}
