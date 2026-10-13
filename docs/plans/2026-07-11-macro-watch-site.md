# macro.watch Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy macro.watch — the public, free web surface of the SovsClaw macro intelligence system: daily brief + archive, living theme map with longitudinal history, accountability scoreboards, catalyst board, about/RSS/search — fed exclusively by a push-only, bearer-token-guarded ingest API.

**Architecture:** A Next.js (App Router) app on Railway renders server-side from Railway Postgres via Drizzle ORM. The pipeline-host pipeline (separate repo, out of scope here) POSTs JSON to `/api/ingest/<kind>` endpoints, which zod-validate, idempotently upsert on natural keys, and trigger on-demand revalidation so pages update seconds after a publish. Pages carry a 900s ISR fallback and explicit empty states so no data never means a broken page. Tests run entirely against PGlite (in-memory Postgres), so CI and local runs need no database service.

**Tech Stack:** Next.js 15 (App Router) + TypeScript + React 19, npm, Drizzle ORM + node-postgres (prod) / @electric-sql/pglite (tests), zod, Vitest, plain CSS, Railway (web service + Postgres), GitHub Actions CI.

## Global Constraints

Every task's requirements implicitly include this section.

1. **Stack:** Next.js (App Router) + TypeScript, npm (Node 26 available locally; `engines.node >= 22`; CI pins Node 22 LTS).
2. **Repo:** already exists at `~/repos/macro-watch` (trunk-based, branch `main`, remote `git@github.com/SovereignSignal/macro-watch` — commits push straight to main). Commit at the end of every task. **Do NOT `git push`** — pushing to main triggers a Railway deploy; the orchestrator pushes after review. Leave the existing `README.md` and `docs/specs/` untouched.
3. **Database:** Drizzle ORM + node-postgres against Railway Postgres (`DATABASE_URL` env). Tests run against PGlite (in-memory Postgres, `@electric-sql/pglite`) so CI/local needs no database service. Never call `db.execute()` in app code — use the Drizzle query builder only, so node-postgres and PGlite stay interchangeable behind the `Db` type.
4. **Ingest:** zod validates every body. Auth: single bearer token env `MACRO_WATCH_INGEST_TOKEN`. Token mismatch → 401. Schema-invalid payload → 422 with reasons. Idempotent upsert on natural keys (retries are always safe). Response shape: `{ok, upserted, revalidated}`. The ingest API defined in this plan **is the contract**: the sovs-macro publisher (separate repo, separate plan) conforms to these shapes. Fields beyond the validated core pass through into `jsonb` payload columns. Brief `html` arrives sanitized publisher-side (spec §3) as body-inner HTML (no `<html>`/`<head>` wrapper) and is rendered as trusted content.
5. **Rendering:** SSR + on-demand revalidation (`revalidatePath` from ingest handlers). Content pages export `revalidate = 900` as the ISR fallback (if Postgres is briefly unavailable, previously rendered pages keep serving). `/search` and `/accountability` read `searchParams` and are `force-dynamic`. Panel components show "updated Nm ago" from snapshot `taken_at`. List/board pages wrap queries in `safeQuery` (DB failure → empty state, never a crash); the brief permalink deliberately throws instead, so a failed background revalidation keeps the stale page rather than 404ing it.
6. **Design language (spec §8):** Georgia serif body, sharp-market-note restraint, generous whitespace, light + dark via `prefers-color-scheme`, "SovsClaw — a Sovereign Signal system" byline, not-investment-advice footer. Plain CSS in `src/app/globals.css` — **no Tailwind**, no CSS-in-JS, no component libraries (keep the house feel hand-set). Text-mark only for v1 (scorpion asset is a spec open item). No emojis anywhere in site copy.
7. **Deploy:** Railway (project + Postgres already provisioned; the service deploys from this GitHub repo on push to main). Env on Railway: `DATABASE_URL` (Railway-injected), `MACRO_WATCH_INGEST_TOKEN`, `SITE_URL=https://macro.watch`. Local dev: `npm run dev` with `DATABASE_URL` in `.env` pointing at the Railway dev database.
8. **Conventions:** identifying dates (`briefs.date`, event dates, `opened_at`, …) are `YYYY-MM-DD` text columns (sortable, timezone-free); instants (`taken_at`, `sent_verified_at`) are `timestamptz`. Route handlers return plain `Response.json(...)` (never `NextResponse`). Pages are thin async functions that fetch and pass plain props to synchronous presentational components in `src/components/` — this is what makes page content unit-testable with `renderToStaticMarkup`. Next 15: `params`/`searchParams` are Promises — always `await` them.
9. **Dependencies:** none beyond those declared in Task 1's `package.json`.
10. **Green bar:** every task ends with `npm run typecheck` and `npm test` passing. The app must boot (`npm run build` succeeds) after every task.

## File Map

| Path | Responsibility |
|---|---|
| `src/db/schema.ts` | All 7 Drizzle tables + generated tsvector search columns |
| `src/db/client.ts` | `getDb()`/`setDb()`/`closeDb()` — lazy node-postgres client with a test seam |
| `drizzle/` | Generated SQL migrations (committed; applied by prod start + PGlite tests) |
| `src/lib/ingest/auth.ts` | Timing-safe bearer-token check |
| `src/lib/ingest/handler.ts` | `createIngestHandler` factory: auth → zod → upsert → revalidate → response |
| `src/lib/ingest/{briefs,themes,panels,claims}.ts` | Per-kind zod schemas + idempotent upserts |
| `src/app/api/ingest/*/route.ts` | Six thin POST routes built from the factory |
| `src/lib/queries/*.ts` | All page reads (typed, PGlite-testable) |
| `src/lib/{safe,format,scoring,rss,panel-contract,seed}.ts` | Pure helpers: error-safe queries, formatting, scoreboard math, RSS XML, panel payload extraction, fixture seeding |
| `src/components/*.tsx` | Synchronous presentational components |
| `src/app/**/page.tsx`, `src/app/feed.xml/route.ts` | Thin async pages/routes |
| `src/app/globals.css` | The entire design system (one hand-set sheet) |
| `tests/` | Vitest suites + `tests/helpers/db.ts` (PGlite) + `tests/fixtures/*.json` |
| `scripts/seed.ts`, `scripts/smoke.mjs` | Dev-DB seeding; deployed-URL smoke check |
| `railway.json`, `.github/workflows/ci.yml` | Deploy + CI config |

---

### Task 1: Scaffold, test runner, CI

The repo currently contains only `README.md` and `docs/`. Hand-write the Next.js skeleton (no `create-next-app` — it is interactive and drags in Tailwind/ESLint choices we don't want), wire Vitest, and add CI. A trivial pure function (`formatDate`) anchors the TDD cycle.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx` (minimal placeholder; Task 8 replaces it)
- Create: `src/app/page.tsx` (placeholder; Task 9 replaces it)
- Create: `src/app/globals.css` (placeholder; Task 8 replaces it)
- Create: `src/lib/format.ts`
- Test: `tests/format.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `formatDate(isoDate: string): string` in `src/lib/format.ts` (renders `2026-07-11` as `July 11, 2026`); npm scripts `dev/build/start/typecheck/test/db:generate/db:migrate/seed`; the `@/* → src/*` path alias (tsconfig + vitest).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "macro-watch",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "dotenv": "^16.5.0",
    "drizzle-kit": "^0.31.1",
    "drizzle-orm": "^0.44.2",
    "next": "^15.3.4",
    "pg": "^8.16.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.3.3",
    "@types/node": "^22.15.0",
    "@types/pg": "^8.15.4",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "tsx": "^4.20.3",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Notes: `drizzle-kit` and `dotenv` are runtime dependencies on purpose — the prod start command runs `drizzle-kit migrate` (Task 15). `db:*`/`seed` scripts point at files created in Tasks 2 and 7; declaring them now keeps this file single-write.

- [ ] **Step 2: Install**

Run: `cd ~/repos/macro-watch && npm install`
Expected: exits 0, prints `added <N> packages`, creates `package-lock.json` and `node_modules/`. (If `@electric-sql/pglite@^0.3` reports an unresolvable peer conflict with drizzle-orm, fall back to `"@electric-sql/pglite": "^0.2.17"` — drizzle's pglite driver supports both lines.)

- [ ] **Step 3: Write the TypeScript/Next/Vitest config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`next-env.d.ts` (committed so `tsc --noEmit` works before any build):

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

`.gitignore`:

```
node_modules/
.next/
out/
.env
.env.*
!.env.example
*.tsbuildinfo
```

`.env.example`:

```
# Local dev points at the Railway dev database (Global Constraint 7).
DATABASE_URL=postgres://user:password@host:5432/railway
# Generate with: openssl rand -hex 32
MACRO_WATCH_INGEST_TOKEN=change-me
SITE_URL=http://localhost:3000
```

- [ ] **Step 4: Write the minimal app shell**

`src/app/globals.css`:

```css
:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  font-family: Georgia, 'Times New Roman', Times, serif;
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'macro.watch',
  description: 'AI-composed macro intelligence — deterministically validated, self-graded.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>macro.watch</h1>
    </main>
  );
}
```

- [ ] **Step 5: Write the failing test**

`tests/format.test.ts`:

```ts
import { expect, it } from 'vitest';
import { formatDate } from '@/lib/format';

it('formats an ISO date for display', () => {
  expect(formatDate('2026-07-11')).toBe('July 11, 2026');
});

it('does not zero-pad the day', () => {
  expect(formatDate('2026-01-05')).toBe('January 5, 2026');
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — error contains `Failed to resolve import "@/lib/format"`.

- [ ] **Step 7: Implement `src/lib/format.ts`**

```ts
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Renders a YYYY-MM-DD date as e.g. "July 11, 2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS — `Test Files  1 passed`, `Tests  2 passed`.

- [ ] **Step 9: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: typecheck exits silently; build prints `✓ Compiled successfully` and a route table containing `/`.

- [ ] **Step 10: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          # Fake URL: build-time prerender must succeed with no DB reachable
          # (queries are wrapped in safeQuery and render empty states).
          DATABASE_URL: postgres://ci:ci@127.0.0.1:5432/ci
```

- [ ] **Step 11: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: scaffold Next.js app, vitest, and CI"
```

---

### Task 2: Database schema, migrations, PGlite test harness

All seven tables from spec §4 in one Drizzle schema, including generated tsvector columns for full-text search (briefs subject + tag-stripped html, theme-event evidence, claim predicate + data anchor). One generated migration, committed. A PGlite helper gives every test file a fresh, fully migrated in-memory Postgres and installs it as the app-wide DB via `setDb`.

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/` (generated by drizzle-kit; commit it)
- Create: `tests/helpers/db.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: path alias + vitest config from Task 1.
- Produces:
  - Tables: `briefs`, `themes`, `themeEvents`, `themeState`, `panelSnapshots`, `claims`, `forwardEvents` from `@/db/schema` (column properties are camelCase: `sentVerifiedAt`, `themeSlug`, `takenAt`, `claimId`, `openedAt`, `expiresAt`, `resolvedAt`, `eventId`, `eventDate`, `firstSeen`, `lastEventAt`).
  - `type Db`, `getDb(): Db`, `setDb(override: Db): void`, `closeDb(): Promise<void>` from `@/db/client`.
  - `createTestDb(): Promise<Db>` from `tests/helpers/db.ts` — fresh migrated PGlite, already installed via `setDb`.

- [ ] **Step 1: Write the failing test**

`tests/schema.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { briefs, panelSnapshots } from '@/db/schema';
import { createTestDb } from './helpers/db';

const BRIEF = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Front-end repricing',
  ping: 'Two-year yields backed up into supply.',
  html: '<p>Powell surprised markets with a slower path.</p>',
  sentVerifiedAt: new Date('2026-07-10T14:05:00Z'),
};

it('applies migrations and round-trips a brief', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values(BRIEF);
  const rows = await db.select({ date: briefs.date, kind: briefs.kind }).from(briefs);
  expect(rows).toEqual([{ date: '2026-07-10', kind: 'daily' }]);
});

it('generates a searchable tsvector from subject + tag-stripped html', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values(BRIEF);
  const hits = await db
    .select({ date: briefs.date })
    .from(briefs)
    .where(sql`${briefs.search} @@ websearch_to_tsquery('english', 'powell')`);
  expect(hits).toEqual([{ date: '2026-07-10' }]);
});

it('enforces one panel snapshot per kind + taken_at', async () => {
  const db = await createTestDb();
  const takenAt = new Date('2026-07-10T12:00:00Z');
  await db.insert(panelSnapshots).values({ kind: 'dashboard', takenAt, payload: { rows: [] } });
  await expect(
    db.insert(panelSnapshots).values({ kind: 'dashboard', takenAt, payload: { rows: [] } }),
  ).rejects.toThrow(/duplicate key/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `Failed to resolve import "@/db/schema"`.

- [ ] **Step 3: Write `src/db/schema.ts`**

```ts
import { sql, type SQL } from 'drizzle-orm';
import {
  customType,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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
    // YYYY-MM-DD. Natural key: one brief per day (daily Mon–Fri, weekend Sat).
    date: text('date').primaryKey(),
    kind: text('kind').notNull(), // 'daily' | 'weekend'
    subject: text('subject').notNull(),
    ping: text('ping').notNull(), // telegram_ping
    html: text('html').notNull(), // sanitized publisher-side (spec §3), body-inner HTML
    sentVerifiedAt: timestamp('sent_verified_at', { withTimezone: true, mode: 'date' }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    search: tsvector('search').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', coalesce(${briefs.subject}, '') || ' ' || regexp_replace(coalesce(${briefs.html}, ''), '<[^>]*>', ' ', 'g'))`,
    ),
  },
  (t) => [index('briefs_search_idx').using('gin', t.search)],
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
    status: text('status').notNull(), // open|resolved_correct|resolved_incorrect|expired|invalidated
    openedAt: text('opened_at').notNull(), // YYYY-MM-DD
    expiresAt: text('expires_at'), // YYYY-MM-DD
    resolvedAt: text('resolved_at'), // YYYY-MM-DD
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
});
```

- [ ] **Step 4: Write `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Only used by `drizzle-kit migrate`; `generate` never connects.
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/macro_watch',
  },
});
```

- [ ] **Step 5: Generate the migration**

Run: `npx drizzle-kit generate --name init`
Expected: prints the 7 tables with column counts and ends with a line like `[✓] Your SQL migration file ➜ drizzle/0000_init.sql`.

Then verify the generated SQL contains the three generated columns:

Run: `grep -c "GENERATED ALWAYS AS" drizzle/0000_init.sql`
Expected: `3`

- [ ] **Step 6: Write `src/db/client.ts`**

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;
let pool: Pool | null = null;

/** Test seam: tests/helpers/db.ts swaps in a PGlite-backed instance. */
export function setDb(override: Db): void {
  db = override;
}

export function getDb(): Db {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** For one-shot scripts (seed): lets the process exit cleanly. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
```

- [ ] **Step 7: Write `tests/helpers/db.ts`**

```ts
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { setDb, type Db } from '@/db/client';

/**
 * Fresh in-memory Postgres (PGlite) with all migrations applied.
 * Installs itself as the app-wide db via setDb(), so route handlers and
 * pages under test transparently hit this instance.
 *
 * The PGlite drizzle instance is runtime-compatible with NodePgDatabase for
 * everything the app uses (query builder only — Global Constraint 3); the
 * cast keeps one Db type across prod and tests.
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  const db = pglite as unknown as Db;
  setDb(db);
  return db;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS — `Tests  3 passed`.

- [ ] **Step 9: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green (5 tests total).

- [ ] **Step 10: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: drizzle schema for all seven tables, init migration, PGlite test harness"
```

---

### Task 3: Ingest foundation + briefs endpoint

The shared ingest machinery (timing-safe bearer auth, a handler factory that does auth → JSON parse → zod → upsert → revalidate → `{ok, upserted, revalidated}`), plus the first endpoint: `POST /api/ingest/briefs`, idempotent on `date`.

**Files:**
- Create: `src/lib/ingest/auth.ts`
- Create: `src/lib/ingest/handler.ts`
- Create: `src/lib/ingest/briefs.ts`
- Create: `src/app/api/ingest/briefs/route.ts`
- Test: `tests/ingest-briefs.test.ts`

**Interfaces:**
- Consumes: `getDb`, `setDb`, `Db` from `@/db/client`; `briefs` table from `@/db/schema`; `createTestDb` from `tests/helpers/db.ts`.
- Produces:
  - `isAuthorized(req: Request): boolean` from `@/lib/ingest/auth`.
  - `type RevalidateTarget = { path: string; type?: 'page' | 'layout' }` and `createIngestHandler<S extends z.ZodTypeAny>(opts: { schema: S; upsert: (db: Db, payload: z.output<S>) => Promise<number>; revalidate: (payload: z.output<S>) => RevalidateTarget[] }): (req: Request) => Promise<Response>` from `@/lib/ingest/handler` — Tasks 4–6 build every other endpoint from this.
  - `briefSchema`, `type BriefPayload`, `upsertBrief(db: Db, p: BriefPayload): Promise<number>` from `@/lib/ingest/briefs`.

- [ ] **Step 1: Write the failing test**

`tests/ingest-briefs.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import { briefs } from '@/db/schema';
import type { Db } from '@/db/client';
import { createTestDb } from './helpers/db';

// revalidatePath needs a Next.js request scope; mock it for unit tests.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('@/app/api/ingest/briefs/route');

const TOKEN = 'test-token';

function post(body: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/ingest/briefs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Front-end repricing meets a heavy auction week',
  telegram_ping: 'Two-year yields snapped higher into supply.',
  html: '<h2>Rates</h2><p>The two-year backed up nine basis points.</p>',
  sent_verified_at: '2026-07-10T14:05:00Z',
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects a missing or wrong bearer token with 401', async () => {
  expect((await POST(post(VALID, null))).status).toBe(401);
  expect((await POST(post(VALID, 'wrong'))).status).toBe(401);
});

it('rejects everything when the token env is unset', async () => {
  delete process.env.MACRO_WATCH_INGEST_TOKEN;
  expect((await POST(post(VALID))).status).toBe(401);
});

it('rejects an invalid payload with 422 and reasons', async () => {
  const res = await POST(post({ ...VALID, kind: 'monthly' }));
  expect(res.status).toBe(422);
  const json = await res.json();
  expect(json.ok).toBe(false);
  expect(json.issues.length).toBeGreaterThan(0);
});

it('rejects a non-JSON body with 422', async () => {
  const req = new Request('http://localhost/api/ingest/briefs', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: 'not json',
  });
  expect((await POST(req)).status).toBe(422);
});

it('upserts and reports revalidated paths', async () => {
  const res = await POST(post(VALID));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    ok: true,
    upserted: 1,
    revalidated: ['/', '/briefs', '/briefs/2026-07-10', '/feed.xml'],
  });
});

it('re-POST updates in place (idempotent on date)', async () => {
  await POST(post(VALID));
  await POST(post({ ...VALID, subject: 'Front-end repricing (revised)' }));
  const rows = await db.select().from(briefs);
  expect(rows).toHaveLength(1);
  expect(rows[0].subject).toBe('Front-end repricing (revised)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ingest-briefs.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/ingest/briefs/route"`.

- [ ] **Step 3: Write `src/lib/ingest/auth.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';

/**
 * Single bearer token guards all ingest (spec §2). Timing-safe compare;
 * fails closed if MACRO_WATCH_INGEST_TOKEN is unset.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.MACRO_WATCH_INGEST_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const got = Buffer.from(header.slice('Bearer '.length));
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}
```

- [ ] **Step 4: Write `src/lib/ingest/handler.ts`**

```ts
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { getDb, type Db } from '@/db/client';
import { isAuthorized } from './auth';

export type RevalidateTarget = { path: string; type?: 'page' | 'layout' };

/**
 * Every ingest endpoint is: auth -> JSON parse -> zod -> idempotent upsert
 * -> on-demand revalidation -> {ok, upserted, revalidated} (spec §3, §6, §7).
 */
export function createIngestHandler<S extends z.ZodTypeAny>(opts: {
  schema: S;
  upsert: (db: Db, payload: z.output<S>) => Promise<number>;
  revalidate: (payload: z.output<S>) => RevalidateTarget[];
}) {
  return async function POST(req: Request): Promise<Response> {
    if (!isAuthorized(req)) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'body is not valid JSON' }, { status: 422 });
    }
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: 'validation failed', issues: parsed.error.issues },
        { status: 422 },
      );
    }
    const upserted = await opts.upsert(getDb(), parsed.data);
    const targets = opts.revalidate(parsed.data);
    for (const t of targets) {
      try {
        revalidatePath(t.path, t.type ?? 'page');
      } catch {
        // revalidatePath is unavailable outside the Next request scope (unit tests).
      }
    }
    return Response.json({ ok: true, upserted, revalidated: targets.map((t) => t.path) });
  };
}
```

- [ ] **Step 5: Write `src/lib/ingest/briefs.ts`**

```ts
import { z } from 'zod';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';

export const briefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  kind: z.enum(['daily', 'weekend']),
  subject: z.string().min(1),
  telegram_ping: z.string().min(1),
  html: z.string().min(1),
  sent_verified_at: z.string().datetime({ offset: true }),
});

export type BriefPayload = z.infer<typeof briefSchema>;

/** Idempotent upsert on the natural key `date` (spec §4: briefs(date pk)). */
export async function upsertBrief(db: Db, p: BriefPayload): Promise<number> {
  const row = {
    kind: p.kind,
    subject: p.subject,
    ping: p.telegram_ping,
    html: p.html,
    sentVerifiedAt: new Date(p.sent_verified_at),
  };
  await db
    .insert(briefs)
    .values({ date: p.date, ...row })
    .onConflictDoUpdate({ target: briefs.date, set: { ...row, ingestedAt: new Date() } });
  return 1;
}
```

- [ ] **Step 6: Write `src/app/api/ingest/briefs/route.ts`**

```ts
import { briefSchema, upsertBrief } from '@/lib/ingest/briefs';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: briefSchema,
  upsert: upsertBrief,
  revalidate: (p) => [
    { path: '/' },
    { path: '/briefs' },
    { path: `/briefs/${p.date}` },
    { path: '/feed.xml' },
  ],
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/ingest-briefs.test.ts`
Expected: PASS — `Tests  6 passed`.

- [ ] **Step 8: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green.

- [ ] **Step 9: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: ingest foundation (bearer auth, handler factory) + briefs endpoint"
```

---

### Task 4: Theme events + theme state ingest

Two endpoints. `POST /api/ingest/theme-events` accepts a single reducer event or an array (backfill posts 32+ at once), upserts each on `event_id`, and maintains the `themes` table (create-on-first-sight, `first_seen`/`last_event_at` bounds, lifecycle status derived from the newest event's direction — out-of-order backfill must not regress status). `POST /api/ingest/theme-state` upserts a full snapshot on `taken_at`; the payload carries the curated-map fields the site renders (spec §3: conviction, current read, raise/lower conditions, live triggers).

**Files:**
- Create: `src/lib/ingest/themes.ts`
- Create: `src/app/api/ingest/theme-events/route.ts`
- Create: `src/app/api/ingest/theme-state/route.ts`
- Test: `tests/ingest-themes.test.ts`

**Interfaces:**
- Consumes: `createIngestHandler`, `RevalidateTarget` from `@/lib/ingest/handler` (Task 3); `themes`, `themeEvents`, `themeState` tables (Task 2); `createTestDb`.
- Produces (from `@/lib/ingest/themes`):
  - `themeEventSchema`, `themeEventsBodySchema` (single object or array → always parses to an array), `type ThemeEventPayload`.
  - `upsertThemeEvents(db: Db, events: ThemeEventPayload[]): Promise<number>`.
  - `themeStateSchema`, `type ThemeStatePayload`, `type ThemeStateCard` (one curated card inside the snapshot: `{ slug, name, conviction?, current_read?, raise_conditions?, lower_conditions?, triggers? }`).
  - `upsertThemeState(db: Db, p: ThemeStatePayload): Promise<number>`.

- [ ] **Step 1: Write the failing test**

`tests/ingest-themes.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { themeEvents, themes, themeState } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postEvents } = await import('@/app/api/ingest/theme-events/route');
const { POST: postState } = await import('@/app/api/ingest/theme-state/route');

const TOKEN = 'test-token';

function post(path: string, body: unknown, token: string | null = TOKEN): Request {
  return new Request(`http://localhost/api/ingest/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const EVENT = {
  event_id: 'te-2026-06-24-rate-path-1',
  date: '2026-06-24',
  theme_slug: 'rate-path-repricing',
  theme_name: 'Rate-path repricing',
  direction: 'raise',
  evidence: 'Payrolls beat plus hawkish minutes; the two-year repriced 15bp.',
  trigger_state: '2 of 3 triggers live',
  next_check: '2026-07-15 CPI',
  source: 'daily',
};

const STATE = {
  taken_at: '2026-07-11T12:10:00Z',
  payload: {
    as_of: '2026-07-11',
    themes: [
      {
        slug: 'rate-path-repricing',
        name: 'Rate-path repricing',
        conviction: 'high',
        current_read: 'The front end is still underpricing how slow the cutting cycle gets.',
        raise_conditions: ['Core CPI re-accelerates'],
        lower_conditions: 'Labor market cracks',
        triggers: [{ name: '2y auction demand', state: 'live' }],
      },
    ],
  },
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects theme events without a token', async () => {
  expect((await postEvents(post('theme-events', EVENT, null))).status).toBe(401);
});

it('rejects a bad direction with 422', async () => {
  expect((await postEvents(post('theme-events', { ...EVENT, direction: 'sideways' }))).status).toBe(422);
});

it('accepts a single event object and creates the theme row', async () => {
  const res = await postEvents(post('theme-events', EVENT));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/', '/map'] });
  const trows = await db.select().from(themes);
  expect(trows).toEqual([
    {
      slug: 'rate-path-repricing',
      name: 'Rate-path repricing',
      status: 'active',
      firstSeen: '2026-06-24',
      lastEventAt: '2026-06-24',
    },
  ]);
});

it('accepts an array, is idempotent, and derives lifecycle status', async () => {
  const batch = [
    { ...EVENT, event_id: 'te-a', date: '2026-06-20', direction: 'candidate' },
    { ...EVENT, event_id: 'te-b', date: '2026-06-24', direction: 'raise' },
  ];
  const res = await postEvents(post('theme-events', batch));
  expect((await res.json()).upserted).toBe(2);
  await postEvents(post('theme-events', batch)); // re-POST: no dupes
  expect(await db.select().from(themeEvents)).toHaveLength(2);
  const [t] = await db.select().from(themes);
  expect(t.status).toBe('active'); // newest event (raise) wins
  expect(t.firstSeen).toBe('2026-06-20');
  expect(t.lastEventAt).toBe('2026-06-24');
});

it('does not regress status when an older event backfills later', async () => {
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-new', date: '2026-07-08', direction: 'raise' }));
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-old', date: '2026-06-20', direction: 'candidate' }));
  const [t] = await db.select().from(themes).where(eq(themes.slug, 'rate-path-repricing'));
  expect(t.status).toBe('active'); // 2026-07-08 raise still governs
  expect(t.firstSeen).toBe('2026-06-20');
  expect(t.lastEventAt).toBe('2026-07-08');
});

it('retire flips the theme to retired', async () => {
  await postEvents(post('theme-events', EVENT));
  await postEvents(post('theme-events', { ...EVENT, event_id: 'te-r', date: '2026-07-05', direction: 'retire' }));
  const [t] = await db.select().from(themes);
  expect(t.status).toBe('retired');
});

it('upserts theme state idempotently on taken_at', async () => {
  const res = await postState(post('theme-state', STATE));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/', '/map'] });
  await postState(post('theme-state', { ...STATE, payload: { themes: [] } }));
  const rows = await db.select().from(themeState);
  expect(rows).toHaveLength(1);
  expect(rows[0].payload).toEqual({ themes: [] });
});

it('rejects theme state missing taken_at with 422', async () => {
  expect((await postState(post('theme-state', { payload: { themes: [] } }))).status).toBe(422);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ingest-themes.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/ingest/theme-events/route"`.

- [ ] **Step 3: Write `src/lib/ingest/themes.ts`**

```ts
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
  for (const e of events) {
    const status = statusFor(e.direction);
    await db
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
          name: e.theme_name,
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
    await db
      .insert(themeEvents)
      .values({ eventId: e.event_id, ...eventRow })
      .onConflictDoUpdate({ target: themeEvents.eventId, set: eventRow });
  }
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
```

- [ ] **Step 4: Write the two routes**

`src/app/api/ingest/theme-events/route.ts`:

```ts
import { createIngestHandler } from '@/lib/ingest/handler';
import { themeEventsBodySchema, upsertThemeEvents } from '@/lib/ingest/themes';

export const POST = createIngestHandler({
  schema: themeEventsBodySchema,
  upsert: upsertThemeEvents,
  // 'layout' on /map busts /map and every /map/[theme] page in one call.
  revalidate: () => [{ path: '/' }, { path: '/map', type: 'layout' }],
});
```

`src/app/api/ingest/theme-state/route.ts`:

```ts
import { createIngestHandler } from '@/lib/ingest/handler';
import { themeStateSchema, upsertThemeState } from '@/lib/ingest/themes';

export const POST = createIngestHandler({
  schema: themeStateSchema,
  upsert: upsertThemeState,
  revalidate: () => [{ path: '/' }, { path: '/map', type: 'layout' }],
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ingest-themes.test.ts`
Expected: PASS — `Tests  8 passed`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: theme-events and theme-state ingest with themes lifecycle maintenance"
```

---

### Task 5: Panels ingest

`POST /api/ingest/panels`: one snapshot per POST, idempotent on `(kind, taken_at)`. `payload` is a jsonb passthrough of the pipeline's existing cache shapes (spec §3); the site's rendering contract for it lives in Task 9's `panel-contract.ts`.

**Files:**
- Create: `src/lib/ingest/panels.ts`
- Create: `src/app/api/ingest/panels/route.ts`
- Test: `tests/ingest-panels.test.ts`

**Interfaces:**
- Consumes: `createIngestHandler` (Task 3); `panelSnapshots` table (Task 2); `createTestDb`.
- Produces: `panelSchema`, `type PanelPayload`, `upsertPanel(db: Db, p: PanelPayload): Promise<number>` from `@/lib/ingest/panels`; `type PanelKind = 'dashboard' | 'odds_lens' | 'scoreboard'`.

- [ ] **Step 1: Write the failing test**

`tests/ingest-panels.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST } = await import('@/app/api/ingest/panels/route');

const TOKEN = 'test-token';

function post(body: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/ingest/panels', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const DASHBOARD = {
  kind: 'dashboard',
  taken_at: '2026-07-11T12:00:00Z',
  payload: { as_of: '2026-07-11', rows: [{ label: 'ES', value: '6,412.50', change: '+0.4%' }] },
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects without a token', async () => {
  expect((await POST(post(DASHBOARD, null))).status).toBe(401);
});

it('rejects an unknown panel kind with 422', async () => {
  expect((await POST(post({ ...DASHBOARD, kind: 'heatmap' }))).status).toBe(422);
});

it('upserts idempotently on kind + taken_at', async () => {
  const res = await POST(post(DASHBOARD));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/'] });
  await POST(post({ ...DASHBOARD, payload: { rows: [] } }));
  const rows = await db.select().from(panelSnapshots);
  expect(rows).toHaveLength(1);
  expect(rows[0].payload).toEqual({ rows: [] });
});

it('different kinds at the same instant coexist (time-series per kind)', async () => {
  await POST(post(DASHBOARD));
  await POST(post({ ...DASHBOARD, kind: 'odds_lens' }));
  await POST(post({ ...DASHBOARD, taken_at: '2026-07-11T12:15:00Z' }));
  expect(await db.select().from(panelSnapshots)).toHaveLength(3);
});

it('scoreboard snapshots revalidate the accountability page', async () => {
  const res = await POST(post({ ...DASHBOARD, kind: 'scoreboard' }));
  expect((await res.json()).revalidated).toEqual(['/accountability']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ingest-panels.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/ingest/panels/route"`.

- [ ] **Step 3: Write `src/lib/ingest/panels.ts`**

```ts
import { z } from 'zod';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';

export type PanelKind = 'dashboard' | 'odds_lens' | 'scoreboard';

export const panelSchema = z.object({
  kind: z.enum(['dashboard', 'odds_lens', 'scoreboard']),
  taken_at: z.string().datetime({ offset: true }),
  // jsonb passthrough of the pipeline's existing cache shapes (spec §3).
  payload: z.record(z.unknown()),
});

export type PanelPayload = z.infer<typeof panelSchema>;

/** Idempotent on the natural key (kind, taken_at). */
export async function upsertPanel(db: Db, p: PanelPayload): Promise<number> {
  await db
    .insert(panelSnapshots)
    .values({ kind: p.kind, takenAt: new Date(p.taken_at), payload: p.payload })
    .onConflictDoUpdate({
      target: [panelSnapshots.kind, panelSnapshots.takenAt],
      set: { payload: p.payload },
    });
  return 1;
}
```

- [ ] **Step 4: Write `src/app/api/ingest/panels/route.ts`**

```ts
import { createIngestHandler } from '@/lib/ingest/handler';
import { panelSchema, upsertPanel } from '@/lib/ingest/panels';

export const POST = createIngestHandler({
  schema: panelSchema,
  upsert: upsertPanel,
  revalidate: (p) => (p.kind === 'scoreboard' ? [{ path: '/accountability' }] : [{ path: '/' }]),
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ingest-panels.test.ts`
Expected: PASS — `Tests  5 passed`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: panels ingest, idempotent on kind + taken_at"
```

---

### Task 6: Claims + forward events ingest

Both accountability ledgers. `POST /api/ingest/claims` (single or array) upserts on `claim_id` with the quality fields from spec §3 (market_type + observable/narrative/geo scores) riding in the jsonb payload. `POST /api/ingest/forward-events` (single or array) upserts on `event_id`, with `resolution` split into its own nullable column (null = upcoming, non-null = resolved).

**Files:**
- Create: `src/lib/ingest/claims.ts`
- Create: `src/app/api/ingest/claims/route.ts`
- Create: `src/app/api/ingest/forward-events/route.ts`
- Test: `tests/ingest-claims.test.ts`

**Interfaces:**
- Consumes: `createIngestHandler` (Task 3); `claims`, `forwardEvents` tables (Task 2); `createTestDb`.
- Produces (from `@/lib/ingest/claims`):
  - `claimSchema`, `claimsBodySchema`, `type ClaimPayload`, `upsertClaims(db: Db, list: ClaimPayload[]): Promise<number>`.
  - `forwardEventSchema`, `forwardEventsBodySchema`, `type ForwardEventPayload`, `upsertForwardEvents(db: Db, list: ForwardEventPayload[]): Promise<number>`.
  - Claim statuses are exactly: `open | resolved_correct | resolved_incorrect | expired | invalidated` (Task 12's scoreboard math depends on these strings).

- [ ] **Step 1: Write the failing test**

`tests/ingest-claims.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postClaims } = await import('@/app/api/ingest/claims/route');
const { POST: postForward } = await import('@/app/api/ingest/forward-events/route');

const TOKEN = 'test-token';

function post(path: string, body: unknown, token: string | null = TOKEN): Request {
  return new Request(`http://localhost/api/ingest/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const CLAIM = {
  claim_id: 'cl-2026-06-24-rates-1',
  kind: 'map',
  themes: ['rate-path-repricing'],
  predicate: '2y UST closes above 4.40% before 2026-08-01',
  data_anchor: 'UST 2y daily close',
  market_type: 'rates',
  observable_score: 3,
  narrative_score: 1,
  geo_score: 0,
  opened_at: '2026-06-24',
  expires_at: '2026-08-01',
  status: 'open',
};

const FORWARD = {
  event_id: 'fe-2026-07-15-us-cpi',
  date: '2026-07-15',
  event: 'US CPI (June)',
  expectation: 'Core +0.28% m/m consensus; shelter still the swing factor.',
  surprise: 'A 0.4%+ core print would force the slow-cut repricing to accelerate.',
};

let db: Db;

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  db = await createTestDb();
});

it('rejects both endpoints without a token', async () => {
  expect((await postClaims(post('claims', CLAIM, null))).status).toBe(401);
  expect((await postForward(post('forward-events', FORWARD, null))).status).toBe(401);
});

it('rejects an unknown claim status with 422', async () => {
  expect((await postClaims(post('claims', { ...CLAIM, status: 'maybe' }))).status).toBe(422);
});

it('upserts a claim with quality fields in the payload', async () => {
  const res = await postClaims(post('claims', CLAIM));
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/accountability', '/map'] });
  const [row] = await db.select().from(claims);
  expect(row.claimId).toBe('cl-2026-06-24-rates-1');
  expect(row.themes).toEqual(['rate-path-repricing']);
  expect(row.status).toBe('open');
  expect((row.payload as Record<string, unknown>).market_type).toBe('rates');
  expect((row.payload as Record<string, unknown>).observable_score).toBe(3);
});

it('claims: re-POST with a resolution updates in place', async () => {
  await postClaims(post('claims', [CLAIM]));
  await postClaims(
    post('claims', {
      ...CLAIM,
      status: 'resolved_correct',
      resolved_at: '2026-07-20',
      resolution_note: 'Closed at 4.43% on 2026-07-20.',
    }),
  );
  const rows = await db.select().from(claims);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('resolved_correct');
  expect(rows[0].resolvedAt).toBe('2026-07-20');
});

it('forward events: upcoming has null resolution; reconciled re-POST fills it', async () => {
  await postForward(post('forward-events', FORWARD));
  let [row] = await db.select().from(forwardEvents);
  expect(row.resolution).toBeNull();
  const res = await postForward(
    post('forward-events', {
      ...FORWARD,
      resolution: { outcome: 'Core +0.31%; front end sold off 6bp.', resolved_at: '2026-07-15' },
    }),
  );
  expect(await res.json()).toEqual({ ok: true, upserted: 1, revalidated: ['/catalysts'] });
  [row] = await db.select().from(forwardEvents);
  expect((row.resolution as Record<string, unknown>).outcome).toContain('Core +0.31%');
  expect(await db.select().from(forwardEvents)).toHaveLength(1);
});

it('forward events accept arrays', async () => {
  const res = await postForward(
    post('forward-events', [FORWARD, { ...FORWARD, event_id: 'fe-2026-07-30-fomc', date: '2026-07-30', event: 'FOMC decision' }]),
  );
  expect((await res.json()).upserted).toBe(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ingest-claims.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/ingest/claims/route"`.

- [ ] **Step 3: Write `src/lib/ingest/claims.ts`**

```ts
import { z } from 'zod';
import type { Db } from '@/db/client';
import { claims, forwardEvents } from '@/db/schema';

// ---------------------------------------------------------------- claims ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    status: z.enum(['open', 'resolved_correct', 'resolved_incorrect', 'expired', 'invalidated']),
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
```

- [ ] **Step 4: Write the two routes**

`src/app/api/ingest/claims/route.ts`:

```ts
import { claimsBodySchema, upsertClaims } from '@/lib/ingest/claims';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: claimsBodySchema,
  upsert: upsertClaims,
  // Claims render on /accountability and as "related claims" on theme pages.
  revalidate: () => [{ path: '/accountability' }, { path: '/map', type: 'layout' }],
});
```

`src/app/api/ingest/forward-events/route.ts`:

```ts
import { forwardEventsBodySchema, upsertForwardEvents } from '@/lib/ingest/claims';
import { createIngestHandler } from '@/lib/ingest/handler';

export const POST = createIngestHandler({
  schema: forwardEventsBodySchema,
  upsert: upsertForwardEvents,
  revalidate: () => [{ path: '/catalysts' }],
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ingest-claims.test.ts`
Expected: PASS — `Tests  6 passed`.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: claims and forward-events ingest"
```

---

### Task 7: Fixtures + seed script

One realistic fixture file per ingest kind, shared by tests (Tasks 9–15) and by `npm run seed` (which loads the Railway dev database through the exact same upsert code paths as ingest — spec §11 step 1 "ship site + ingest with fixture data"). Fixture dates: two daily briefs (2026-07-08 Wed, 2026-07-09 Thu) and one weekend review (2026-07-11 Sat); three themes with full lifecycle arcs; three panel kinds; five claims covering every status class; three forward events (two upcoming, one resolved).

**Files:**
- Create: `tests/fixtures/briefs.json`
- Create: `tests/fixtures/theme-events.json`
- Create: `tests/fixtures/theme-state.json`
- Create: `tests/fixtures/panels.json`
- Create: `tests/fixtures/claims.json`
- Create: `tests/fixtures/forward-events.json`
- Create: `src/lib/seed.ts`
- Create: `scripts/seed.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: every schema + upsert from Tasks 3–6 (`upsertBrief`, `upsertThemeEvents`, `upsertThemeState`, `upsertPanel`, `upsertClaims`, `upsertForwardEvents`); `getDb`/`closeDb`.
- Produces: `seedAll(db: Db): Promise<Record<string, number>>` from `@/lib/seed` (counts: `{ briefs: 3, themeEvents: 8, themeState: 1, panels: 3, claims: 5, forwardEvents: 3 }`); the six fixture files, which later tasks load in tests. NOTE: `src/lib/seed.ts` and `scripts/seed.ts` use **relative imports only** (no `@/` alias) so `tsx` runs them without alias config.

- [ ] **Step 1: Write the failing test**

`tests/seed.test.ts`:

```ts
import { expect, it } from 'vitest';
import { briefs, claims, themeEvents } from '@/db/schema';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

it('seeds every fixture kind and is idempotent', async () => {
  const db = await createTestDb();
  const counts = await seedAll(db);
  expect(counts).toEqual({
    briefs: 3,
    themeEvents: 8,
    themeState: 1,
    panels: 3,
    claims: 5,
    forwardEvents: 3,
  });
  const again = await seedAll(db);
  expect(again).toEqual(counts);
  expect(await db.select({ d: briefs.date }).from(briefs)).toHaveLength(3);
  expect(await db.select({ e: themeEvents.eventId }).from(themeEvents)).toHaveLength(8);
  expect(await db.select({ c: claims.claimId }).from(claims)).toHaveLength(5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/seed.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seed"`.

- [ ] **Step 3: Write the fixtures**

`tests/fixtures/briefs.json`:

```json
[
  {
    "date": "2026-07-08",
    "kind": "daily",
    "subject": "Front-end repricing meets a heavy auction week",
    "telegram_ping": "Two-year yields snapped higher into supply; the rate-path theme is doing the work.",
    "html": "<h2>Rates</h2><p>The two-year backed up nine basis points into a heavy auction slate, and the tail on today's reopening says demand at the front end is fragile. The rate-path repricing theme carries this brief.</p><h2>Lens</h2><p>Prediction markets moved the same direction but slower: the September-cut contract shed seven points. When the lens lags the tape, the tape usually wins.</p><h2>Deep research</h2><p>Term premium models put most of this month's move in the real-rate leg, not inflation compensation. That is a positioning story, not an inflation scare.</p>",
    "sent_verified_at": "2026-07-08T14:04:12Z"
  },
  {
    "date": "2026-07-09",
    "kind": "daily",
    "subject": "Oil's quiet tape hides a positioning story",
    "telegram_ping": "WTI barely moved while options skew flipped; someone is paying for upside.",
    "html": "<h2>Energy</h2><p>WTI closed a quiet session almost unchanged, but call skew flipped positive for the first time since April. Flat price plus rising call skew is how positioning stories start.</p><h2>Rates</h2><p>Follow-through from yesterday's auction tail: the front end steadied but did not recover. The theme map holds its raise.</p>",
    "sent_verified_at": "2026-07-09T14:03:47Z"
  },
  {
    "date": "2026-07-11",
    "kind": "weekend",
    "subject": "Weekend review: what the map got right about the dollar",
    "telegram_ping": "The dollar downtrend theme aged well this week; the map holds it at medium conviction.",
    "html": "<h2>The week in themes</h2><p>The dollar downtrend theme was the week's best performer: DXY closed below its June range while rate differentials narrowed on schedule. The map holds conviction at medium pending the CPI print.</p><h2>Grading</h2><p>One claim resolved this week and it resolved correct. The scoreboard is thin by design: the system grades only what it committed to in writing.</p>",
    "sent_verified_at": "2026-07-11T12:02:33Z"
  }
]
```

`tests/fixtures/theme-events.json`:

```json
[
  {
    "event_id": "te-2026-06-20-rate-path-1",
    "date": "2026-06-20",
    "theme_slug": "rate-path-repricing",
    "theme_name": "Rate-path repricing",
    "direction": "candidate",
    "evidence": "Fed speakers opened the door to a slower cutting path; front-end vol caught a bid.",
    "trigger_state": "0 of 3 triggers live",
    "next_check": "2026-06-24 FOMC minutes",
    "source": "daily"
  },
  {
    "event_id": "te-2026-06-24-rate-path-1",
    "date": "2026-06-24",
    "theme_slug": "rate-path-repricing",
    "theme_name": "Rate-path repricing",
    "direction": "raise",
    "evidence": "Payrolls beat plus hawkish minutes; the two-year repriced 15bp in two sessions.",
    "trigger_state": "2 of 3 triggers live",
    "next_check": "2026-07-15 CPI",
    "source": "daily"
  },
  {
    "event_id": "te-2026-07-08-rate-path-1",
    "date": "2026-07-08",
    "theme_slug": "rate-path-repricing",
    "theme_name": "Rate-path repricing",
    "direction": "raise",
    "evidence": "Auction tail confirmed demand fragility at the front end.",
    "trigger_state": "2 of 3 triggers live",
    "next_check": "2026-07-15 CPI",
    "source": "daily"
  },
  {
    "event_id": "te-2026-06-21-dollar-1",
    "date": "2026-06-21",
    "theme_slug": "dollar-downtrend",
    "theme_name": "Dollar downtrend",
    "direction": "candidate",
    "evidence": "DXY failed at the 200-day for the third time; rate differentials starting to narrow.",
    "trigger_state": null,
    "next_check": "2026-06-28 weekend review",
    "source": "daily"
  },
  {
    "event_id": "te-2026-06-28-dollar-1",
    "date": "2026-06-28",
    "theme_slug": "dollar-downtrend",
    "theme_name": "Dollar downtrend",
    "direction": "raise",
    "evidence": "Weekly close below the June range on narrowing differentials; theme promoted from candidate.",
    "trigger_state": "1 of 2 triggers live",
    "next_check": "2026-07-05",
    "source": "weekly"
  },
  {
    "event_id": "te-2026-07-05-dollar-1",
    "date": "2026-07-05",
    "theme_slug": "dollar-downtrend",
    "theme_name": "Dollar downtrend",
    "direction": "hold",
    "evidence": "No new information; positioning unchanged into CPI week.",
    "trigger_state": "1 of 2 triggers live",
    "next_check": "2026-07-15 CPI",
    "source": "weekly"
  },
  {
    "event_id": "te-2026-05-30-china-1",
    "date": "2026-05-30",
    "theme_slug": "china-reflation",
    "theme_name": "China reflation",
    "direction": "candidate",
    "evidence": "Credit impulse turned positive for the first time in a year; commodities not confirming yet.",
    "trigger_state": null,
    "next_check": "2026-06-15 credit data",
    "source": "weekly"
  },
  {
    "event_id": "te-2026-07-05-china-1",
    "date": "2026-07-05",
    "theme_slug": "china-reflation",
    "theme_name": "China reflation",
    "direction": "retire",
    "evidence": "Stimulus impulse faded; credit data rolled over for a third month. Candidate retired without promotion.",
    "trigger_state": null,
    "next_check": null,
    "source": "weekly"
  }
]
```

`tests/fixtures/theme-state.json`:

```json
{
  "taken_at": "2026-07-11T12:10:00Z",
  "payload": {
    "as_of": "2026-07-11",
    "themes": [
      {
        "slug": "rate-path-repricing",
        "name": "Rate-path repricing",
        "conviction": "high",
        "current_read": "The front end is still underpricing how slow the cutting cycle gets.",
        "raise_conditions": ["Core CPI re-accelerates above 0.3% m/m", "Another tailed 2y auction"],
        "lower_conditions": ["Labor market cracks force the Fed's hand"],
        "triggers": [
          { "name": "2y auction demand", "state": "live" },
          { "name": "July CPI", "state": "pending" }
        ]
      },
      {
        "slug": "dollar-downtrend",
        "name": "Dollar downtrend",
        "conviction": "medium",
        "current_read": "Differentials are narrowing on schedule; the weekly closes keep confirming.",
        "raise_conditions": "ECB holds while the Fed blinks",
        "lower_conditions": ["A risk-off bid returns to the dollar"],
        "triggers": [{ "name": "DXY 200dma", "state": "watching" }]
      },
      {
        "slug": "china-reflation",
        "name": "China reflation",
        "conviction": "low",
        "current_read": "Retired 2026-07-05: the stimulus impulse faded before commodities ever confirmed."
      }
    ]
  }
}
```

`tests/fixtures/panels.json`:

```json
[
  {
    "kind": "dashboard",
    "taken_at": "2026-07-11T12:00:00Z",
    "payload": {
      "as_of": "2026-07-11",
      "rows": [
        { "label": "ES", "value": "6,412.50", "change": "+0.4%" },
        { "label": "2y UST", "value": "4.31%", "change": "+6bp" },
        { "label": "DXY", "value": "95.84", "change": "-0.3%" },
        { "label": "WTI", "value": "71.20", "change": "+0.1%" },
        { "label": "Gold", "value": "3,905", "change": "+0.6%" }
      ]
    }
  },
  {
    "kind": "odds_lens",
    "taken_at": "2026-07-11T12:00:00Z",
    "payload": {
      "as_of": "2026-07-11",
      "rows": [
        { "label": "Fed cut by September", "value": "38%", "change": "-7pp", "note": "Polymarket" },
        { "label": "Recession called in 2026", "value": "21%", "change": "+2pp", "note": "Polymarket" }
      ]
    }
  },
  {
    "kind": "scoreboard",
    "taken_at": "2026-07-11T12:00:00Z",
    "payload": {
      "rows": [
        { "label": "Resolved claims", "value": "2" },
        { "label": "Hit rate", "value": "50%" }
      ]
    }
  }
]
```

`tests/fixtures/claims.json`:

```json
[
  {
    "claim_id": "cl-2026-06-24-rates-1",
    "kind": "map",
    "themes": ["rate-path-repricing"],
    "predicate": "2y UST closes above 4.40% before 2026-08-01",
    "data_anchor": "UST 2y daily close",
    "market_type": "rates",
    "observable_score": 3,
    "narrative_score": 1,
    "geo_score": 0,
    "opened_at": "2026-06-24",
    "expires_at": "2026-08-01",
    "status": "open"
  },
  {
    "claim_id": "cl-2026-06-21-fx-1",
    "kind": "map",
    "themes": ["dollar-downtrend"],
    "predicate": "DXY closes below 96.00 before 2026-07-31",
    "data_anchor": "DXY daily close",
    "market_type": "fx",
    "observable_score": 3,
    "narrative_score": 0,
    "geo_score": 1,
    "opened_at": "2026-06-21",
    "expires_at": "2026-07-31",
    "status": "open"
  },
  {
    "claim_id": "cl-2026-06-02-china-1",
    "kind": "map",
    "themes": ["china-reflation"],
    "predicate": "LME copper closes above $11,000/t before 2026-07-01",
    "data_anchor": "LME copper 3m close",
    "market_type": "commodities",
    "observable_score": 3,
    "narrative_score": 2,
    "geo_score": 2,
    "opened_at": "2026-06-02",
    "expires_at": "2026-07-01",
    "status": "resolved_incorrect",
    "resolved_at": "2026-06-30",
    "resolution_note": "Copper never cleared $10,600; the reflation impulse faded first."
  },
  {
    "claim_id": "cl-2026-06-05-rates-2",
    "kind": "smart_money",
    "themes": ["rate-path-repricing"],
    "predicate": "Polymarket 'no cut by July FOMC' clears 70% before 2026-07-01",
    "data_anchor": "Polymarket contract mid",
    "market_type": "rates",
    "observable_score": 3,
    "narrative_score": 1,
    "geo_score": 0,
    "opened_at": "2026-06-05",
    "expires_at": "2026-07-01",
    "status": "resolved_correct",
    "resolved_at": "2026-06-28",
    "resolution_note": "Cleared 74% on 2026-06-28 after the minutes."
  },
  {
    "claim_id": "cl-2026-05-20-fx-2",
    "kind": "smart_money",
    "themes": ["dollar-downtrend"],
    "predicate": "EURUSD trades 1.14 before end of June",
    "data_anchor": "EURUSD spot high",
    "market_type": "fx",
    "observable_score": 2,
    "narrative_score": 2,
    "geo_score": 1,
    "opened_at": "2026-05-20",
    "expires_at": "2026-06-30",
    "status": "expired"
  }
]
```

`tests/fixtures/forward-events.json`:

```json
[
  {
    "event_id": "fe-2026-07-15-us-cpi",
    "date": "2026-07-15",
    "event": "US CPI (June)",
    "expectation": "Core +0.28% m/m consensus; shelter still the swing factor.",
    "surprise": "A 0.4%+ core print would force the slow-cut repricing to accelerate; below 0.2% revives September.",
    "resolution": null
  },
  {
    "event_id": "fe-2026-07-30-fomc",
    "date": "2026-07-30",
    "event": "FOMC decision",
    "expectation": "Hold; statement tweaks on the QT taper.",
    "surprise": "Any signal that the first cut slips past September.",
    "resolution": null
  },
  {
    "event_id": "fe-2026-07-03-us-payrolls",
    "date": "2026-07-03",
    "event": "US payrolls (June)",
    "expectation": "+110k consensus; unemployment steady at 4.3%.",
    "surprise": "A sub-50k print would crack the rate-path theme's floor.",
    "resolution": {
      "outcome": "+147k with upward revisions; the front end sold off 8bp on the print.",
      "resolved_at": "2026-07-05",
      "note": "Expectation held: no surprise threshold was met."
    }
  }
]
```

- [ ] **Step 4: Write `src/lib/seed.ts`** (relative imports only — tsx runs this without the `@/` alias)

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client';
import { briefSchema, upsertBrief } from './ingest/briefs';
import { claimsBodySchema, forwardEventsBodySchema, upsertClaims, upsertForwardEvents } from './ingest/claims';
import { panelSchema, upsertPanel } from './ingest/panels';
import { themeEventsBodySchema, themeStateSchema, upsertThemeEvents, upsertThemeState } from './ingest/themes';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

/**
 * Loads every fixture through the same validated upsert paths as the ingest
 * API. Idempotent: safe to run repeatedly against the same database.
 */
export async function seedAll(db: Db): Promise<Record<string, number>> {
  const counts: Record<string, number> = { briefs: 0, themeEvents: 0, themeState: 0, panels: 0, claims: 0, forwardEvents: 0 };
  for (const b of load('briefs.json') as unknown[]) {
    counts.briefs += await upsertBrief(db, briefSchema.parse(b));
  }
  counts.themeEvents = await upsertThemeEvents(db, themeEventsBodySchema.parse(load('theme-events.json')));
  counts.themeState = await upsertThemeState(db, themeStateSchema.parse(load('theme-state.json')));
  for (const p of load('panels.json') as unknown[]) {
    counts.panels += await upsertPanel(db, panelSchema.parse(p));
  }
  counts.claims = await upsertClaims(db, claimsBodySchema.parse(load('claims.json')));
  counts.forwardEvents = await upsertForwardEvents(db, forwardEventsBodySchema.parse(load('forward-events.json')));
  return counts;
}
```

- [ ] **Step 5: Write `scripts/seed.ts`**

```ts
import 'dotenv/config';
import { closeDb, getDb } from '../src/db/client';
import { seedAll } from '../src/lib/seed';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the Railway dev database (.env).');
    process.exit(1);
  }
  const counts = await seedAll(getDb());
  console.log('seeded:', counts);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/seed.test.ts`
Expected: PASS — `Tests  1 passed`.

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: both green.

(Optional, only if `.env` has a real dev `DATABASE_URL`: `npm run db:migrate && npm run seed` — expected output `seeded: { briefs: 3, themeEvents: 8, themeState: 1, panels: 3, claims: 5, forwardEvents: 3 }`.)

- [ ] **Step 8: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: shared fixtures and seed script through validated ingest paths"
```

---

### Task 8: Design system + site chrome

The whole visual identity in one hand-set stylesheet (Georgia serif, sharp-market-note restraint, light + dark via `prefers-color-scheme`), the real root layout (masthead with byline, nav, not-investment-advice footer), a simple text-mark favicon, and the two shared atoms every later page uses: `EmptyState` and `UpdatedAgo` (with its pure `formatAgo` helper). Component/page tests across the whole plan use `renderToStaticMarkup` from `react-dom/server` — no jsdom needed; client components render their initial state.

**Files:**
- Modify: `src/app/globals.css` (replace entire file)
- Modify: `src/app/layout.tsx` (replace entire file)
- Create: `src/app/icon.svg`
- Create: `src/components/EmptyState.tsx`
- Create: `src/components/UpdatedAgo.tsx`
- Modify: `src/lib/format.ts` (append `formatAgo` and `xmlEscape`)
- Test: `tests/format-ago.test.ts`
- Test: `tests/layout.test.tsx`

**Interfaces:**
- Consumes: `formatDate` (Task 1).
- Produces:
  - `formatAgo(thenMs: number, nowMs: number): string` and `xmlEscape(s: string): string` from `@/lib/format`.
  - `EmptyState({ children }: { children: React.ReactNode })` from `@/components/EmptyState` — the standard explicit empty/stale state (spec §7).
  - `UpdatedAgo({ takenAt }: { takenAt: string })` (client component; `takenAt` is an ISO string) from `@/components/UpdatedAgo` — renders `updated —` before hydration, then `updated Nm ago`, ticking every 60s.
  - CSS class vocabulary used by Tasks 9–14: `container`, `container-wide`, `badge`, `badge-weekend`, `badge-active`, `badge-candidate`, `badge-retired`, `updated-ago`, `empty-state`, `brief-meta`, `brief-body`, `panel`, `panel-head`, `panel-table`, `num`, `change-up`, `change-down`, `panel-note`, `theme-strip`, `theme-grid`, `theme-card`, `read`, `conv`, `conv-low`, `conv-medium`, `conv-high`, `trigger-list`, `timeline`, `evidence`, `meta`, `dir`, `dir-raise`, `dir-lower`, `dir-hold`, `dir-candidate`, `dir-invalidate`, `dir-retire`, `conviction-chart`, `chart-grid`, `chart-label`, `chart-line`, `data-table`, `status-open`, `status-resolved_correct`, `status-resolved_incorrect`, `status-expired`, `status-invalidated`, `filters`, `search-form`, `archive-list`, `date`, `excerpt`, `boards`, `board`, `hit-rate`, `catalyst`, `vs`, `home-footer-links`.

- [ ] **Step 1: Write the failing tests**

`tests/format-ago.test.ts`:

```ts
import { expect, it } from 'vitest';
import { formatAgo, xmlEscape } from '@/lib/format';

const T0 = Date.parse('2026-07-11T12:00:00Z');

it('renders sub-minute as just now', () => {
  expect(formatAgo(T0 - 30_000, T0)).toBe('just now');
});

it('renders minutes, hours, days', () => {
  expect(formatAgo(T0 - 3 * 60_000, T0)).toBe('3m ago');
  expect(formatAgo(T0 - 2 * 3_600_000, T0)).toBe('2h ago');
  expect(formatAgo(T0 - 3 * 86_400_000, T0)).toBe('3d ago');
});

it('clamps clock skew to just now', () => {
  expect(formatAgo(T0 + 60_000, T0)).toBe('just now');
});

it('escapes XML special characters', () => {
  expect(xmlEscape(`Fed & the "long" <end> of 'curve'`)).toBe(
    'Fed &amp; the &quot;long&quot; &lt;end&gt; of &apos;curve&apos;',
  );
});
```

`tests/layout.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RootLayout from '@/app/layout';

const markup = renderToStaticMarkup(
  <RootLayout>
    <p>page content</p>
  </RootLayout>,
);

it('carries the Sovereign Signal byline', () => {
  expect(markup).toContain('SovsClaw — a Sovereign Signal system');
});

it('carries the not-investment-advice footer', () => {
  expect(markup).toContain('Not investment advice');
});

it('links every surface from the nav', () => {
  for (const href of ['/briefs', '/map', '/accountability', '/catalysts', '/search', '/about']) {
    expect(markup).toContain(`href="${href}"`);
  }
});

it('renders children', () => {
  expect(markup).toContain('page content');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/format-ago.test.ts tests/layout.test.tsx`
Expected: FAIL — `formatAgo` is not exported; layout markup lacks the byline.

- [ ] **Step 3: Append to `src/lib/format.ts`**

```ts
/** Relative age for freshness badges: "just now", "3m ago", "2h ago", "3d ago". */
export function formatAgo(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Escapes text for inclusion in XML (RSS). */
export function xmlEscape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
```

- [ ] **Step 4: Write `src/components/EmptyState.tsx`**

```tsx
/** Explicit empty/stale state: no data is never a broken page (spec §7). */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
```

- [ ] **Step 5: Write `src/components/UpdatedAgo.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { formatAgo } from '@/lib/format';

/**
 * "updated Nm ago" badge from a snapshot's taken_at (spec §6).
 * Renders a neutral placeholder until mounted (no hydration mismatch),
 * then ticks every 60s.
 */
export function UpdatedAgo({ takenAt }: { takenAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="updated-ago" title={new Date(takenAt).toUTCString()}>
      {now === null ? 'updated —' : `updated ${formatAgo(new Date(takenAt).getTime(), now)}`}
    </span>
  );
}
```

- [ ] **Step 6: Replace `src/app/globals.css` entirely**

```css
/* ------------------------------------------------------------------ */
/* macro.watch — the house sheet.                                      */
/* Georgia serif, sharp-market-note restraint, light + dark (spec §8). */
/* ------------------------------------------------------------------ */

:root {
  color-scheme: light dark;
  --bg: #faf9f5;
  --ink: #1d1c18;
  --muted: #6f6c63;
  --faint: #a3a099;
  --rule: #ddd9d0;
  --card: #f2f0ea;
  --accent: #7c2323;
  --up: #2e6b46;
  --down: #9c3327;
  --hold: #8a6d1f;
  --maxw: 44rem;
  --maxw-wide: 70rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #181713;
    --ink: #e8e5dc;
    --muted: #9a968b;
    --faint: #6c6961;
    --rule: #34322b;
    --card: #211f1a;
    --accent: #cf8b6b;
    --up: #7db894;
    --down: #d18a7c;
    --hold: #c7a34f;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 1.0625rem;
  line-height: 1.55;
}

a {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

h1,
h2,
h3 {
  font-weight: normal;
  line-height: 1.25;
}

h1 {
  font-size: 1.9rem;
  margin: 0.5rem 0 1rem;
}

h2 {
  font-size: 1.25rem;
  margin: 2.5rem 0 0.75rem;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.35rem;
}

h3 {
  font-size: 1.05rem;
  margin: 1.5rem 0 0.5rem;
}

.container {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 1.5rem 1.25rem 4rem;
}

.container-wide {
  max-width: var(--maxw-wide);
  margin: 0 auto;
  padding: 1.5rem 1.25rem 4rem;
}

/* --- masthead ----------------------------------------------------- */

.site-header {
  max-width: var(--maxw-wide);
  margin: 0 auto;
  padding: 2rem 1.25rem 1rem;
  border-bottom: 1px solid var(--rule);
}

.site-name {
  font-size: 1.5rem;
  color: var(--ink);
  text-decoration: none;
  letter-spacing: 0.02em;
}

.byline {
  margin: 0.15rem 0 0;
  font-style: italic;
  color: var(--muted);
  font-size: 0.9rem;
}

.site-nav {
  margin-top: 0.9rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1.1rem;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.site-nav a {
  color: var(--muted);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--accent);
}

.site-footer {
  max-width: var(--maxw-wide);
  margin: 3rem auto 0;
  padding: 1.5rem 1.25rem 3rem;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 0.85rem;
}

.site-footer p {
  margin: 0.3rem 0;
}

/* --- shared atoms -------------------------------------------------- */

.badge {
  display: inline-block;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0.1rem 0.45rem;
  color: var(--muted);
  vertical-align: middle;
}

.badge-weekend {
  border-color: var(--accent);
  color: var(--accent);
}

.badge-active {
  border-color: var(--up);
  color: var(--up);
}

.badge-candidate {
  border-color: var(--hold);
  color: var(--hold);
}

.badge-retired {
  color: var(--faint);
}

.updated-ago {
  font-size: 0.8rem;
  color: var(--faint);
  font-style: italic;
}

.empty-state {
  color: var(--muted);
  font-style: italic;
  border-left: 2px solid var(--rule);
  padding-left: 0.9rem;
  margin: 1.5rem 0;
}

.brief-meta {
  color: var(--muted);
  font-size: 0.9rem;
}

.date {
  color: var(--muted);
  font-size: 0.9rem;
  margin-right: 0.6rem;
}

/* --- the brief ------------------------------------------------------ */

.brief-body p {
  margin: 0.9rem 0;
}

.brief-body table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.95rem;
}

.brief-body td,
.brief-body th {
  border-bottom: 1px solid var(--rule);
  padding: 0.35rem 0.6rem 0.35rem 0;
  text-align: left;
}

.brief-body blockquote {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 2px solid var(--accent);
  color: var(--muted);
}

.brief-body img {
  max-width: 100%;
}

/* --- panels ---------------------------------------------------------- */

.panel {
  border: 1px solid var(--rule);
  background: var(--card);
  padding: 1rem 1.25rem;
  margin: 2rem 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.panel-head h2 {
  margin: 0;
  border: none;
  padding: 0;
  font-size: 1.05rem;
}

.panel-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.6rem;
  font-size: 0.95rem;
}

.panel-table td {
  padding: 0.3rem 0.5rem 0.3rem 0;
  border-bottom: 1px solid var(--rule);
}

.panel-table tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.change-up {
  color: var(--up);
}

.change-down {
  color: var(--down);
}

.panel-note {
  color: var(--faint);
  font-size: 0.85rem;
}

/* --- theme map -------------------------------------------------------- */

.theme-strip {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0;
}

.theme-strip li {
  border: 1px solid var(--rule);
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
  gap: 1rem;
  padding: 0;
  list-style: none;
}

.theme-card {
  border: 1px solid var(--rule);
  background: var(--card);
  padding: 1rem 1.1rem;
}

.theme-card h3 {
  margin: 0 0 0.4rem;
}

.read {
  margin: 0.4rem 0;
}

.conv {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.conv-high {
  color: var(--up);
}

.conv-medium {
  color: var(--hold);
}

.conv-low {
  color: var(--faint);
}

.trigger-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

/* --- timeline ---------------------------------------------------------- */

.timeline {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}

.timeline li {
  border-left: 2px solid var(--rule);
  padding: 0 0 1.1rem 1rem;
}

.dir {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.05rem 0.4rem;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.dir-raise {
  color: var(--up);
}

.dir-lower {
  color: var(--down);
}

.dir-hold {
  color: var(--hold);
}

.dir-candidate {
  color: var(--muted);
}

.dir-invalidate,
.dir-retire {
  color: var(--faint);
}

.evidence {
  margin: 0.35rem 0 0.2rem;
}

.meta {
  font-size: 0.82rem;
  color: var(--faint);
  margin: 0;
}

/* --- charts -------------------------------------------------------------- */

figure {
  margin: 1.5rem 0;
}

.conviction-chart svg {
  width: 100%;
  height: auto;
}

.chart-grid {
  stroke: var(--rule);
  stroke-width: 1;
}

.chart-label {
  fill: var(--faint);
  font-size: 10px;
  font-family: Georgia, serif;
}

.chart-line {
  stroke: var(--accent);
  stroke-width: 2;
  fill: none;
}

.conviction-chart figcaption {
  color: var(--faint);
  font-size: 0.82rem;
}

/* --- data tables (claims, related claims) --------------------------------- */

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  margin: 1rem 0;
}

.data-table th {
  text-align: left;
  font-weight: normal;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--ink);
  padding: 0.4rem 0.75rem 0.4rem 0;
}

.data-table td {
  border-bottom: 1px solid var(--rule);
  padding: 0.45rem 0.75rem 0.45rem 0;
  vertical-align: top;
}

.status-open {
  color: var(--hold);
}

.status-resolved_correct {
  color: var(--up);
}

.status-resolved_incorrect {
  color: var(--down);
}

.status-expired,
.status-invalidated {
  color: var(--faint);
}

/* --- forms (filters, search) ------------------------------------------------ */

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-items: flex-end;
  margin: 1.25rem 0;
  font-size: 0.9rem;
}

.filters label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: var(--muted);
}

.filters select,
.search-form input {
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--rule);
  padding: 0.3rem 0.5rem;
}

.filters button,
.search-form button {
  font-family: inherit;
  font-size: 0.9rem;
  background: var(--card);
  color: var(--ink);
  border: 1px solid var(--muted);
  padding: 0.35rem 0.9rem;
  cursor: pointer;
}

.search-form {
  display: flex;
  gap: 0.6rem;
  margin: 1.25rem 0;
}

.search-form input {
  flex: 1;
}

/* --- archive + search results ------------------------------------------------ */

.archive-list {
  list-style: none;
  padding: 0;
}

.archive-list li {
  border-bottom: 1px solid var(--rule);
  padding: 1rem 0;
}

.excerpt {
  color: var(--muted);
  margin: 0.25rem 0 0;
  font-size: 0.95rem;
}

/* --- scoreboards ---------------------------------------------------------------- */

.boards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}

.board {
  border: 1px solid var(--rule);
  background: var(--card);
  padding: 0.9rem 1rem;
}

.board h3 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
}

.board dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.15rem 1rem;
  font-size: 0.9rem;
}

.board dt {
  color: var(--muted);
}

.board dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.hit-rate {
  font-size: 1.6rem;
  margin: 0.2rem 0;
}

/* --- catalysts -------------------------------------------------------------------- */

.catalyst {
  border: 1px solid var(--rule);
  background: var(--card);
  padding: 1rem 1.1rem;
  margin: 1rem 0;
}

.catalyst h3 {
  margin: 0.15rem 0;
}

.vs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 0.6rem;
}

@media (max-width: 40rem) {
  .vs {
    grid-template-columns: 1fr;
  }
}

.vs h4 {
  margin: 0 0 0.3rem;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: normal;
}

.home-footer-links {
  margin-top: 3rem;
  color: var(--muted);
}
```

- [ ] **Step 7: Replace `src/app/layout.tsx` entirely**

```tsx
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'macro.watch', template: '%s · macro.watch' },
  description:
    'AI-composed macro intelligence — deterministically validated, self-graded, published daily. SovsClaw, a Sovereign Signal system.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div>
            <Link href="/" className="site-name">
              macro.watch
            </Link>
            <p className="byline">SovsClaw — a Sovereign Signal system</p>
          </div>
          <nav className="site-nav" aria-label="Site">
            <Link href="/">Brief</Link>
            <Link href="/briefs">Archive</Link>
            <Link href="/map">Theme Map</Link>
            <Link href="/accountability">Accountability</Link>
            <Link href="/catalysts">Catalysts</Link>
            <Link href="/search">Search</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>SovsClaw — a Sovereign Signal system. AI-composed, deterministically validated, self-graded.</p>
          <p>
            Not investment advice. Nothing here is a recommendation to buy or sell any security or
            asset.
          </p>
          <p>
            <a href="/feed.xml">RSS</a> · <Link href="/about">About</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Write `src/app/icon.svg`** (simple text-mark for v1; the scorpion mark is a spec §13 open item)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1d1c18"/>
  <text x="32" y="44" font-family="Georgia, serif" font-size="34" fill="#faf9f5" text-anchor="middle">m.</text>
</svg>
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/format-ago.test.ts tests/layout.test.tsx`
Expected: PASS — `Tests  8 passed`.

- [ ] **Step 10: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green; build route table shows `/`.

- [ ] **Step 11: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: design system, site chrome with byline and disclaimer, shared atoms"
```

---

### Task 9: Home page

Spec §5 `/`: today's brief rendered in full (lens + deep research arrive inside the brief HTML), the dashboard panel with its freshness badge, a compact theme-map strip, and footer links to the archive and RSS. Also creates the query layer pieces and the defensive panel-payload contract that later tasks reuse.

**Files:**
- Create: `src/lib/safe.ts`
- Create: `src/lib/panel-contract.ts`
- Create: `src/lib/queries/briefs.ts`
- Create: `src/lib/queries/panels.ts`
- Create: `src/lib/queries/map.ts`
- Create: `src/components/BriefArticle.tsx`
- Create: `src/components/PanelTable.tsx`
- Create: `src/components/ThemeStrip.tsx`
- Create: `src/components/HomeView.tsx`
- Modify: `src/app/page.tsx` (replace entire file)
- Test: `tests/queries-home.test.ts`
- Test: `tests/home-view.test.tsx`

**Interfaces:**
- Consumes: schema tables, `Db`, `getDb` (Task 2); `seedAll` + fixtures (Task 7); `ThemeStateCard` type (Task 4); `EmptyState`, `UpdatedAgo`, `formatDate` (Task 8).
- Produces:
  - `safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T>` from `@/lib/safe`.
  - `type PanelRowItem = { label: string; value: string; change: string | null; note: string | null }` and `panelRows(payload: unknown): PanelRowItem[]` from `@/lib/panel-contract`.
  - `type BriefRow` (= `typeof briefs.$inferSelect`), `type BriefListItem = { date: string; kind: string; subject: string; ping: string; sentVerifiedAt: Date }`, `getLatestBrief(db): Promise<BriefRow | null>`, `getBriefByDate(db, date): Promise<BriefRow | null>`, `listBriefs(db): Promise<BriefListItem[]>` from `@/lib/queries/briefs`.
  - `getLatestPanel(db: Db, kind: PanelKind): Promise<{ takenAt: Date; payload: unknown } | null>` from `@/lib/queries/panels`.
  - `type ThemeCard = { slug: string; name: string; status: string; firstSeen: string | null; lastEventAt: string | null; conviction: 'low' | 'medium' | 'high' | null; read: string | null; triggers: { name: string; state: string }[]; raiseConditions: string[]; lowerConditions: string[] }` and `getThemeMapCards(db): Promise<{ takenAt: Date | null; cards: ThemeCard[] }>` from `@/lib/queries/map` (Task 11 appends the per-theme queries to this same file).
  - Components: `BriefArticle({ brief })`, `PanelTable({ title, rows, takenAt })`, `ThemeStrip({ cards })`, `HomeView({ brief, panel, cards })` where `panel: { takenAt: string; rows: PanelRowItem[] } | null`.

- [ ] **Step 1: Write the failing tests**

`tests/queries-home.test.ts`:

```ts
import { expect, it } from 'vitest';
import { panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

it('safeQuery returns the fallback when the query throws', async () => {
  const result = await safeQuery(async () => {
    throw new Error('connection refused');
  }, 'fallback');
  expect(result).toBe('fallback');
});

it('panelRows extracts rows defensively from unknown payloads', () => {
  expect(panelRows(null)).toEqual([]);
  expect(panelRows({ nope: true })).toEqual([]);
  expect(panelRows({ rows: [{ label: 'ES', value: '6,412.50', change: '+0.4%' }, { junk: 1 }, { label: 'N', value: 42 }] })).toEqual([
    { label: 'ES', value: '6,412.50', change: '+0.4%', note: null },
    { label: 'N', value: '42', change: null, note: null },
  ]);
});

it('getLatestBrief returns the newest brief by date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const brief = await getLatestBrief(db);
  expect(brief?.date).toBe('2026-07-11');
  expect(brief?.kind).toBe('weekend');
});

it('getLatestPanel returns the newest snapshot of a kind', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const panel = await getLatestPanel(db, 'dashboard');
  expect(panel).not.toBeNull();
  expect(panelRows(panel?.payload)[0]).toEqual({ label: 'ES', value: '6,412.50', change: '+0.4%', note: null });
});

it('getThemeMapCards merges themes rows with the latest state snapshot', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { takenAt, cards } = await getThemeMapCards(db);
  expect(takenAt?.toISOString()).toBe('2026-07-11T12:10:00.000Z');
  expect(cards.map((c) => c.slug)).toEqual(['rate-path-repricing', 'dollar-downtrend', 'china-reflation']);
  const rate = cards[0];
  expect(rate.status).toBe('active');
  expect(rate.conviction).toBe('high');
  expect(rate.read).toContain('underpricing');
  expect(rate.triggers).toEqual([
    { name: '2y auction demand', state: 'live' },
    { name: 'July CPI', state: 'pending' },
  ]);
  const dollar = cards[1];
  expect(dollar.raiseConditions).toEqual(['ECB holds while the Fed blinks']); // string normalized to list
  expect(cards[2].status).toBe('retired');
});
```

`tests/home-view.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HomeView } from '@/components/HomeView';
import type { BriefRow } from '@/lib/queries/briefs';

const BRIEF: BriefRow = {
  date: '2026-07-11',
  kind: 'weekend',
  subject: 'Weekend review: what the map got right about the dollar',
  ping: 'The dollar downtrend theme aged well this week.',
  html: '<h2>The week in themes</h2><p>DXY closed below its June range.</p>',
  sentVerifiedAt: new Date('2026-07-11T12:02:33Z'),
  ingestedAt: new Date('2026-07-11T12:03:00Z'),
  search: '',
};

it('renders the brief in full with the weekend label', () => {
  const markup = renderToStaticMarkup(<HomeView brief={BRIEF} panel={null} cards={[]} />);
  expect(markup).toContain('Weekend review: what the map got right about the dollar');
  expect(markup).toContain('DXY closed below its June range.');
  expect(markup).toContain('Weekend review'); // badge
  expect(markup).toContain('July 11, 2026');
});

it('renders panel rows with change coloring', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={{
        takenAt: '2026-07-11T12:00:00Z',
        rows: [
          { label: 'ES', value: '6,412.50', change: '+0.4%', note: null },
          { label: 'DXY', value: '95.84', change: '-0.3%', note: null },
        ],
      }}
      cards={[]}
    />,
  );
  expect(markup).toContain('ES');
  expect(markup).toContain('change-up');
  expect(markup).toContain('change-down');
  expect(markup).toContain('updated —'); // UpdatedAgo pre-hydration placeholder
});

it('renders explicit empty states when nothing is published', () => {
  const markup = renderToStaticMarkup(<HomeView brief={null} panel={null} cards={[]} />);
  expect(markup).toContain('No brief published yet');
  expect(markup).toContain('No data yet');
  expect(markup).toContain('No themes on the map yet');
});

it('links theme strip entries to their theme pages', () => {
  const markup = renderToStaticMarkup(
    <HomeView
      brief={null}
      panel={null}
      cards={[
        {
          slug: 'rate-path-repricing',
          name: 'Rate-path repricing',
          status: 'active',
          firstSeen: '2026-06-20',
          lastEventAt: '2026-07-08',
          conviction: 'high',
          read: null,
          triggers: [],
          raiseConditions: [],
          lowerConditions: [],
        },
      ]}
    />,
  );
  expect(markup).toContain('href="/map/rate-path-repricing"');
  expect(markup).toContain('conv-high');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/queries-home.test.ts tests/home-view.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/safe"` (and `"@/components/HomeView"`).

- [ ] **Step 3: Write `src/lib/safe.ts`**

```ts
/**
 * Wraps page-level reads: a DB failure degrades to an explicit empty state
 * instead of a crashed render (spec §6/§7). Also what lets `next build`
 * prerender with no database reachable (CI).
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[macro.watch] query failed:', err);
    return fallback;
  }
}
```

- [ ] **Step 4: Write `src/lib/panel-contract.ts`**

```ts
export type PanelRowItem = {
  label: string;
  value: string;
  change: string | null;
  note: string | null;
};

/**
 * Panel payloads are a jsonb passthrough of the pipeline's cache shapes
 * (spec §3). The rendering contract with the publisher: payload.rows is an
 * array of { label, value, change?, note? }. Anything malformed is skipped —
 * a bad payload renders as an empty panel, never a broken page.
 */
export function panelRows(payload: unknown): PanelRowItem[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const rows = (payload as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  const out: PanelRowItem[] = [];
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const { label, value, change, note } = r as Record<string, unknown>;
    if (typeof label !== 'string' || label.length === 0) continue;
    out.push({
      label,
      value: typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '—',
      change: typeof change === 'string' ? change : null,
      note: typeof note === 'string' ? note : null,
    });
  }
  return out;
}
```

- [ ] **Step 5: Write the query modules**

`src/lib/queries/briefs.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { briefs } from '@/db/schema';

export type BriefRow = typeof briefs.$inferSelect;

export type BriefListItem = {
  date: string;
  kind: string;
  subject: string;
  ping: string;
  sentVerifiedAt: Date;
};

export async function getLatestBrief(db: Db): Promise<BriefRow | null> {
  const rows = await db.select().from(briefs).orderBy(desc(briefs.date)).limit(1);
  return rows[0] ?? null;
}

export async function getBriefByDate(db: Db, date: string): Promise<BriefRow | null> {
  const rows = await db.select().from(briefs).where(eq(briefs.date, date)).limit(1);
  return rows[0] ?? null;
}

export async function listBriefs(db: Db): Promise<BriefListItem[]> {
  return db
    .select({
      date: briefs.date,
      kind: briefs.kind,
      subject: briefs.subject,
      ping: briefs.ping,
      sentVerifiedAt: briefs.sentVerifiedAt,
    })
    .from(briefs)
    .orderBy(desc(briefs.date));
}
```

`src/lib/queries/panels.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { panelSnapshots } from '@/db/schema';
import type { PanelKind } from '@/lib/ingest/panels';

export async function getLatestPanel(
  db: Db,
  kind: PanelKind,
): Promise<{ takenAt: Date; payload: unknown } | null> {
  const rows = await db
    .select({ takenAt: panelSnapshots.takenAt, payload: panelSnapshots.payload })
    .from(panelSnapshots)
    .where(and(eq(panelSnapshots.kind, kind)))
    .orderBy(desc(panelSnapshots.takenAt))
    .limit(1);
  return rows[0] ?? null;
}
```

`src/lib/queries/map.ts`:

```ts
import { desc } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { themes, themeState } from '@/db/schema';
import type { ThemeStateCard } from '@/lib/ingest/themes';

export type ThemeCard = {
  slug: string;
  name: string;
  status: string;
  firstSeen: string | null;
  lastEventAt: string | null;
  conviction: 'low' | 'medium' | 'high' | null;
  read: string | null;
  triggers: { name: string; state: string }[];
  raiseConditions: string[];
  lowerConditions: string[];
};

function toList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function stateCardsOf(payload: unknown): Map<string, ThemeStateCard> {
  const out = new Map<string, ThemeStateCard>();
  const cards = (payload as { themes?: ThemeStateCard[] })?.themes;
  if (Array.isArray(cards)) {
    for (const c of cards) out.set(c.slug, c);
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
      name: t.name,
      status: t.status,
      firstSeen: t.firstSeen,
      lastEventAt: t.lastEventAt,
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
        name: s.name,
        status: 'active',
        firstSeen: null,
        lastEventAt: null,
        conviction: s.conviction ?? null,
        read: s.current_read ?? null,
        triggers: s.triggers ?? [],
        raiseConditions: toList(s.raise_conditions),
        lowerConditions: toList(s.lower_conditions),
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
```

- [ ] **Step 6: Write the components**

`src/components/BriefArticle.tsx`:

```tsx
import { formatDate } from '@/lib/format';

/**
 * Renders a brief in full. The HTML is sanitized publisher-side before it
 * ever reaches ingest (spec §3) and ingest is bearer-token gated, so this is
 * trusted content by contract.
 */
export function BriefArticle(props: {
  brief: { date: string; kind: string; subject: string; html: string };
}) {
  const { brief } = props;
  return (
    <article className="brief">
      <p className="brief-meta">
        {formatDate(brief.date)}{' '}
        {brief.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
      </p>
      <h1>{brief.subject}</h1>
      <div className="brief-body" dangerouslySetInnerHTML={{ __html: brief.html }} />
    </article>
  );
}
```

`src/components/PanelTable.tsx`:

```tsx
import type { PanelRowItem } from '@/lib/panel-contract';
import { EmptyState } from './EmptyState';
import { UpdatedAgo } from './UpdatedAgo';

function changeClass(change: string): string {
  if (change.startsWith('+')) return 'num change-up';
  if (change.startsWith('-')) return 'num change-down';
  return 'num';
}

export function PanelTable(props: { title: string; rows: PanelRowItem[]; takenAt: string | null }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{props.title}</h2>
        {props.takenAt ? <UpdatedAgo takenAt={props.takenAt} /> : null}
      </div>
      {props.rows.length === 0 ? (
        <EmptyState>No data yet — the pipeline publishes this panel every 15 minutes.</EmptyState>
      ) : (
        <table className="panel-table">
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.label}>
                <td>
                  {r.label}
                  {r.note ? <span className="panel-note"> — {r.note}</span> : null}
                </td>
                <td className="num">{r.value}</td>
                <td className={r.change ? changeClass(r.change) : 'num'}>{r.change ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

`src/components/ThemeStrip.tsx`:

```tsx
import Link from 'next/link';
import type { ThemeCard } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

/** Compact theme-map strip for the home page (spec §5 /). */
export function ThemeStrip({ cards }: { cards: ThemeCard[] }) {
  const live = cards.filter((c) => c.status !== 'retired');
  if (live.length === 0) {
    return <EmptyState>No themes on the map yet. Themes appear as the system surfaces and grades them.</EmptyState>;
  }
  return (
    <>
      <ul className="theme-strip">
        {live.map((c) => (
          <li key={c.slug}>
            <Link href={`/map/${c.slug}`}>{c.name}</Link>{' '}
            {c.conviction ? <span className={`conv conv-${c.conviction}`}>{c.conviction}</span> : null}{' '}
            <span className={`badge badge-${c.status}`}>{c.status}</span>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/map">Full theme map →</Link>
      </p>
    </>
  );
}
```

`src/components/HomeView.tsx`:

```tsx
import type { PanelRowItem } from '@/lib/panel-contract';
import type { BriefRow } from '@/lib/queries/briefs';
import type { ThemeCard } from '@/lib/queries/map';
import { BriefArticle } from './BriefArticle';
import { EmptyState } from './EmptyState';
import { PanelTable } from './PanelTable';
import { ThemeStrip } from './ThemeStrip';

export function HomeView(props: {
  brief: BriefRow | null;
  panel: { takenAt: string; rows: PanelRowItem[] } | null;
  cards: ThemeCard[];
}) {
  return (
    <main className="container">
      {props.brief ? (
        <BriefArticle brief={props.brief} />
      ) : (
        <EmptyState>
          No brief published yet. Dailies land at 14:00 UTC Monday–Friday; the weekend review lands
          Saturday at 12:00 UTC.
        </EmptyState>
      )}
      <section aria-label="Market dashboard">
        <PanelTable
          title="Dashboard"
          rows={props.panel?.rows ?? []}
          takenAt={props.panel?.takenAt ?? null}
        />
      </section>
      <section aria-label="Theme map">
        <h2>Theme map</h2>
        <ThemeStrip cards={props.cards} />
      </section>
      <p className="home-footer-links">
        <a href="/briefs">Brief archive</a> · <a href="/feed.xml">RSS</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Replace `src/app/page.tsx` entirely**

```tsx
import { HomeView } from '@/components/HomeView';
import { getDb } from '@/db/client';
import { panelRows } from '@/lib/panel-contract';
import { getLatestBrief } from '@/lib/queries/briefs';
import { getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';

// ISR fallback: pages keep serving if Postgres blips; ingest revalidates
// on-demand the moment a publish lands (spec §6).
export const revalidate = 900;

export default async function HomePage() {
  const db = getDb();
  const brief = await safeQuery(() => getLatestBrief(db), null);
  const panel = await safeQuery(() => getLatestPanel(db, 'dashboard'), null);
  const map = await safeQuery(() => getThemeMapCards(db), { takenAt: null, cards: [] });
  return (
    <HomeView
      brief={brief}
      panel={panel ? { takenAt: panel.takenAt.toISOString(), rows: panelRows(panel.payload) } : null}
      cards={map.cards}
    />
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/queries-home.test.ts tests/home-view.test.tsx`
Expected: PASS — `Tests  9 passed`.

- [ ] **Step 9: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: home page — full brief, dashboard panel with freshness badge, theme strip"
```

---

### Task 10: Briefs archive, permalinks, RSS

Spec §5 `/briefs`, `/briefs/[date]` (weekend reviews labeled) and `/feed.xml` (title = subject, body = ping + link).

**Files:**
- Create: `src/app/briefs/page.tsx`
- Create: `src/app/briefs/[date]/page.tsx`
- Create: `src/lib/rss.ts`
- Create: `src/app/feed.xml/route.ts`
- Test: `tests/briefs-pages.test.tsx`
- Test: `tests/rss.test.ts`

**Interfaces:**
- Consumes: `listBriefs`, `getBriefByDate`, `BriefListItem` (Task 9); `BriefArticle`, `EmptyState` (Tasks 8–9); `xmlEscape`, `formatDate` (Task 8/1); `seedAll`; `safeQuery`.
- Produces: `siteUrl(): string` and `buildFeed(items: BriefListItem[]): string` from `@/lib/rss` (Task 15's smoke test hits `/feed.xml`).

- [ ] **Step 1: Write the failing tests**

`tests/rss.test.ts`:

```ts
import { beforeEach, expect, it } from 'vitest';
import { buildFeed, siteUrl } from '@/lib/rss';

beforeEach(() => {
  process.env.SITE_URL = 'https://macro.watch';
});

const ITEM = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Rates & the "long" end',
  ping: 'Front-end yields snapped higher.',
  sentVerifiedAt: new Date('2026-07-10T14:05:00Z'),
};

it('builds RSS with title = subject and body = ping + link', () => {
  const xml = buildFeed([ITEM]);
  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(xml).toContain('<title>Rates &amp; the &quot;long&quot; end</title>');
  expect(xml).toContain('<link>https://macro.watch/briefs/2026-07-10</link>');
  expect(xml).toContain('Front-end yields snapped higher.');
  expect(xml).toContain('https://macro.watch/briefs/2026-07-10</description>');
  expect(xml).toContain('<pubDate>Fri, 10 Jul 2026 14:05:00 GMT</pubDate>');
});

it('siteUrl strips a trailing slash and defaults to macro.watch', () => {
  process.env.SITE_URL = 'https://staging.example.com/';
  expect(siteUrl()).toBe('https://staging.example.com');
  delete process.env.SITE_URL;
  expect(siteUrl()).toBe('https://macro.watch');
});

it('an empty archive still yields a valid channel', () => {
  const xml = buildFeed([]);
  expect(xml).toContain('<channel>');
  expect(xml).not.toContain('<item>');
});
```

`tests/briefs-pages.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: BriefsPage } = await import('@/app/briefs/page');
const { default: BriefPage } = await import('@/app/briefs/[date]/page');

it('archive lists every brief newest-first with weekend labels', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefsPage());
  expect(markup).toContain('href="/briefs/2026-07-11"');
  expect(markup).toContain('href="/briefs/2026-07-09"');
  expect(markup).toContain('href="/briefs/2026-07-08"');
  expect(markup).toContain('Weekend review'); // label on the Saturday brief
  expect(markup.indexOf('2026-07-11')).toBeLessThan(markup.indexOf('2026-07-08')); // newest first
});

it('archive shows an empty state with no briefs', async () => {
  await createTestDb(); // no seed
  const markup = renderToStaticMarkup(await BriefsPage());
  expect(markup).toContain('No briefs yet');
});

it('permalink renders the brief in full', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await BriefPage({ params: Promise.resolve({ date: '2026-07-08' }) }));
  expect(markup).toContain('Front-end repricing meets a heavy auction week');
  expect(markup).toContain('Term premium models'); // deep research section of the html
});

it('permalink 404s for a missing or malformed date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(BriefPage({ params: Promise.resolve({ date: '1900-01-01' }) })).rejects.toThrow();
  await expect(BriefPage({ params: Promise.resolve({ date: 'not-a-date' }) })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rss.test.ts tests/briefs-pages.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/rss"` (and `"@/app/briefs/page"`).

- [ ] **Step 3: Write `src/lib/rss.ts`**

```ts
import { xmlEscape } from './format';
import type { BriefListItem } from './queries/briefs';

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'https://macro.watch').replace(/\/$/, '');
}

/** RSS 2.0 of briefs: title = subject, body = ping + link (spec §5). */
export function buildFeed(items: BriefListItem[]): string {
  const base = siteUrl();
  const entries = items
    .map((b) => {
      const link = `${base}/briefs/${b.date}`;
      return [
        '    <item>',
        `      <title>${xmlEscape(b.subject)}</title>`,
        `      <link>${link}</link>`,
        `      <guid isPermaLink="true">${link}</guid>`,
        `      <pubDate>${b.sentVerifiedAt.toUTCString()}</pubDate>`,
        `      <description>${xmlEscape(`${b.ping}\n\n${link}`)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>macro.watch</title>',
    `    <link>${base}</link>`,
    '    <description>Daily macro brief from SovsClaw — a Sovereign Signal system. AI-composed, deterministically validated, self-graded.</description>',
    '    <language>en</language>',
    entries,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Write `src/app/feed.xml/route.ts`**

```ts
import { getDb } from '@/db/client';
import { listBriefs } from '@/lib/queries/briefs';
import { buildFeed } from '@/lib/rss';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;

export async function GET(): Promise<Response> {
  const items = await safeQuery(() => listBriefs(getDb()), []);
  return new Response(buildFeed(items), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
```

- [ ] **Step 5: Write `src/app/briefs/page.tsx`**

```tsx
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { listBriefs } from '@/lib/queries/briefs';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Brief archive' };

export default async function BriefsPage() {
  const items = await safeQuery(() => listBriefs(getDb()), []);
  return (
    <main className="container">
      <h1>Brief archive</h1>
      {items.length === 0 ? (
        <EmptyState>
          No briefs yet. The archive grows from launch — daily at 14:00 UTC Monday–Friday, weekend
          reviews Saturday.
        </EmptyState>
      ) : (
        <ul className="archive-list">
          {items.map((b) => (
            <li key={b.date}>
              <span className="date">{formatDate(b.date)}</span>
              {b.kind === 'weekend' ? <span className="badge badge-weekend">Weekend review</span> : null}
              <div>
                <Link href={`/briefs/${b.date}`}>{b.subject}</Link>
              </div>
              <p className="excerpt">{b.ping}</p>
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Write `src/app/briefs/[date]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { BriefArticle } from '@/components/BriefArticle';
import { getDb } from '@/db/client';
import { getBriefByDate } from '@/lib/queries/briefs';

export const revalidate = 900;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: 'Brief' };
  const brief = await getBriefByDate(getDb(), date);
  return { title: brief ? brief.subject : 'Brief' };
}

export default async function BriefPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  // Deliberately NOT safeQuery: if the DB is briefly down during background
  // revalidation, throwing keeps the previously rendered page serving
  // (ISR stale-on-error) instead of replacing it with a 404.
  const brief = await getBriefByDate(getDb(), date);
  if (!brief) notFound();
  return (
    <main className="container">
      <BriefArticle brief={brief} />
    </main>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/rss.test.ts tests/briefs-pages.test.tsx`
Expected: PASS — `Tests  7 passed`.

- [ ] **Step 8: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green; build route table now includes `/briefs`, `/briefs/[date]`, `/feed.xml`.

- [ ] **Step 9: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: brief archive, permalinks, and RSS feed"
```

---

### Task 11: Theme map + per-theme pages

The flagship (spec §5). `/map`: grid of theme cards (conviction, one-line read, trigger states, lifecycle badge) grouped active/candidate/retired, with the snapshot freshness badge. `/map/[theme]`: current card + full event timeline (every raise/lower/candidate/retire since birth, each linked to its source brief) + related claims + a conviction-over-time SVG built from theme_state history.

**Files:**
- Modify: `src/lib/queries/map.ts` (append per-theme queries; do not touch existing code)
- Create: `src/components/ThemeGrid.tsx`
- Create: `src/components/ThemeTimeline.tsx`
- Create: `src/components/ConvictionChart.tsx`
- Create: `src/app/map/page.tsx`
- Create: `src/app/map/[theme]/page.tsx`
- Test: `tests/map-pages.test.tsx`

**Interfaces:**
- Consumes: `getThemeMapCards`, `ThemeCard` (Task 9); `themes`, `themeEvents`, `themeState`, `claims` tables; `upsertThemeState` (Task 4, used by the test to add a second snapshot); `EmptyState`, `UpdatedAgo`, `formatDate`; `seedAll`.
- Produces (appended to `@/lib/queries/map`):
  - `type ThemeEventRow = typeof themeEvents.$inferSelect`.
  - `type ConvictionPoint = { takenAt: string; level: 1 | 2 | 3 }`.
  - `type RelatedClaim = { claimId: string; openedAt: string; predicate: string; status: string }`.
  - `type ThemeDetail = { slug; name; status; firstSeen; lastEventAt; card: ThemeCard | null; events: ThemeEventRow[]; relatedClaims: RelatedClaim[]; conviction: ConvictionPoint[] }`.
  - `getConvictionSeries(db: Db, slug: string): Promise<ConvictionPoint[]>`, `getThemeDetail(db: Db, slug: string): Promise<ThemeDetail | null>`.
  - Components: `ThemeGrid({ cards })`, `ThemeTimeline({ events })` (accepts any object with `eventId, date, direction, evidence, triggerState, nextCheck, source`), `ConvictionChart({ points })`.

- [ ] **Step 1: Write the failing test**

`tests/map-pages.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { upsertThemeState } from '@/lib/ingest/themes';
import { getThemeDetail } from '@/lib/queries/map';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: MapPage } = await import('@/app/map/page');
const { default: ThemePage } = await import('@/app/map/[theme]/page');

it('getThemeDetail assembles card, timeline, related claims, conviction series', async () => {
  const db = await createTestDb();
  await seedAll(db);
  // Second, earlier snapshot so the conviction series has two points.
  await upsertThemeState(db, {
    taken_at: '2026-07-04T12:10:00Z',
    payload: {
      themes: [
        { slug: 'rate-path-repricing', name: 'Rate-path repricing', conviction: 'medium' },
      ],
    },
  });
  const detail = await getThemeDetail(db, 'rate-path-repricing');
  expect(detail).not.toBeNull();
  expect(detail?.name).toBe('Rate-path repricing');
  expect(detail?.status).toBe('active');
  expect(detail?.events.map((e) => e.eventId)).toEqual([
    'te-2026-07-08-rate-path-1',
    'te-2026-06-24-rate-path-1',
    'te-2026-06-20-rate-path-1',
  ]); // newest first
  expect(detail?.relatedClaims.map((c) => c.claimId).sort()).toEqual([
    'cl-2026-06-05-rates-2',
    'cl-2026-06-24-rates-1',
  ]);
  expect(detail?.conviction).toEqual([
    { takenAt: '2026-07-04T12:10:00.000Z', level: 2 },
    { takenAt: '2026-07-11T12:10:00.000Z', level: 3 },
  ]); // chronological
});

it('getThemeDetail returns null for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getThemeDetail(db, 'no-such-theme')).toBeNull();
});

it('/map renders the grid grouped by lifecycle with a freshness badge', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('Living Theme Map');
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('Dollar downtrend');
  expect(markup).toContain('Retired'); // section for china-reflation
  expect(markup).toContain('China reflation');
  expect(markup).toContain('conv-high');
  expect(markup).toContain('updated —');
  expect(markup).toContain('2y auction demand: live'); // trigger states on cards
});

it('/map renders an empty state with no data', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await MapPage());
  expect(markup).toContain('No themes on the map yet');
});

it('/map/[theme] renders the full dossier with brief-linked timeline', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await ThemePage({ params: Promise.resolve({ theme: 'rate-path-repricing' }) }),
  );
  expect(markup).toContain('Rate-path repricing');
  expect(markup).toContain('underpricing how slow the cutting cycle gets');
  expect(markup).toContain('Core CPI re-accelerates above 0.3% m/m'); // raise condition
  expect(markup).toContain('href="/briefs/2026-07-08"'); // event linked to source brief
  expect(markup).toContain('dir-raise');
  expect(markup).toContain('dir-candidate');
  expect(markup).toContain('2y UST closes above 4.40%'); // related claim
  expect(markup).toContain('Not enough history to chart conviction yet'); // 1 snapshot only
});

it('/map/[theme] 404s for an unknown slug', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await expect(ThemePage({ params: Promise.resolve({ theme: 'nope' }) })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/map-pages.test.tsx`
Expected: FAIL — `getThemeDetail` is not exported from `@/lib/queries/map`.

- [ ] **Step 3: Append to `src/lib/queries/map.ts`**

Add these imports to the top of the file (merge with the existing import lines):

```ts
import { asc, eq, sql } from 'drizzle-orm';
import { claims, themeEvents } from '@/db/schema';
```

Append at the end of the file:

```ts
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

export async function getThemeDetail(db: Db, slug: string): Promise<ThemeDetail | null> {
  const themeRows = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
  const themeRow = themeRows[0] ?? null;
  const { cards } = await getThemeMapCards(db);
  const card = cards.find((c) => c.slug === slug) ?? null;
  if (!themeRow && !card) return null;

  const events = await db
    .select()
    .from(themeEvents)
    .where(eq(themeEvents.themeSlug, slug))
    .orderBy(desc(themeEvents.date), desc(themeEvents.eventId));

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
      predicate: typeof predicate === 'string' ? predicate : c.claimId,
    };
  });

  return {
    slug,
    name: themeRow?.name ?? card?.name ?? slug,
    status: themeRow?.status ?? card?.status ?? 'active',
    firstSeen: themeRow?.firstSeen ?? null,
    lastEventAt: themeRow?.lastEventAt ?? null,
    card,
    events,
    relatedClaims,
    conviction: await getConvictionSeries(db, slug),
  };
}
```

- [ ] **Step 4: Write the components**

`src/components/ThemeGrid.tsx`:

```tsx
import Link from 'next/link';
import type { ThemeCard } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

function Section({ title, cards }: { title: string; cards: ThemeCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul className="theme-grid">
        {cards.map((c) => (
          <li key={c.slug} className="theme-card">
            <h3>
              <Link href={`/map/${c.slug}`}>{c.name}</Link>
            </h3>
            <p>
              <span className={c.conviction ? `conv conv-${c.conviction}` : 'conv'}>
                conviction: {c.conviction ?? '—'}
              </span>{' '}
              <span className={`badge badge-${c.status}`}>{c.status}</span>
            </p>
            {c.read ? <p className="read">{c.read}</p> : null}
            {c.triggers.length > 0 ? (
              <ul className="trigger-list">
                {c.triggers.map((t) => (
                  <li key={t.name}>
                    {t.name}: {t.state}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ThemeGrid({ cards }: { cards: ThemeCard[] }) {
  if (cards.length === 0) {
    return <EmptyState>No themes on the map yet. Themes appear as the system surfaces and grades them.</EmptyState>;
  }
  return (
    <>
      <Section title="Active" cards={cards.filter((c) => c.status === 'active')} />
      <Section title="Candidates" cards={cards.filter((c) => c.status === 'candidate')} />
      <Section title="Retired" cards={cards.filter((c) => c.status === 'retired')} />
    </>
  );
}
```

`src/components/ThemeTimeline.tsx`:

```tsx
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { EmptyState } from './EmptyState';

export type TimelineEvent = {
  eventId: string;
  date: string;
  direction: string;
  evidence: string;
  triggerState: string | null;
  nextCheck: string | null;
  source: string;
};

/** Full per-theme event history, each entry linked to its source brief (spec §5). */
export function ThemeTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <EmptyState>No events recorded for this theme yet.</EmptyState>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.eventId}>
          <span className={`dir dir-${e.direction}`}>{e.direction}</span>{' '}
          <Link href={`/briefs/${e.date}`}>{formatDate(e.date)}</Link>
          <p className="evidence">{e.evidence}</p>
          <p className="meta">
            {e.source === 'weekly' ? 'weekend review' : 'daily brief'}
            {e.triggerState ? ` · triggers: ${e.triggerState}` : ''}
            {e.nextCheck ? ` · next check: ${e.nextCheck}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
```

`src/components/ConvictionChart.tsx`:

```tsx
import type { ConvictionPoint } from '@/lib/queries/map';
import { EmptyState } from './EmptyState';

const LABELS = ['low', 'med', 'high'];

/**
 * Conviction-over-time as a hand-set step chart (spec §8: house charts, no
 * app-dashboard aesthetics — plain SVG, three ordinal levels).
 */
export function ConvictionChart({ points }: { points: ConvictionPoint[] }) {
  if (points.length < 2) {
    return <EmptyState>Not enough history to chart conviction yet — it appears once two snapshots exist.</EmptyState>;
  }
  const w = 560;
  const h = 120;
  const pad = 28;
  const t0 = new Date(points[0].takenAt).getTime();
  const t1 = new Date(points[points.length - 1].takenAt).getTime();
  const x = (iso: string): number =>
    t1 === t0 ? pad : pad + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (w - 2 * pad);
  const y = (level: number): number => h - pad - ((level - 1) / 2) * (h - 2 * pad);

  let d = `M ${x(points[0].takenAt).toFixed(1)} ${y(points[0].level).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(points[i].takenAt).toFixed(1)} V ${y(points[i].level).toFixed(1)}`;
  }

  return (
    <figure className="conviction-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Conviction over time">
        {[1, 2, 3].map((level) => (
          <g key={level}>
            <line x1={pad} x2={w - pad} y1={y(level)} y2={y(level)} className="chart-grid" />
            <text x={2} y={y(level) + 3} className="chart-label">
              {LABELS[level - 1]}
            </text>
          </g>
        ))}
        <path d={d} className="chart-line" />
      </svg>
      <figcaption>Conviction over time, from theme-state snapshots.</figcaption>
    </figure>
  );
}
```

- [ ] **Step 5: Write the pages**

`src/app/map/page.tsx`:

```tsx
import { ThemeGrid } from '@/components/ThemeGrid';
import { UpdatedAgo } from '@/components/UpdatedAgo';
import { getDb } from '@/db/client';
import { getThemeMapCards } from '@/lib/queries/map';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Living Theme Map' };

export default async function MapPage() {
  const { takenAt, cards } = await safeQuery(() => getThemeMapCards(getDb()), {
    takenAt: null,
    cards: [],
  });
  return (
    <main className="container-wide">
      <h1>Living Theme Map</h1>
      <p className="brief-meta">
        Every theme the system is tracking — conviction, current read, live triggers, lifecycle.{' '}
        {takenAt ? <UpdatedAgo takenAt={takenAt.toISOString()} /> : null}
      </p>
      <ThemeGrid cards={cards} />
    </main>
  );
}
```

`src/app/map/[theme]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConvictionChart } from '@/components/ConvictionChart';
import { EmptyState } from '@/components/EmptyState';
import { ThemeTimeline } from '@/components/ThemeTimeline';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { getThemeDetail } from '@/lib/queries/map';

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  const detail = await getThemeDetail(getDb(), theme);
  return { title: detail ? detail.name : 'Theme' };
}

export default async function ThemePage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  const detail = await getThemeDetail(getDb(), theme);
  if (!detail) notFound();
  const card = detail.card;
  return (
    <main className="container">
      <p className="brief-meta">
        <Link href="/map">← Theme map</Link>
      </p>
      <h1>{detail.name}</h1>
      <p>
        <span className={`badge badge-${detail.status}`}>{detail.status}</span>{' '}
        {card?.conviction ? (
          <span className={`conv conv-${card.conviction}`}>conviction: {card.conviction}</span>
        ) : null}{' '}
        {detail.firstSeen ? (
          <span className="brief-meta">on the map since {formatDate(detail.firstSeen)}</span>
        ) : null}
      </p>
      {card?.read ? <p className="read">{card.read}</p> : null}

      {card && card.raiseConditions.length + card.lowerConditions.length > 0 ? (
        <section>
          <h2>What would move it</h2>
          {card.raiseConditions.length > 0 ? (
            <>
              <h3>Raise</h3>
              <ul>
                {card.raiseConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {card.lowerConditions.length > 0 ? (
            <>
              <h3>Lower</h3>
              <ul>
                {card.lowerConditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {card && card.triggers.length > 0 ? (
        <section>
          <h2>Live triggers</h2>
          <ul className="trigger-list">
            {card.triggers.map((t) => (
              <li key={t.name}>
                {t.name}: {t.state}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Conviction over time</h2>
        <ConvictionChart points={detail.conviction} />
      </section>

      <section>
        <h2>Event timeline</h2>
        <ThemeTimeline events={detail.events} />
      </section>

      <section>
        <h2>Related claims</h2>
        {detail.relatedClaims.length === 0 ? (
          <EmptyState>No claims reference this theme yet.</EmptyState>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Predicate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.relatedClaims.map((c) => (
                <tr key={c.claimId}>
                  <td>{c.openedAt}</td>
                  <td>{c.predicate}</td>
                  <td className={`status-${c.status}`}>{c.status.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/map-pages.test.tsx`
Expected: PASS — `Tests  6 passed`.

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green; build route table now includes `/map` and `/map/[theme]`.

- [ ] **Step 8: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: living theme map — grid, per-theme dossier, timeline, conviction chart"
```

---

### Task 12: Accountability

Spec §5 `/accountability`: scoreboards (overall, per-theme, per-quality-class) + a filterable claims table. Honest empty states are a feature — with zero resolved claims the board says exactly: `0 resolved — not enough to grade yet.` Scoreboards are computed from the claims ledger itself (single source of truth); the pipeline's `scoreboard` panel snapshots remain stored for time-series use later. Quality class = the claim's `market_type` (spec §3 quality fields), `unclassified` when absent. The page reads `searchParams`, so it is force-dynamic (revalidation from ingest is unnecessary but harmless).

**Files:**
- Create: `src/lib/scoring.ts`
- Create: `src/lib/queries/accountability.ts`
- Create: `src/components/Scoreboards.tsx`
- Create: `src/components/ClaimsTable.tsx`
- Create: `src/app/accountability/page.tsx`
- Test: `tests/scoring.test.ts`
- Test: `tests/accountability-page.test.tsx`

**Interfaces:**
- Consumes: `claims` table; claim statuses `open | resolved_correct | resolved_incorrect | expired | invalidated` (Task 6); `EmptyState`; `seedAll`; `safeQuery`.
- Produces:
  - From `@/lib/scoring`: `type ScoreBoard = { open: number; resolved: number; correct: number; incorrect: number; expired: number; invalidated: number; hitRate: number | null }`, `scoreClaims(rows: { status: string }[]): ScoreBoard`, `groupBoards<T extends { status: string }>(rows: T[], keysOf: (row: T) => string[]): Map<string, ScoreBoard>`, `qualityClass(payload: unknown): string`.
  - From `@/lib/queries/accountability`: `type ClaimRecord = typeof claims.$inferSelect`, `type ClaimFilters = { kind?: string; status?: string; theme?: string }`, `getClaims(db: Db, f?: ClaimFilters): Promise<ClaimRecord[]>`.
  - Components: `Scoreboards({ overall, perTheme, perClass })` (perTheme/perClass are `[string, ScoreBoard][]`), `ClaimsTable({ claims, filters, themeOptions })`.

- [ ] **Step 1: Write the failing tests**

`tests/scoring.test.ts`:

```ts
import { expect, it } from 'vitest';
import { groupBoards, qualityClass, scoreClaims } from '@/lib/scoring';

it('zero resolved means hitRate null (not enough to grade)', () => {
  const board = scoreClaims([{ status: 'open' }, { status: 'expired' }]);
  expect(board).toEqual({
    open: 1,
    resolved: 0,
    correct: 0,
    incorrect: 0,
    expired: 1,
    invalidated: 0,
    hitRate: null,
  });
});

it('computes hit rate over resolved claims only', () => {
  const board = scoreClaims([
    { status: 'resolved_correct' },
    { status: 'resolved_correct' },
    { status: 'resolved_incorrect' },
    { status: 'open' },
    { status: 'invalidated' },
  ]);
  expect(board.resolved).toBe(3);
  expect(board.correct).toBe(2);
  expect(board.hitRate).toBeCloseTo(2 / 3);
  expect(board.open).toBe(1);
  expect(board.invalidated).toBe(1);
});

it('groupBoards fans a claim out to every key it carries', () => {
  const rows = [
    { status: 'resolved_correct', themes: ['a', 'b'] },
    { status: 'open', themes: ['a'] },
  ];
  const boards = groupBoards(rows, (r) => r.themes);
  expect([...boards.keys()].sort()).toEqual(['a', 'b']);
  expect(boards.get('a')?.resolved).toBe(1);
  expect(boards.get('a')?.open).toBe(1);
  expect(boards.get('b')?.resolved).toBe(1);
});

it('qualityClass reads market_type with an unclassified fallback', () => {
  expect(qualityClass({ market_type: 'rates' })).toBe('rates');
  expect(qualityClass({})).toBe('unclassified');
  expect(qualityClass(null)).toBe('unclassified');
});
```

`tests/accountability-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getClaims } from '@/lib/queries/accountability';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: AccountabilityPage } = await import('@/app/accountability/page');

function page(sp: Record<string, string> = {}) {
  return AccountabilityPage({ searchParams: Promise.resolve(sp) });
}

it('getClaims filters by kind, status, and theme membership', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await getClaims(db)).toHaveLength(5);
  expect(await getClaims(db, { kind: 'smart_money' })).toHaveLength(2);
  expect(await getClaims(db, { status: 'open' })).toHaveLength(2);
  expect(await getClaims(db, { theme: 'rate-path-repricing' })).toHaveLength(2);
  expect(await getClaims(db, { kind: 'map', theme: 'dollar-downtrend' })).toHaveLength(1);
});

it('renders scoreboards from the seeded ledger', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('Accountability');
  expect(markup).toContain('50%'); // 1 of 2 resolved correct
  expect(markup).toContain('By theme');
  expect(markup).toContain('By quality class');
  expect(markup).toContain('rates'); // market_type class board
  expect(markup).toContain('2y UST closes above 4.40%'); // claims table row
});

it('honest empty state with zero claims', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await page());
  expect(markup).toContain('0 resolved — not enough to grade yet.');
});

it('filters narrow the table but never the scoreboards', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await page({ status: 'resolved_incorrect' }));
  expect(markup).toContain('LME copper closes above'); // the one incorrect claim
  expect(markup).not.toContain('EURUSD trades 1.14'); // expired claim filtered out of table
  expect(markup).toContain('50%'); // overall board still computed from all claims
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/scoring.test.ts tests/accountability-page.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/scoring"`.

- [ ] **Step 3: Write `src/lib/scoring.ts`**

```ts
export type ScoreBoard = {
  open: number;
  resolved: number;
  correct: number;
  incorrect: number;
  expired: number;
  invalidated: number;
  hitRate: number | null; // null = nothing resolved yet (honest empty state)
};

/** Scoreboard math over claim statuses (Task 6's closed status set). */
export function scoreClaims(rows: { status: string }[]): ScoreBoard {
  const b: ScoreBoard = {
    open: 0,
    resolved: 0,
    correct: 0,
    incorrect: 0,
    expired: 0,
    invalidated: 0,
    hitRate: null,
  };
  for (const r of rows) {
    if (r.status === 'open') b.open += 1;
    else if (r.status === 'resolved_correct') {
      b.correct += 1;
      b.resolved += 1;
    } else if (r.status === 'resolved_incorrect') {
      b.incorrect += 1;
      b.resolved += 1;
    } else if (r.status === 'expired') b.expired += 1;
    else if (r.status === 'invalidated') b.invalidated += 1;
  }
  b.hitRate = b.resolved > 0 ? b.correct / b.resolved : null;
  return b;
}

/** One board per key; a claim contributes to every key it carries. */
export function groupBoards<T extends { status: string }>(
  rows: T[],
  keysOf: (row: T) => string[],
): Map<string, ScoreBoard> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    for (const k of keysOf(r)) {
      const list = groups.get(k) ?? [];
      list.push(r);
      groups.set(k, list);
    }
  }
  return new Map([...groups.entries()].map(([k, list]) => [k, scoreClaims(list)]));
}

/** Quality class = the claim's market_type quality field (spec §3). */
export function qualityClass(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const mt = (payload as Record<string, unknown>).market_type;
    if (typeof mt === 'string' && mt.length > 0) return mt;
  }
  return 'unclassified';
}
```

- [ ] **Step 4: Write `src/lib/queries/accountability.ts`**

```ts
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { claims } from '@/db/schema';

export type ClaimRecord = typeof claims.$inferSelect;

export type ClaimFilters = { kind?: string; status?: string; theme?: string };

export async function getClaims(db: Db, f: ClaimFilters = {}): Promise<ClaimRecord[]> {
  const conds: SQL[] = [];
  if (f.kind) conds.push(eq(claims.kind, f.kind));
  if (f.status) conds.push(eq(claims.status, f.status));
  if (f.theme) conds.push(sql`${f.theme} = any(${claims.themes})`);
  return db
    .select()
    .from(claims)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(claims.openedAt));
}
```

- [ ] **Step 5: Write the components**

`src/components/Scoreboards.tsx`:

```tsx
import type { ScoreBoard } from '@/lib/scoring';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function Board({ title, board }: { title: string; board: ScoreBoard }) {
  return (
    <div className="board">
      <h3>{title}</h3>
      {board.hitRate === null ? (
        <p className="brief-meta">0 resolved — not enough to grade yet.</p>
      ) : (
        <p className="hit-rate">
          {pct(board.hitRate)} <span className="brief-meta">hit rate</span>
        </p>
      )}
      <dl>
        <dt>resolved</dt>
        <dd>{board.resolved}</dd>
        <dt>correct</dt>
        <dd>{board.correct}</dd>
        <dt>incorrect</dt>
        <dd>{board.incorrect}</dd>
        <dt>open</dt>
        <dd>{board.open}</dd>
        <dt>expired</dt>
        <dd>{board.expired}</dd>
        <dt>invalidated</dt>
        <dd>{board.invalidated}</dd>
      </dl>
    </div>
  );
}

export function Scoreboards(props: {
  overall: ScoreBoard;
  perTheme: [string, ScoreBoard][];
  perClass: [string, ScoreBoard][];
}) {
  return (
    <>
      <section>
        <h2>Overall</h2>
        <div className="boards">
          <Board title="All claims" board={props.overall} />
        </div>
      </section>
      {props.perTheme.length > 0 ? (
        <section>
          <h2>By theme</h2>
          <div className="boards">
            {props.perTheme.map(([k, b]) => (
              <Board key={k} title={k} board={b} />
            ))}
          </div>
        </section>
      ) : null}
      {props.perClass.length > 0 ? (
        <section>
          <h2>By quality class</h2>
          <div className="boards">
            {props.perClass.map(([k, b]) => (
              <Board key={k} title={k} board={b} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
```

`src/components/ClaimsTable.tsx`:

```tsx
import type { ClaimFilters, ClaimRecord } from '@/lib/queries/accountability';
import { qualityClass } from '@/lib/scoring';
import { EmptyState } from './EmptyState';

const KINDS = ['smart_money', 'map'];
const STATUSES = ['open', 'resolved_correct', 'resolved_incorrect', 'expired', 'invalidated'];

function payloadStr(payload: unknown, key: string): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/** Filterable claims ledger. Plain GET form — no client JS, house restraint. */
export function ClaimsTable(props: {
  claims: ClaimRecord[];
  filters: ClaimFilters;
  themeOptions: string[];
}) {
  return (
    <>
      <form method="get" action="/accountability" className="filters">
        <label>
          Kind
          <select name="kind" defaultValue={props.filters.kind ?? ''}>
            <option value="">all</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={props.filters.status ?? ''}>
            <option value="">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select name="theme" defaultValue={props.filters.theme ?? ''}>
            <option value="">all</option>
            {props.themeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {props.claims.length === 0 ? (
        <EmptyState>No claims match these filters.</EmptyState>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Predicate</th>
              <th>Kind</th>
              <th>Themes</th>
              <th>Class</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {props.claims.map((c) => (
              <tr key={c.claimId}>
                <td>{c.openedAt}</td>
                <td>
                  {payloadStr(c.payload, 'predicate') || c.claimId}
                  {payloadStr(c.payload, 'data_anchor') ? (
                    <span className="panel-note"> — anchor: {payloadStr(c.payload, 'data_anchor')}</span>
                  ) : null}
                </td>
                <td>{c.kind.replaceAll('_', ' ')}</td>
                <td>{c.themes.join(', ')}</td>
                <td>{qualityClass(c.payload)}</td>
                <td>{c.expiresAt ?? '—'}</td>
                <td className={`status-${c.status}`}>{c.status.replaceAll('_', ' ')}</td>
                <td>
                  {c.resolvedAt
                    ? `${c.resolvedAt}${
                        payloadStr(c.payload, 'resolution_note')
                          ? ` — ${payloadStr(c.payload, 'resolution_note')}`
                          : ''
                      }`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

- [ ] **Step 6: Write `src/app/accountability/page.tsx`**

```tsx
import { ClaimsTable } from '@/components/ClaimsTable';
import { Scoreboards } from '@/components/Scoreboards';
import { getDb } from '@/db/client';
import { getClaims } from '@/lib/queries/accountability';
import { safeQuery } from '@/lib/safe';
import { groupBoards, qualityClass, scoreClaims } from '@/lib/scoring';

// Reads searchParams (filters), so this page renders per-request.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accountability' };

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export default async function AccountabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = { kind: one(sp.kind), status: one(sp.status), theme: one(sp.theme) };
  const db = getDb();
  const all = await safeQuery(() => getClaims(db), []);
  const filtered = await safeQuery(() => getClaims(db, filters), []);
  const perTheme = [...groupBoards(all, (c) => (c.themes.length > 0 ? c.themes : ['unthemed'])).entries()].sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const perClass = [...groupBoards(all, (c) => [qualityClass(c.payload)]).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const themeOptions = [...new Set(all.flatMap((c) => c.themes))].sort();
  return (
    <main className="container-wide">
      <h1>Accountability</h1>
      <p className="brief-meta">
        Every falsifiable claim the system has made, and how it resolved. No memory-holing.
      </p>
      <Scoreboards overall={scoreClaims(all)} perTheme={perTheme} perClass={perClass} />
      <h2>Claims</h2>
      <ClaimsTable claims={filtered} filters={filters} themeOptions={themeOptions} />
    </main>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/scoring.test.ts tests/accountability-page.test.tsx`
Expected: PASS — `Tests  8 passed`.

- [ ] **Step 8: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green; `/accountability` listed as dynamic (ƒ) in the build table.

- [ ] **Step 9: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: accountability — scoreboards and filterable claims ledger"
```

---

### Task 13: Catalysts

Spec §5 `/catalysts`: upcoming forward events with what-would-surprise framing; resolved events shown expectation-vs-outcome.

**Files:**
- Create: `src/lib/queries/catalysts.ts`
- Create: `src/components/CatalystBoard.tsx`
- Create: `src/app/catalysts/page.tsx`
- Test: `tests/catalysts-page.test.tsx`

**Interfaces:**
- Consumes: `forwardEvents` table (Task 2); `EmptyState`, `formatDate`; `seedAll`; `safeQuery`.
- Produces (from `@/lib/queries/catalysts`): `type ForwardEventRow = typeof forwardEvents.$inferSelect`, `getForwardEvents(db): Promise<{ upcoming: ForwardEventRow[]; resolved: ForwardEventRow[] }>`, `catalystFields(payload: unknown): { event: string; expectation: string; surprise: string }`, `resolutionFields(res: unknown): { outcome: string; resolvedAt: string | null; note: string | null }`. Component: `CatalystBoard({ upcoming, resolved })`.

- [ ] **Step 1: Write the failing test**

`tests/catalysts-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getForwardEvents } from '@/lib/queries/catalysts';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: CatalystsPage } = await import('@/app/catalysts/page');

it('splits events on resolution: null = upcoming (soonest first), resolved newest first', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { upcoming, resolved } = await getForwardEvents(db);
  expect(upcoming.map((e) => e.eventId)).toEqual(['fe-2026-07-15-us-cpi', 'fe-2026-07-30-fomc']);
  expect(resolved.map((e) => e.eventId)).toEqual(['fe-2026-07-03-us-payrolls']);
});

it('renders upcoming with surprise framing and resolved as expectation vs outcome', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(await CatalystsPage());
  expect(markup).toContain('US CPI (June)');
  expect(markup).toContain('What would surprise');
  expect(markup).toContain('A 0.4%+ core print');
  expect(markup).toContain('US payrolls (June)');
  expect(markup).toContain('Outcome');
  expect(markup).toContain('+147k with upward revisions');
  expect(markup).toContain('resolved July 5, 2026');
});

it('renders empty states with no events', async () => {
  await createTestDb();
  const markup = renderToStaticMarkup(await CatalystsPage());
  expect(markup).toContain('No upcoming catalysts on the board');
  expect(markup).toContain('Nothing resolved yet');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/catalysts-page.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/queries/catalysts"`.

- [ ] **Step 3: Write `src/lib/queries/catalysts.ts`**

```ts
import { asc } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { forwardEvents } from '@/db/schema';

export type ForwardEventRow = typeof forwardEvents.$inferSelect;

export async function getForwardEvents(
  db: Db,
): Promise<{ upcoming: ForwardEventRow[]; resolved: ForwardEventRow[] }> {
  const rows = await db.select().from(forwardEvents).orderBy(asc(forwardEvents.eventDate));
  return {
    upcoming: rows.filter((r) => r.resolution == null),
    resolved: rows.filter((r) => r.resolution != null).reverse(),
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function catalystFields(payload: unknown): {
  event: string;
  expectation: string;
  surprise: string;
} {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  return { event: str(p.event), expectation: str(p.expectation), surprise: str(p.surprise) };
}

export function resolutionFields(res: unknown): {
  outcome: string;
  resolvedAt: string | null;
  note: string | null;
} {
  const r = (typeof res === 'object' && res !== null ? res : {}) as Record<string, unknown>;
  return {
    outcome: str(r.outcome),
    resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : null,
    note: typeof r.note === 'string' ? r.note : null,
  };
}
```

- [ ] **Step 4: Write `src/components/CatalystBoard.tsx`**

```tsx
import { formatDate } from '@/lib/format';
import {
  catalystFields,
  resolutionFields,
  type ForwardEventRow,
} from '@/lib/queries/catalysts';
import { EmptyState } from './EmptyState';

function Upcoming({ rows }: { rows: ForwardEventRow[] }) {
  if (rows.length === 0) return <EmptyState>No upcoming catalysts on the board.</EmptyState>;
  return (
    <>
      {rows.map((r) => {
        const f = catalystFields(r.payload);
        return (
          <div key={r.eventId} className="catalyst">
            <p className="date">{formatDate(r.eventDate)}</p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expected</h4>
                <p>{f.expectation || '—'}</p>
              </div>
              <div>
                <h4>What would surprise</h4>
                <p>{f.surprise || '—'}</p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Resolved({ rows }: { rows: ForwardEventRow[] }) {
  if (rows.length === 0) return <EmptyState>Nothing resolved yet.</EmptyState>;
  return (
    <>
      {rows.map((r) => {
        const f = catalystFields(r.payload);
        const res = resolutionFields(r.resolution);
        return (
          <div key={r.eventId} className="catalyst">
            <p className="date">
              {formatDate(r.eventDate)}
              {res.resolvedAt ? ` · resolved ${formatDate(res.resolvedAt)}` : ''}
            </p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expectation</h4>
                <p>{f.expectation || '—'}</p>
              </div>
              <div>
                <h4>Outcome</h4>
                <p>
                  {res.outcome || '—'}
                  {res.note ? <span className="panel-note"> — {res.note}</span> : null}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function CatalystBoard(props: { upcoming: ForwardEventRow[]; resolved: ForwardEventRow[] }) {
  return (
    <>
      <section>
        <h2>Upcoming</h2>
        <Upcoming rows={props.upcoming} />
      </section>
      <section>
        <h2>Resolved</h2>
        <Resolved rows={props.resolved} />
      </section>
    </>
  );
}
```

- [ ] **Step 5: Write `src/app/catalysts/page.tsx`**

```tsx
import { CatalystBoard } from '@/components/CatalystBoard';
import { getDb } from '@/db/client';
import { getForwardEvents } from '@/lib/queries/catalysts';
import { safeQuery } from '@/lib/safe';

export const revalidate = 900;
export const metadata = { title: 'Catalysts' };

export default async function CatalystsPage() {
  const { upcoming, resolved } = await safeQuery(() => getForwardEvents(getDb()), {
    upcoming: [],
    resolved: [],
  });
  return (
    <main className="container">
      <h1>Catalyst board</h1>
      <p className="brief-meta">
        Events the system is watching, what it expects, and what would count as a surprise.
        Resolved events show expectation against outcome.
      </p>
      <CatalystBoard upcoming={upcoming} resolved={resolved} />
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/catalysts-page.test.tsx`
Expected: PASS — `Tests  3 passed`.

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: catalyst board — upcoming with surprise framing, resolved expectation-vs-outcome"
```

---

### Task 14: About + full-text search

Spec §5 `/about` (what this is, pipeline → validation → self-grading, Sovereign Signal identity, disclaimer) and `/search` (Postgres full-text across briefs, theme events, claims — the generated tsvector columns from Task 2, queried with `websearch_to_tsquery`).

**Files:**
- Create: `src/app/about/page.tsx`
- Create: `src/lib/queries/search.ts`
- Create: `src/app/search/page.tsx`
- Test: `tests/search.test.tsx`

**Interfaces:**
- Consumes: `briefs`, `themeEvents`, `claims` tables and their `search` tsvector columns (Task 2); `EmptyState`, `formatDate`; `seedAll`; `safeQuery`.
- Produces: `type SearchResult = { type: 'brief' | 'theme-event' | 'claim'; title: string; href: string; snippet: string; date: string }` and `searchAll(db: Db, q: string): Promise<SearchResult[]>` from `@/lib/queries/search`.

- [ ] **Step 1: Write the failing test**

`tests/search.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { searchAll } from '@/lib/queries/search';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: SearchPage } = await import('@/app/search/page');
const { default: AboutPage } = await import('@/app/about/page');

it('finds briefs by words in the html body', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const results = await searchAll(db, 'term premium');
  const brief = results.find((r) => r.type === 'brief');
  expect(brief?.href).toBe('/briefs/2026-07-08');
});

it('finds theme events by evidence and claims by predicate', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const events = (await searchAll(db, 'hawkish minutes')).filter((r) => r.type === 'theme-event');
  expect(events[0]?.href).toBe('/map/rate-path-repricing');
  const claimHits = (await searchAll(db, 'copper')).filter((r) => r.type === 'claim');
  expect(claimHits[0]?.href).toBe('/accountability');
  expect(claimHits[0]?.title).toContain('LME copper');
});

it('returns nothing for an empty or whitespace query', async () => {
  const db = await createTestDb();
  await seedAll(db);
  expect(await searchAll(db, '')).toEqual([]);
  expect(await searchAll(db, '   ')).toEqual([]);
});

it('search page renders results for ?q=', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'auction' }) }),
  );
  expect(markup).toContain('href="/briefs/2026-07-08"');
});

it('search page renders a no-results state', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const markup = renderToStaticMarkup(
    await SearchPage({ searchParams: Promise.resolve({ q: 'zzzznope' }) }),
  );
  expect(markup).toContain('Nothing matched');
});

it('about page explains the system and carries the disclaimer', () => {
  const markup = renderToStaticMarkup(<AboutPage />);
  expect(markup).toContain('Sovereign Signal');
  expect(markup).toContain('deterministic');
  expect(markup).toContain('Not investment advice');
  expect(markup).toContain('href="/accountability"');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/search.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/queries/search"`.

- [ ] **Step 3: Write `src/lib/queries/search.ts`**

```ts
import { desc, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { briefs, claims, themeEvents } from '@/db/schema';

export type SearchResult = {
  type: 'brief' | 'theme-event' | 'claim';
  title: string;
  href: string;
  snippet: string;
  date: string;
};

const LIMIT = 20;

/** Postgres full-text across briefs, theme events, claims (spec §5 /search). */
export async function searchAll(db: Db, q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query === '') return [];

  const briefHits = await db
    .select({ date: briefs.date, subject: briefs.subject, ping: briefs.ping })
    .from(briefs)
    .where(sql`${briefs.search} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(sql`ts_rank(${briefs.search}, websearch_to_tsquery('english', ${query})) desc`)
    .limit(LIMIT);

  const eventHits = await db
    .select({
      eventId: themeEvents.eventId,
      date: themeEvents.date,
      slug: themeEvents.themeSlug,
      direction: themeEvents.direction,
      evidence: themeEvents.evidence,
    })
    .from(themeEvents)
    .where(sql`${themeEvents.search} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(desc(themeEvents.date))
    .limit(LIMIT);

  const claimHits = await db
    .select({
      claimId: claims.claimId,
      openedAt: claims.openedAt,
      payload: claims.payload,
      status: claims.status,
    })
    .from(claims)
    .where(sql`${claims.search} @@ websearch_to_tsquery('english', ${query})`)
    .orderBy(desc(claims.openedAt))
    .limit(LIMIT);

  return [
    ...briefHits.map(
      (b): SearchResult => ({
        type: 'brief',
        title: b.subject,
        href: `/briefs/${b.date}`,
        snippet: b.ping,
        date: b.date,
      }),
    ),
    ...eventHits.map(
      (e): SearchResult => ({
        type: 'theme-event',
        title: `${e.slug} — ${e.direction}`,
        href: `/map/${e.slug}`,
        snippet: e.evidence,
        date: e.date,
      }),
    ),
    ...claimHits.map((c): SearchResult => {
      const predicate = (c.payload as Record<string, unknown>).predicate;
      return {
        type: 'claim',
        title: typeof predicate === 'string' ? predicate : c.claimId,
        href: '/accountability',
        snippet: `status: ${c.status.replaceAll('_', ' ')}`,
        date: c.openedAt,
      };
    }),
  ];
}
```

- [ ] **Step 4: Write `src/app/search/page.tsx`**

```tsx
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { getDb } from '@/db/client';
import { formatDate } from '@/lib/format';
import { searchAll } from '@/lib/queries/search';
import { safeQuery } from '@/lib/safe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const results = q.trim() !== '' ? await safeQuery(() => searchAll(getDb(), q), []) : [];
  return (
    <main className="container">
      <h1>Search</h1>
      <form method="get" action="/search" className="search-form">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="briefs, theme events, claims…"
          aria-label="Search query"
        />
        <button type="submit">Search</button>
      </form>
      {q.trim() === '' ? (
        <p className="brief-meta">Full-text search across every brief, theme event, and claim.</p>
      ) : results.length === 0 ? (
        <EmptyState>Nothing matched “{q}”.</EmptyState>
      ) : (
        <ul className="archive-list">
          {results.map((r, i) => (
            <li key={`${r.type}-${i}`}>
              <span className="badge">{r.type.replaceAll('-', ' ')}</span>{' '}
              <span className="date">{formatDate(r.date)}</span>
              <div>
                <Link href={r.href}>{r.title}</Link>
              </div>
              <p className="excerpt">{r.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Write `src/app/about/page.tsx`**

```tsx
export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <main className="container">
      <h1>About macro.watch</h1>
      <p>
        macro.watch is the public surface of SovsClaw, a Sovereign Signal system: an automated
        macro intelligence pipeline that reads the tape, the news flow, and the prediction
        markets, composes a daily brief, and grades its own calls in public.
      </p>
      <h2>How it works</h2>
      <p>
        <strong>Pipeline.</strong> Every weekday at 14:00 UTC — and Saturdays at 12:00 UTC for the
        weekend review — the pipeline composes a brief from its source ledgers: market data,
        curated feeds, and prediction-market odds. AI does the composition; nothing is
        hand-written.
      </p>
      <p>
        <strong>Validation.</strong> Before anything publishes, deterministic checks validate the
        brief — structure, data anchors, and the claims it makes. A brief that fails validation
        does not ship. This site only receives a brief after its send is verified.
      </p>
      <p>
        <strong>Self-grading.</strong> The system keeps a ledger of falsifiable claims with expiry
        dates and data anchors. When a claim resolves it is graded, and the result is published on
        the <a href="/accountability">accountability page</a> — hits, misses, and all. The{' '}
        <a href="/map">living theme map</a> keeps the longer arcs honest: every raise, lower, and
        retire is on the record with its evidence, linked to the brief that made the call.
      </p>
      <h2>Who is behind it</h2>
      <p>
        SovsClaw is built and operated by Sovereign Signal. The system is AI-composed and
        deterministically validated; a human owns the infrastructure, not the daily output.
      </p>
      <h2>Disclaimer</h2>
      <p>
        Not investment advice. macro.watch is an automated research surface. Nothing here is a
        recommendation to buy or sell any security or asset. The system is sometimes wrong — the
        accountability page exists precisely so you can see how often.
      </p>
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/search.test.tsx`
Expected: PASS — `Tests  6 passed`.

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green; `/about` static, `/search` dynamic in the build table.

- [ ] **Step 8: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: about page and full-text search across briefs, events, claims"
```

---

### Task 15: Railway deploy config, smoke script, end-to-end wiring test

Ship it. Prod start runs migrations before `next start` (idempotent on every boot). `railway.json` pins builder, start command, and a healthcheck on `/` (which renders even with an empty database, thanks to empty states). An in-process e2e test proves the full wiring — ingest route → Postgres → home page render (spec §9's "ingest fixture → page shows it", done against PGlite so CI needs no DB). A standalone smoke script verifies any deployed URL (used for the spec §11 staging validation before DNS cutover).

**Files:**
- Modify: `package.json` (start script only)
- Create: `railway.json`
- Create: `scripts/smoke.mjs`
- Test: `tests/e2e-flow.test.tsx`

**Interfaces:**
- Consumes: ingest routes (Tasks 3–5), `HomePage` (Task 9), fixtures (Task 7), `createTestDb`.
- Produces: the deployable configuration; `node scripts/smoke.mjs <url> [--with-write]` for launch checks.

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e-flow.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { createTestDb } from './helpers/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { POST: postBrief } = await import('@/app/api/ingest/briefs/route');
const { POST: postThemeEvents } = await import('@/app/api/ingest/theme-events/route');
const { POST: postThemeState } = await import('@/app/api/ingest/theme-state/route');
const { POST: postPanels } = await import('@/app/api/ingest/panels/route');
const { default: HomePage } = await import('@/app/page');

const TOKEN = 'e2e-token';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf8'));
}

function post(path_: string, body: unknown): Request {
  return new Request(`http://localhost/api/ingest/${path_}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  process.env.MACRO_WATCH_INGEST_TOKEN = TOKEN;
  await createTestDb();
});

it('ingest fixture -> home page shows it (full wiring)', async () => {
  const briefsFx = fixture('briefs.json') as unknown[];
  for (const b of briefsFx) {
    expect((await postBrief(post('briefs', b))).status).toBe(200);
  }
  expect((await postThemeEvents(post('theme-events', fixture('theme-events.json')))).status).toBe(200);
  expect((await postThemeState(post('theme-state', fixture('theme-state.json')))).status).toBe(200);
  for (const p of fixture('panels.json') as unknown[]) {
    expect((await postPanels(post('panels', p))).status).toBe(200);
  }

  const markup = renderToStaticMarkup(await HomePage());
  expect(markup).toContain('Weekend review: what the map got right about the dollar'); // latest brief
  expect(markup).toContain('6,412.50'); // dashboard panel row
  expect(markup).toContain('Rate-path repricing'); // theme strip
  expect(markup).toContain('href="/map/dollar-downtrend"');
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npx vitest run tests/e2e-flow.test.tsx`
Expected: PASS on a healthy tree — unlike the other tasks, this test exercises only code from Tasks 1–9, and its job is to lock the full wiring (ingest route → Postgres → page render) against regressions. If it FAILS, the failing assertion names the broken seam (a route status or missing markup); fix the seam before proceeding — do not weaken the assertions.

- [ ] **Step 3: Update the prod start script**

In `package.json`, change:

```json
    "start": "next start",
```

to:

```json
    "start": "npm run db:migrate && next start",
```

`drizzle-kit migrate` is idempotent (applies only pending migrations from `drizzle/`); on Railway it reads the injected `DATABASE_URL` via `drizzle.config.ts`.

- [ ] **Step 4: Write `railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 5: Write `scripts/smoke.mjs`**

```js
// Smoke-checks a deployed macro.watch instance.
//   node scripts/smoke.mjs https://<railway-url>            read-only checks
//   node scripts/smoke.mjs https://<railway-url> --with-write
//     also POSTs a clearly-marked sentinel brief (date 1999-01-01) using
//     MACRO_WATCH_INGEST_TOKEN from the environment and verifies it renders.
//     Use --with-write against STAGING only (spec §11 launch check).

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url> [--with-write]');
  process.exit(1);
}

let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

await check('GET / renders with the byline', async () => {
  const res = await fetch(`${base}/`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const text = await res.text();
  if (!text.includes('a Sovereign Signal system')) throw new Error('byline missing');
  if (!text.includes('Not investment advice')) throw new Error('disclaimer missing');
});

await check('GET /feed.xml is RSS', async () => {
  const res = await fetch(`${base}/feed.xml`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const text = await res.text();
  if (!text.includes('<rss version="2.0">')) throw new Error('not an RSS document');
});

await check('GET /map, /accountability, /catalysts, /about, /search all 200', async () => {
  for (const p of ['/map', '/accountability', '/catalysts', '/about', '/search']) {
    const res = await fetch(`${base}${p}`);
    if (res.status !== 200) throw new Error(`${p} -> ${res.status}`);
  }
});

await check('ingest rejects a missing token with 401', async () => {
  const res = await fetch(`${base}/api/ingest/briefs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

if (process.argv.includes('--with-write')) {
  const token = process.env.MACRO_WATCH_INGEST_TOKEN;
  if (!token) {
    console.error('FAIL  --with-write requires MACRO_WATCH_INGEST_TOKEN in the environment');
    process.exit(1);
  }
  const sentinel = {
    date: '1999-01-01',
    kind: 'daily',
    subject: 'Smoke test brief (sentinel — not market content)',
    telegram_ping: 'Smoke test sentinel.',
    html: '<p>Smoke test sentinel published by scripts/smoke.mjs.</p>',
    sent_verified_at: '1999-01-01T14:00:00Z',
  };
  await check('ingest accepts a sentinel brief and the permalink renders it', async () => {
    const res = await fetch(`${base}/api/ingest/briefs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(sentinel),
    });
    if (res.status !== 200) throw new Error(`ingest -> ${res.status}`);
    const page = await fetch(`${base}/briefs/1999-01-01`);
    if (page.status !== 200) throw new Error(`permalink -> ${page.status}`);
    const text = await page.text();
    if (!text.includes('Smoke test brief (sentinel')) throw new Error('sentinel not rendered');
  });
}

console.log(failures === 0 ? 'smoke passed' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green — full suite passing (every test file from Tasks 1–15), build route table lists `/`, `/about`, `/accountability`, `/briefs`, `/briefs/[date]`, `/catalysts`, `/feed.xml`, `/map`, `/map/[theme]`, `/search`, and the six `/api/ingest/*` routes.

Optional local proof (requires a real `DATABASE_URL` in `.env`): `npm run db:migrate && npm run seed && npm run dev`, then in another shell `node scripts/smoke.mjs http://localhost:3000` — expected final line `smoke passed`.

- [ ] **Step 7: Commit**

```bash
cd ~/repos/macro-watch
git add -A
git commit -m "feat: railway deploy config, migrate-on-start, smoke script, e2e wiring test"
```

- [ ] **Step 8: Operator checklist (manual — requires Railway/DNS access; not for the executing subagent)**

Recorded here from spec §10–§11 and §13 so nothing is lost at handoff:

1. Generate the ingest token: `openssl rand -hex 32`. Set `MACRO_WATCH_INGEST_TOKEN` and `SITE_URL=https://macro.watch` on the Railway web service (`DATABASE_URL` comes from the Postgres reference). The same token also goes to pipeline-host's `.env.secrets` as `MACRO_WATCH_INGEST_TOKEN` alongside `MACRO_WATCH_INGEST_URL`.
2. Push main (orchestrator) → Railway deploys. Verify with the house railway-ops practice (authenticated CLI, not MCP).
3. Run `node scripts/smoke.mjs https://<railway-url>` against the Railway URL; then seed real backfill via the sovs-macro publisher (32+ theme events, both claim ledgers, forward events, staged brief HTML — spec §11 step 3).
4. Staging validation: one real publish cycle end-to-end (`--with-write` sentinel is acceptable ahead of it), then point `macro.watch` DNS at the Railway custom domain and update `SITE_URL`.

---

## Spec coverage

Self-review map from spec section to task (gaps: none found):

| Spec requirement | Task(s) |
|---|---|
| §1 public/free, no auth on pages; DB+ingest leaves room for accounts later | 1, 3 (auth only on ingest) |
| §1 liveness: brief-cadence + ~15-min panels | 3–5 (revalidation), 8 (UpdatedAgo), 9 |
| §1/§13 identity, byline, disclaimer, text-mark v1 | 8, 14 |
| §2 push-only boundary, bearer token | 3 |
| §3 six endpoints, natural keys, zod, `{ok, upserted, revalidated}` | 3, 4, 5, 6 |
| §3 sanitization is publisher-side (site renders trusted HTML) | Global Constraint 4, 9 (BriefArticle comment) |
| §4 all seven tables + jsonb payloads + full-text tsvector columns | 2 |
| §4 scope amendment: DB = readable projection; ingest is the only write path; reconstructable by re-publish | 2 (schema), 3–6 (idempotent upserts), Global Constraint 4 |
| §5 `/` full brief + dashboard panel + theme strip + archive/RSS footer | 9 |
| §5 `/briefs`, `/briefs/[date]`, weekend labels | 10 |
| §5 `/map`, `/map/[theme]` — grid, timeline linked to source briefs, related claims, conviction-over-time | 11 |
| §5 `/accountability` — three scoreboards + filterable table + honest empty state | 12 |
| §5 `/catalysts` — surprise framing, expectation-vs-outcome | 13 |
| §5 `/about`, `/search`, `/feed.xml` | 14, 10 |
| §6 on-demand revalidation, freshness badges, ISR fallback | 3–6 (handlers), 8, 9–14 (`revalidate = 900`), 10 (permalink stale-on-error) |
| §7 422 with reasons, 401, retry-safe upserts, empty states everywhere | 3–6, 8–14 |
| §7 publisher-side retry queue / alerting | Out of scope here: sovs-macro repo (spec §11 step 2) — noted in Task 15 checklist |
| §8 design language | 8 (single hand-set sheet), 11 (hand-set SVG chart) |
| §9 site tests: zod, ingest idempotency+auth, page renders with fixtures, e2e smoke | 3–6, 7, 9–14, 15 |
| §9 publisher tests + launch check | sovs-macro repo; staging smoke covered by Task 15 |
| §10 Railway config, envs, CLI-not-MCP ops | 15 |
| §11 launch & backfill sequence | 7 (fixtures), 15 Step 8 |
| §12 non-goals | Nothing built beyond v1 scope (no accounts, comments, streaming, OG images, email, admin UI) |
| §13 open items (DNS, token provisioning, mark) | 15 Step 8, 8 (text-mark) |

**Resolved ambiguities** (decisions an executor should not reopen):
- §3 says briefs key is `date + kind`, §4 says `date` pk — followed §4 (one brief per day; `kind` is an attribute).
- Claim statuses fixed as `open|resolved_correct|resolved_incorrect|expired|invalidated`; quality class = `market_type`. The publisher maps to this contract.
- Panel payload rendering contract: `payload.rows: [{label, value, change?, note?}]`, extracted defensively (`panel-contract.ts`); unknown shapes degrade to an empty panel.
- Theme lifecycle status is derived from the newest event's direction (candidate→candidate, retire/invalidate→retired, raise/lower/hold→active), never regressed by out-of-order backfill.
- §9's "one e2e smoke in CI" runs in-process against PGlite (ingest route → page render) because CI has no database service by design; the deployed-URL smoke script covers the launch check instead.
- Scoreboards compute from the claims ledger (single source of truth); `scoreboard` panel snapshots are stored but not rendered in v1.



