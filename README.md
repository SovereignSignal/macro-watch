# Sovs Macro

**Live:** https://macro-watch-production.up.railway.app

Sovs Macro is a Sovereign Signal project. It publishes the
sovs-macro pipeline's output as a macro-intelligence site. The daily/weekend
brief, a living theme map with full history, and a forward-looking catalyst board are
public reading material. A graded call record, which grades eligible market
claims against external outcomes, is for members while it builds a track record.
Nothing on the site is hand-edited: every page renders
from data pushed here by the upstream pipeline. See `docs/specs/2026-07-11-macro-watch-design.md`
for the full design spec this repo implements.

## Architecture

Push-only ingest from the pipeline, a Postgres projection, and server-rendered pages.
Railway never reaches back into the pipeline host; the arrow only goes one way.

```
pipeline-host (pipeline host)                       Railway project: sovs-macro-site
┌───────────────────────────────┐             ┌────────────────────────────────┐
│ run_email_cron_job.py         │   HTTPS     │  Next.js app (dynamic SSR)      │
│  └─ post-Sent-verification ───┼──POST──────▶│   /api/ingest/* (bearer auth)   │
│ site_publish.py (15-min cron) │             │   pages render from Postgres    │
│  └─ panels/ledgers/events ────┼──POST──────▶│   revalidatePath() on ingest    │
│ local retry queue (fail-soft) │             │                                  │
└───────────────────────────────┘             │  Railway Postgres (projection)  │
        push-only, one-directional             └────────────────────────────────┘
```

The pipeline stays file-canonical (`SOVS_STATE_ROOT` on pipeline-host); this Postgres database
is a one-way, reconstructable projection of it, fed only through the ingest API. If the
projection were dropped, re-publishing from pipeline state would rebuild it.

## Page map

| Route | What renders |
|---|---|
| `/` | Today's brief in full, the dashboard panel, track-record summary, Kalshi movers, a compact theme-map strip |
| `/briefs`, `/briefs/[date]`, `/briefs/[date]/[kind]` | Brief archive with permalinks (`daily`, `weekend`, `week-ahead`) |
| `/map`, `/map/[theme]` | The living theme map (see below) + per-theme event timeline, related claims, conviction-over-time |
| `/track-record` | Members only. Sovs Macro's own calls: hit rate, Brier, recent resolutions, open calls |
| `/accountability` | Members only. Method and coverage, track-specific performance, upcoming decisions, qualitative review, and a source-linked call ledger |
| `/catalysts` | Upcoming forward events (what-would-surprise framing) and resolved events (expectation vs. outcome) |
| `/research`, `/research/[date]` | Daily decision-research memos |
| `/search` | Postgres full-text search across briefs, theme events, claims, and research |
| `/feed.xml` | RSS feed of briefs |
| `/about` | What Sovs Macro is, the methodology, the sources policy, and the disclaimer |
| `/sitemap.xml`, `/robots.txt` | Public URL list and crawler rules |

`/map` is the flagship view: a field where each theme is placed by conviction band
(y-axis) and 30-day directional pressure (x-axis); see `docs/architecture.md` for the
exact position math.

## Local development

```
npm install
npm test        # runs on an in-memory PGlite Postgres, no database needed
npm run dev      # needs DATABASE_URL to show real data; without it, pages render
                  # their empty states (both are valid ways to work locally)
```

Tests spin up a fresh PGlite instance per suite (`tests/helpers/db.ts`), migrate it with
the Drizzle migrations in `drizzle/`, and swap it in as the app's database: no external
Postgres, no `DATABASE_URL`, no network. `npm run dev` talks to whatever `DATABASE_URL`
you set in `.env` (copy `.env.example`); every page query is wrapped in `safeQuery`
(`src/lib/safe.ts`), so a missing or unreachable database degrades to the page's explicit
empty state rather than crashing. This is also what lets `next build` prerender in CI
with no database reachable.

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:generate` /
`npm run db:migrate` (Drizzle), `npm run seed` (`scripts/seed.ts`, fixture data for local
exploration).

## Data contract

Six ingest endpoints, all `POST /api/ingest/<kind>`, all `Authorization: Bearer <token>`
(`MACRO_WATCH_INGEST_TOKEN`), all zod-validated JSON, all **idempotent upserts on a
natural key**, so the pipeline can safely retry any POST. Each returns
`{ok, upserted, revalidated}`; a successful upsert triggers on-demand
`revalidatePath()` for the routes it affects, so pages update within seconds of a
publish.

| Endpoint | Natural key |
|---|---|
| `briefs` | `date` |
| `theme-events` | `event_id` |
| `theme-state` | latest snapshot (full `theme-state.json` payload) |
| `panels` | `kind + taken_at`. On the scoreboard payload, optional `updated_at`, `scoreboard`, and `kalshi_movers` sit beside `rows`. Dashboard and odds_lens payloads may also carry `updated_at` |
| `claims` | `claim_id` |
| `forward-events` | `event_id` |

Full contract, payload shapes, and schema: `docs/specs/2026-07-11-macro-watch-design.md`
(§3 to §4) and `docs/architecture.md`.

**Ordering on an empty database:** the pipeline must send `theme-state` before any
`measured` theme events. A measured event can only attach to a theme that already exists,
or one it can take from the latest canonical theme snapshot. Otherwise ingest returns 500
`Measured event awaits a canonical theme snapshot`. When backfilling a fresh database,
publish theme state first, then theme events.

## Design system

- **House style:** Sovs Macro follows the Sovereign Signal house style. The shared
  tokens and fonts are copied unedited from the Sovereign Signal brand kit into
  `src/styles/brand/` (`tokens.css` v1.0.0, `fonts/fonts.css` plus the woff2 files and
  their OFL licences). Keep line 1 of `tokens.css` intact: the brand kit's `check.mjs`
  reads it to report drift. Never edit the copies; site-specific tokens go in the
  personality block at the top of `src/app/globals.css`.
- **Type:** Newsreader (headings and reading text), Instrument Sans capitals (navigation
  and labels) and IBM Plex Mono (data only: figures, dates, tickers). All three are
  self-hosted from `src/styles/brand/fonts/`, so no font request leaves the site. No
  Tailwind anywhere in this repo; layout lives in plain CSS.
- **Tokens:** the shared palette (`--paper`, `--ink`, `--ink-2`, `--ink-3`, `--rule`,
  `--rust`) comes from `tokens.css` and is never redefined here. `src/app/globals.css`
  opens with Sovs Macro's personality block: up/down/hold and the `--mark-*` status set,
  reserved for direction and grading semantics (never decoration).
- **Rust:** one thing per screen, the diamond beside the masthead's Updated stamp. Links
  are ink with a 1px underline and turn rust on hover; data marks (conviction diamonds,
  sparklines, the field) are ink.
- **Structure:** hairline rules instead of boxes. The masthead ends with the double rule
  from the Sovereign Signal logo, and its sub-line carries the endorsement line (small
  🦂 scorpion plus "A Sovereign Signal project", `src/components/Endorsement.tsx`).
- **Themes:** light and dark are both first-class. The page follows the visitor's system
  setting (`prefers-color-scheme`); the masthead toggle pins either with `data-theme` on
  `<html>` and remembers it in `localStorage` under `theme`, the same attribute and key as
  sovereignsignal.com. The status-mark palette is independently contrast-validated per
  theme (see the comments in `globals.css` next to `--mark-*`).
- **Rendering:** server components throughout. Two client components in the whole tree:
  `UpdatedAgo.tsx`, which needs `Date.now()` for a ticking "updated Nm ago" stamp, and
  `SiteNav.tsx`, which reads the current path to mark the current page.
  Charts and diagrams (the field map, sparklines, conviction gauges) are hand-written
  inline SVG, not a charting library.
- **Status glyphs:** claim status is always glyph + color together, never color alone:
  `pending ○ · hit ◆ · miss ✕ · partial ◐ · expired (a short bar) · judgment-required ? · void ∅`
  (`src/components/StatusMark.tsx`).
- **Mark:** the 🦂 scorpion emoji, the Sovs Macro mark, in the masthead lockup
  (`src/components/Mark.tsx`) and as the favicon (`src/app/icon.svg`, an emoji SVG). A
  hand-drawn scorpion was tried and dropped (it read as a blob at small sizes); the emoji
  is cleaner and unmistakable. `Mark.tsx` is a server component, `aria-hidden`; the
  accessible name lives on the home link that wraps it (`src/app/layout.tsx`).

## Deploy

Railway project `sovs-macro-site`, `production` environment:

- **`macro-watch`**: this repo's Next.js service, live at
  https://macro-watch-production.up.railway.app.
- **Postgres**: a Railway Postgres service in the same project.

Variables on the `macro-watch` service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Railway reference variable pointing at the Postgres service's `DATABASE_URL` (private-network URL) |
| `MACRO_WATCH_INGEST_TOKEN` | Shared secret with the sovs-macro pipeline publisher (bearer token for `/api/ingest/*`) |
| `SITE_URL` | Public origin for RSS, metadata, and canonical links: `https://macro-watch-production.up.railway.app` |

Deploys come from Railway's GitHub source on `main`, so treat a merge to `main` as a
deploy. CI (`.github/workflows/ci.yml`: typecheck, test, build) must be green before
merge. `railway up` remains available only as a manual hotfix path (not the Railway MCP
tools, which are unreliable here).
`npm run start` runs `db:migrate` (`scripts/migrate.mjs`) before `next start`, so every
deploy migrates the database on boot. Railway's own healthcheck hits `GET /api/health`
(`src/app/api/health/route.ts`, `railway.json`'s `healthcheckPath`), a readiness
check (`{ok, ready, service, database}`, `force-dynamic`) that probes Postgres. After a deploy,
`node scripts/smoke.mjs <url>` runs read-only checks
against the live site (add `--with-write` against staging only, to verify the ingest
round-trip with a clearly-marked sentinel brief that is excluded from all public
listings; see `docs/architecture.md`).

## Contributing

**Read [`OWNERS.md`](./OWNERS.md) first**. It's the collaboration model (who owns what,
the ingest-contract rule, how a change lands). Trunk-based: work lands on `main`. The repo
is private on the free tier, so branch protection isn't available, so PR-and-review is by
agreement between the maintainers. Railway deploys from `main`, so `main` must always be
deployable: before merging anything, `npm run typecheck`, `npm test`, and
`npm run build` must all pass (this is also CI, see `.github/workflows/ci.yml`).
`.superpowers/` is orchestration scratch (agent task briefs, review diffs, progress notes).
It's checked in for provenance but is not project documentation; ignore it when getting
oriented.
