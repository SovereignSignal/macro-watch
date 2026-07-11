import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';

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
      const status = statusFor(e.direction);
      await tx
        .insert(themes)
        .values({
          slug: e.theme_slug,
          name: e.theme_name,
          status,
          firstSeen: e.date,
          lastEventAt: e.date,
        })
        .onConflictDoUpdate({
          target: themes.slug,
          set: {
            // Same date guard as status: an older backfilled event must not
            // overwrite a newer event's name either.
            name: sql`case when ${e.date} >= ${themes.lastEventAt} then ${e.theme_name} else ${themes.name} end`,
            firstSeen: sql`least(${themes.firstSeen}, ${e.date})`,
            status: sql`case when ${e.date} >= ${themes.lastEventAt} then ${status} else ${themes.status} end`,
            lastEventAt: sql`greatest(${themes.lastEventAt}, ${e.date})`,
          },
        });
      const eventRow = {
        date: e.date,
        themeSlug: e.theme_slug,
        direction: e.direction,
        evidence: e.evidence,
        triggerState: e.trigger_state ?? null,
        nextCheck: e.next_check ?? null,
        source: e.source,
      };
      await tx
        .insert(themeEvents)
        .values({ eventId: e.event_id, ...eventRow })
        .onConflictDoUpdate({ target: themeEvents.eventId, set: eventRow });
    }
  });
  return events.length;
}

// ----------------------------------------------------------------- state ---

/**
 * The curated-map card fields the site renders (spec §3/§5). The snapshot is
 * a passthrough of the full theme-state.json; unknown fields are kept.
 */
const themeStateCardSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    conviction: z.enum(['low', 'medium', 'high']).nullish(),
    current_read: z.string().nullish(),
    raise_conditions: z.union([z.string(), z.array(z.string())]).nullish(),
    lower_conditions: z.union([z.string(), z.array(z.string())]).nullish(),
    triggers: z.array(z.object({ name: z.string(), state: z.string() })).nullish(),
  })
  .passthrough();

export const themeStateSchema = z.object({
  taken_at: z.string().datetime({ offset: true }),
  payload: z.object({ themes: z.array(themeStateCardSchema) }).passthrough(),
});

export type ThemeStatePayload = z.infer<typeof themeStateSchema>;
export type ThemeStateCard = z.infer<typeof themeStateCardSchema>;

/** Idempotent snapshot upsert on taken_at; history rows accumulate. */
export async function upsertThemeState(db: Db, p: ThemeStatePayload): Promise<number> {
  await db
    .insert(themeState)
    .values({ takenAt: new Date(p.taken_at), payload: p.payload })
    .onConflictDoUpdate({ target: themeState.takenAt, set: { payload: p.payload } });
  return 1;
}
