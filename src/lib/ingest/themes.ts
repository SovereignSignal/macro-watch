import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';
import { publicValue } from '@/lib/public-copy';

// ---------------------------------------------------------------- events ---

export const themeEventSchema = z.object({
  event_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  theme_slug: z.string().min(1),
  theme_name: z.string().min(1),
  direction: z.enum(['raise', 'lower', 'hold', 'candidate', 'invalidate', 'retire']),
  evidence: z.string().min(1),
  trigger_state: z.string().nullish(),
  next_check: z.string().nullish(),
  source: z.enum(['daily', 'weekly']),
});

export type ThemeEventPayload = z.infer<typeof themeEventSchema>;

/** Accepts one event or a batch (backfill); always parses to an array. */
export const themeEventsBodySchema = z.union([
  z.array(themeEventSchema).min(1),
  themeEventSchema.transform((e) => [e]),
]);

function statusFor(direction: ThemeEventPayload['direction']): string {
  if (direction === 'candidate') return 'candidate';
  if (direction === 'retire' || direction === 'invalidate') return 'retired';
  return 'active'; // raise | lower | hold
}

/**
 * Upserts each event on event_id and maintains the themes table:
 * - first_seen = least(existing, event date); last_event_at = greatest(...)
 * - status follows the NEWEST event's direction; an older backfilled event
 *   never regresses it (CASE compares against the pre-update last_event_at).
 */
export async function upsertThemeEvents(db: Db, events: ThemeEventPayload[]): Promise<number> {
  await db.transaction(async (tx) => {
    for (const e of events) {
      const clean = publicValue(e);
      const status = statusFor(clean.direction);
      await tx
        .insert(themes)
        .values({
          slug: clean.theme_slug,
          name: clean.theme_name,
          status,
          firstSeen: clean.date,
          lastEventAt: clean.date,
        })
        .onConflictDoUpdate({
          target: themes.slug,
          set: {
            // Same date guard as status: an older backfilled event must not
            // overwrite a newer event's name either.
            name: sql`case when ${clean.date} >= ${themes.lastEventAt} then ${clean.theme_name} else ${themes.name} end`,
            firstSeen: sql`least(${themes.firstSeen}, ${clean.date})`,
            status: sql`case when ${clean.date} >= ${themes.lastEventAt} then ${status} else ${themes.status} end`,
            lastEventAt: sql`greatest(${themes.lastEventAt}, ${clean.date})`,
          },
        });
      const eventRow = {
        date: clean.date,
        themeSlug: clean.theme_slug,
        direction: clean.direction,
        evidence: clean.evidence,
        triggerState: clean.trigger_state ?? null,
        nextCheck: clean.next_check ?? null,
        source: clean.source,
      };
      await tx
        .insert(themeEvents)
        .values({ eventId: clean.event_id, ...eventRow })
        .onConflictDoUpdate({ target: themeEvents.eventId, set: eventRow });
    }
  });
  return events.length;
}

// ----------------------------------------------------------------- state ---

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    },
    'expected a valid calendar date',
  );

/**
 * Lifecycle metadata is atomic: a producer either omits this object for a
 * legacy/unassessed card or supplies every version-1 field. Unknown nested
 * fields are stripped by Zod's default object policy.
 */
export const evidenceLifecycleSchema = z
  .object({
    version: z.literal(1),
    basis_novelty: z.enum(['updated', 'repeated']),
    balance: z.enum(['supporting', 'challenging', 'mixed', 'unchanged', 'emerging']),
    confidence_change: z.enum(['raised', 'lowered', 'unchanged', 'candidate', 'invalidated']),
    last_basis_change_date: isoDateSchema,
    repeat_count: z.number().int().nonnegative().safe(),
  })
  .superRefine((lifecycle, ctx) => {
    if (lifecycle.basis_novelty === 'updated' && lifecycle.repeat_count !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repeat_count'],
        message: 'updated basis requires repeat_count 0',
      });
    }
    if (lifecycle.basis_novelty === 'repeated' && lifecycle.repeat_count < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repeat_count'],
        message: 'repeated basis requires repeat_count at least 1',
      });
    }
  });

const legacyOptionalTextSchema = z
  .string()
  .transform((value) => (value.trim() === '' ? null : value))
  .nullish();

/**
 * Curated public card fields from theme-state.json. Card objects intentionally
 * strip unknown keys rather than passing producer internals into persisted
 * JSONB. Legacy cards without evidence_lifecycle remain valid and unassessed.
 */
export const themeStateCardSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    description: legacyOptionalTextSchema,
    status: z.enum(['active', 'candidate', 'retired', 'invalidated']).nullish(),
    conviction: z.enum(['low', 'medium', 'high']).nullish(),
    current_read: legacyOptionalTextSchema,
    evidence: legacyOptionalTextSchema,
    evidence_lifecycle: evidenceLifecycleSchema.optional(),
    last_seen: isoDateSchema.nullish(),
    last_changed: isoDateSchema.nullish(),
    next_check: legacyOptionalTextSchema,
    raise_conditions: z.union([z.string(), z.array(z.string())]).nullish(),
    lower_conditions: z.union([z.string(), z.array(z.string())]).nullish(),
    triggers: z.array(z.object({ name: z.string(), state: z.string() })).nullish(),
  })
  .superRefine((card, ctx) => {
    if (
      card.evidence_lifecycle &&
      card.last_seen &&
      card.evidence_lifecycle.last_basis_change_date > card.last_seen
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidence_lifecycle', 'last_basis_change_date'],
        message: 'last_basis_change_date must not be after last_seen',
      });
    }
  });

export const themeStateSchema = z.object({
  taken_at: z.string().datetime({ offset: true }),
  payload: z.object({
    as_of: z.string().optional(),
    themes: z.array(themeStateCardSchema),
  }),
});

export type EvidenceLifecycle = z.infer<typeof evidenceLifecycleSchema>;
export type ThemeStatePayload = z.infer<typeof themeStateSchema>;
export type ThemeStateCard = z.infer<typeof themeStateCardSchema>;

/** Idempotent snapshot upsert on taken_at; history rows accumulate. */
export async function upsertThemeState(db: Db, p: ThemeStatePayload): Promise<number> {
  // Re-parse at the persistence boundary so direct callers receive the same
  // key stripping and atomic validation as the HTTP ingest handler.
  const clean = themeStateSchema.parse(p);
  const payload = publicValue(clean.payload);
  await db
    .insert(themeState)
    .values({ takenAt: new Date(clean.taken_at), payload })
    .onConflictDoUpdate({ target: themeState.takenAt, set: { payload } });
  return 1;
}
