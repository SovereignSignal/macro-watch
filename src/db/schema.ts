import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  customType,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Postgres tsvector for generated full-text search columns (spec §4).
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const briefs = pgTable(
  'briefs',
  {
    // YYYY-MM-DD. Together with kind, the primary key. One row per date and kind.
    date: text('date').notNull(),
    kind: text('kind').notNull(), // 'daily' | 'weekend' | 'week-ahead'
    subject: text('subject').notNull(),
    ping: text('ping').notNull(), // telegram_ping
    html: text('html').notNull(), // sanitized publisher-side (spec §3), body-inner HTML
    sentVerifiedAt: timestamp('sent_verified_at', { withTimezone: true, mode: 'date' }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    // Producer-assigned revision (µs since epoch); 0 = legacy. Stale writes are rejected.
    revision: bigint('revision', { mode: 'number' }).notNull().default(0),
    search: tsvector('search').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${briefs.subject}, '') || ' ' || regexp_replace(coalesce(${briefs.html}, ''), '<[^>]*>', ' ', 'g'))`,
    ),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.kind], name: 'briefs_date_kind_pk' }),
    index('briefs_search_idx').using('gin', t.search),
  ],
);

export const themes = pgTable('themes', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'), // active | candidate | retired
  firstSeen: text('first_seen').notNull(), // YYYY-MM-DD
  lastEventAt: text('last_event_at'), // YYYY-MM-DD
});

export const themeEvents = pgTable(
  'theme_events',
  {
    eventId: text('event_id').primaryKey(),
    date: text('date').notNull(), // YYYY-MM-DD
    themeSlug: text('theme_slug')
      .notNull()
      .references(() => themes.slug),
    direction: text('direction').notNull(), // raise|lower|hold|candidate|invalidate|retire
    evidence: text('evidence').notNull(),
    triggerState: text('trigger_state'),
    nextCheck: text('next_check'),
    source: text('source').notNull(), // daily | weekly
    search: tsvector('search').generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', ${themeEvents.evidence})`,
    ),
  },
  (t) => [
    index('theme_events_theme_slug_idx').on(t.themeSlug),
    index('theme_events_search_idx').using('gin', t.search),
  ],
);

// Latest row renders /map; full history kept for conviction-over-time (spec §4).
export const themeState = pgTable('theme_state', {
  id: serial('id').primaryKey(),
  takenAt: timestamp('taken_at', { withTimezone: true, mode: 'date' }).notNull().unique(),
  payload: jsonb('payload').notNull(),
});

// Time-series of pipeline panel caches (sparklines later, free).
export const panelSnapshots = pgTable(
  'panel_snapshots',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').notNull(), // dashboard | odds_lens | scoreboard
    takenAt: timestamp('taken_at', { withTimezone: true, mode: 'date' }).notNull(),
    payload: jsonb('payload').notNull(),
  },
  (t) => [uniqueIndex('panel_snapshots_kind_taken_at_uq').on(t.kind, t.takenAt)],
);

export const claims = pgTable(
  'claims',
  {
    claimId: text('claim_id').primaryKey(),
    kind: text('kind').notNull(), // smart_money | map
    themes: text('themes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Full claim body: predicate, data_anchor, quality fields, resolution fields.
    payload: jsonb('payload').notNull(),
    // Pipeline vocabulary (not the site-plan draft's open/resolved_correct/etc.):
    // pending | hit | miss | partial | expired | judgment-required | void
    status: text('status').notNull(),
    openedAt: text('opened_at').notNull(), // YYYY-MM-DD
    expiresAt: text('expires_at'), // YYYY-MM-DD
    resolvedAt: text('resolved_at'), // YYYY-MM-DD
    // Producer-assigned revision (µs since epoch); 0 = legacy. Stale writes are rejected.
    revision: bigint('revision', { mode: 'number' }).notNull().default(0),
    // First-seen prediction fields; immutable once stored (null on pre-0003 rows).
    original: jsonb('original'),
    search: tsvector('search').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${claims.payload}->>'predicate', '') || ' ' || coalesce(${claims.payload}->>'data_anchor', ''))`,
    ),
  },
  (t) => [index('claims_search_idx').using('gin', t.search)],
);

export const forwardEvents = pgTable('forward_events', {
  eventId: text('event_id').primaryKey(),
  eventDate: text('event_date').notNull(), // YYYY-MM-DD
  payload: jsonb('payload').notNull(), // event, expectation, what-would-surprise framing
  resolution: jsonb('resolution'), // null until reconciled
  // Producer-assigned revision (µs since epoch); 0 = legacy. Stale writes are rejected.
  revision: bigint('revision', { mode: 'number' }).notNull().default(0),
});

// Daily research memos from the paid Decision Research loop (07:00 UTC,
// weekdays + Saturday). One memo per day; structured sections, never raw
// email content: the memo is Parallel web research over public sources.
export const researchMemos = pgTable(
  'research_memos',
  {
    date: text('date').primaryKey(), // YYYY-MM-DD
    topic: text('topic').notNull(), // display topic, e.g. "Dedollarization / BRICS"
    finding: text('finding').notNull(),
    changed: text('changed').notNull(),
    decision: text('decision').notNull(),
    watch: text('watch').notNull(),
    // [{url, title?}]: public https URLs only (publisher + ingest sanitized)
    citations: jsonb('citations').notNull().default(sql`'[]'::jsonb`),
    generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    search: tsvector('search').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${researchMemos.topic}, '') || ' ' || coalesce(${researchMemos.finding}, '') || ' ' || coalesce(${researchMemos.changed}, '') || ' ' || coalesce(${researchMemos.decision}, '') || ' ' || coalesce(${researchMemos.watch}, ''))`,
    ),
  },
  (t) => [index('research_memos_search_idx').using('gin', t.search)],
);
