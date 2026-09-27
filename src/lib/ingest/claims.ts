import { notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';
import { publicHttpsUrl, publicValue } from '@/lib/public-copy';
import { rejectBlockedPublishers } from '@/lib/security/blocked-publishers';

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

/** Idempotent upsert on claim_id; the full body rides in payload jsonb. */
export async function upsertClaims(db: Db, list: ClaimPayload[]): Promise<number> {
  for (const c of list) {
    const clean = publicValue(c);
    const row = {
      kind: clean.kind,
      themes: clean.themes,
      payload: clean as Record<string, unknown>,
      status: clean.status,
      openedAt: clean.opened_at,
      expiresAt: clean.expires_at ?? null,
      resolvedAt: clean.resolved_at ?? null,
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

const forwardEventSnapshotSchema = z.object({
  events: z.array(forwardEventSchema),
  replace: z.literal(true),
});

export const forwardEventsBodySchema = z.union([
  forwardEventSnapshotSchema,
  z.array(forwardEventSchema).min(1).transform((events) => ({ events, replace: false as const })),
  forwardEventSchema.transform((event) => ({ events: [event], replace: false as const })),
]);

export type ForwardEventsBody = z.infer<typeof forwardEventsBodySchema>;

/**
 * Idempotent upsert on event_id. Authoritative snapshots also remove rows that
 * are no longer in the public projection; incremental legacy posts never do.
 */
export async function upsertForwardEvents(db: Db, body: ForwardEventsBody): Promise<number> {
  await db.transaction(async (tx) => {
    for (const f of body.events) {
      const clean = publicValue(f);
      const { resolution, event_id, date, ...payload } = clean;
      const row = {
        eventDate: date,
        payload: { event_id, date, ...payload } as Record<string, unknown>,
        resolution: (resolution ?? null) as Record<string, unknown> | null,
      };
      await tx
        .insert(forwardEvents)
        .values({ eventId: event_id, ...row })
        .onConflictDoUpdate({ target: forwardEvents.eventId, set: row });
    }
    if (body.replace) {
      const ids = body.events.map((event) => event.event_id);
      if (ids.length > 0) {
        await tx.delete(forwardEvents).where(notInArray(forwardEvents.eventId, ids));
      } else {
        await tx.delete(forwardEvents);
      }
    }
  });
  return body.events.length;
}
