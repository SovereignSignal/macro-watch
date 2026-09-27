import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';
import { publicValue } from '@/lib/public-copy';
import { rejectBlockedPublishers } from '@/lib/security/blocked-publishers';

// ---------------------------------------------------------------- events ---

export const themeEventSchema = z.object({
  event_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  theme_slug: z.string().min(1),
  theme_name: z.string().min(1),
  direction: z.enum(['raise', 'lower', 'hold', 'candidate', 'invalidate', 'retire', 'measured']),
  evidence: z.string().min(1),
  trigger_state: z.string().nullish(),
  next_check: z.string().nullish(),
  source: z.enum(['daily', 'weekly', 'measured']),
});

export type ThemeEventPayload = z.infer<typeof themeEventSchema>;

/** Accepts one event or a batch (backfill); always parses to an array. */
export const themeEventsBodySchema = rejectBlockedPublishers(z.union([
  z.array(themeEventSchema).min(1),
  themeEventSchema.transform((e) => [e]),
]));

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
      if (clean.direction === 'measured') {
        const existing = await tx.select({ slug: themes.slug }).from(themes)
          .where(eq(themes.slug, clean.theme_slug)).limit(1);
        if (existing.length === 0) {
          const [snapshot] = await tx.select().from(themeState).orderBy(desc(themeState.takenAt)).limit(1);
          const parsed = snapshot && themeStateSchema.safeParse({
            taken_at: snapshot.takenAt.toISOString(), payload: snapshot.payload,
          });
          const card = parsed && parsed.success
            ? parsed.data.payload.themes.find((t) => t.slug === clean.theme_slug) : undefined;
          if (!card) throw new Error('Measured event awaits a canonical theme snapshot');
          // Materialize an already tracked theme. Evidence cannot invent a theme
          // or choose its lifecycle; those come from the canonical snapshot.
          await tx.insert(themes).values({
            slug: card.slug, name: card.name,
            status: card.status === 'invalidated' ? 'retired' : card.status ?? 'active',
            firstSeen: card.first_seen ?? clean.date,
            lastEventAt: card.last_seen ?? clean.date,
          }).onConflictDoNothing();
        }
      }
      if (clean.direction !== 'measured') await tx
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

/**
 * The curated-map card fields the site renders (spec §3/§5). The snapshot is
 * a passthrough of the full theme-state.json; unknown fields are kept.
 */
const themeStateCardSchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1).nullish(),
    conviction: z.enum(['low', 'medium', 'high']).nullish(),
    status: z.enum(['active', 'candidate', 'dormant', 'retired', 'invalidated']).nullish(),
    cell_phase: z.string().nullish(),
    first_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    last_seen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
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
  const payload = publicValue(p.payload);
  await db
    .insert(themeState)
    .values({ takenAt: new Date(p.taken_at), payload })
    .onConflictDoUpdate({ target: themeState.takenAt, set: { payload } });
  return 1;
}
