# macro.watch

**Live:** https://web-production-cb2e81.up.railway.app

macro.watch is SovsClaw's public face — a Sovereign Signal system. It publishes the
sovs-macro pipeline's output as a free, public, self-grading macro-intelligence site: the
daily/weekend brief, a living theme map with full history, an accountability scoreboard
that grades the system's own claims (honest denominator, no vanity stats), and a
forward-looking catalyst board. Nothing on the site is hand-edited — every page renders
from data pushed here by the upstream pipeline. See `docs/specs/2026-07-11-macro-watch-design.md`
for the full design spec this repo implements.

## Architecture

Push-only ingest from the pipeline, a Postgres projection, and server-rendered pages.
Railway never reaches back into the pipeline host — the arrow only goes one way.

```
sovsclaw (pipeline host)                       Railway project: macro-watch
┌───────────────────────────────┐             ┌────────────────────────────────┐
│ run_email_cron_job.py         │   HTTPS     │  Next.js app (SSR + ISR)        │
│  └─ post-Sent-verification ───┼──POST──────▶│   /api/ingest/* (bearer auth)   │
│ site_publish.py (15-min cron) │             │   pages render from Postgres    │
│  └─ panels/ledgers/events ────┼──POST──────▶│   revalidatePath() on ingest    │
│ local retry queue (fail-soft) │             │                                  │
└───────────────────────────────┘             │  Railway Postgres (projection)  │
        push-only, one-directional             └────────────────────────────────┘
```

The pipeline stays file-canonical (`SOVS_STATE_ROOT` on sovsclaw); this Postgres database
is a one-way, reconstructable projection of it, fed only through the ingest API. If the
projection were dropped, re-publishing from pipeline state would rebuild it.

## Page map

| Route | What renders |
|---|---|
| `/` | Today's brief in full, the dashboard panel, a compact theme-map strip |
| `/briefs`, `/briefs/[date]` | Brief archive with permalinks (daily + weekend) |
| `/map`, `/map/[theme]` | The living theme map (see below) + per-theme event timeline, related claims, conviction-over-time |
| `/accountability` | Self-grading scoreboards (overall, per-theme, per-quality-class) + filterable claims table |
| `/catalysts` | Upcoming forward events (what-would-surprise framing) and resolved events (expectation vs. outcome) |
| `/search` | Postgres full-text search across briefs, theme events, and claims |
| `/feed.xml` | RSS feed of briefs |
| `/about` | What SovsClaw is and how it works, plus the disclaimer |

`/map` is the flagship view: a field where each theme is placed by conviction band
(y-axis) and 30-day directional pressure (x-axis) — see `docs/architecture.md` for the
exact position math.

## Local development

```
npm install
npm test        # runs on an in-memory PGlite Postgres — no database needed
npm run dev      # needs DATABASE_URL to show real data; without it, pages render
                  # their empty states (both are valid ways to work locally)
```

Tests spin up a fresh PGlite instance per suite (`tests/helpers/db.ts`), migrate it with
the Drizzle migrations in `drizzle/`, and swap it in as the app's database — no external
Postgres, no `DATABASE_URL`, no network. `npm run dev` talks to whatever `DATABASE_URL`
you set in `.env` (copy `.env.example`); every page query is wrapped in `safeQuery`
(`src/lib/safe.ts`), so a missing or unreachable database degrades to the page's explicit
empty state rather than crashing — this is also what lets `next build` prerender in CI
with no database reachable.

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:generate` /
`npm run db:migrate` (Drizzle), `npm run seed` (`scripts/seed.ts`, fixture data for local
exploration).

## Data contract

Six ingest endpoints, all `POST /api/ingest/<kind>`, all `Authorization: Bearer <token>`
(`MACRO_WATCH_INGEST_TOKEN`), all zod-validated JSON, all **idempotent upserts on a
natural key** — the pipeline can safely retry any POST. Each returns
`{ok, upserted, revalidated}`; a successful upsert triggers on-demand
`revalidatePath()` for the routes it affects, so pages update within seconds of a
publish.

| Endpoint | Natural key |
|---|---|
| `briefs` | `date` |
| `theme-events` | `event_id` |
| `theme-state` | latest snapshot (full `theme-state.json` payload) |
| `panels` | `kind + taken_at` |
| `claims` | `claim_id` |
| `forward-events` | `event_id` |

Full contract, payload shapes, and schema: `docs/specs/2026-07-11-macro-watch-design.md`
(§3–§4) and `docs/architecture.md`.

## Design system

- **Type:** Fraunces (display/headings, self-hosted via `next/font/google`) + Georgia/Times
  serif (body) + IBM Plex Mono (everything that is data — dates, figures, status chips).
  No Tailwind anywhere in this repo; layout and tokens live in plain CSS.
- **Tokens:** all color, spacing, and status-mark values are CSS custom properties in
  `src/app/globals.css` — bone/ink base palette, a venom-amber accent, and separate
  up/down/hold tokens reserved for direction and grading semantics (never used as
  decoration).
- **Themes:** light and dark are both first-class (`prefers-color-scheme`); the
  status-mark palette is independently contrast-validated per theme (see the comments in
  `globals.css` next to `--mark-*`).
- **Rendering:** server components throughout — only one client component in the whole
  tree (`UpdatedAgo.tsx`, which needs `Date.now()` for a ticking "updated Nm ago" badge).
  Charts and diagrams (the field map, sparklines, conviction gauges) are hand-written
  inline SVG, not a charting library.
- **Status glyphs:** claim status is always glyph + color together, never color alone —
  `pending ○ · hit ◆ · miss ✕ · partial ◐ · expired — · judgment-required ? · void ∅`
  (`src/components/StatusMark.tsx`).
- **Mark:** the favicon and masthead lockup are a geometric scorpion, not a text
  placeholder (`src/app/icon.svg`, `src/app/apple-icon.png`, `src/components/Mark.tsx`).
  Its raised tail is a chain of the site's ◆ conviction diamonds ending in one lit-amber
  stinger; the body renders via `currentColor` so it flips with the theme. `Mark.tsx` is
  a server component, `aria-hidden`; the accessible name lives on the home link that
  wraps it (`src/app/layout.tsx`).

## Deploy

Railway project `macro-watch`: one Next.js web service + Railway Postgres. Deploy is
push-to-main triggered on Railway's side; to push a build manually, use the Railway CLI
(`railway up`) per house practice — not the Railway MCP tools, which are unreliable here.
`npm run start` runs `db:migrate` before `next start`, so every deploy migrates the
database on boot. Railway's own healthcheck hits `GET /api/health`
(`src/app/api/health/route.ts`, `railway.json`'s `healthcheckPath`) — a dependency-free
liveness check (`{ok: true, service: 'macro-watch'}`, `force-dynamic`) that doesn't touch
Postgres, so a deploy isn't gated on the database being reachable. After a deploy,
`node scripts/smoke.mjs <url>` runs read-only checks
against the live site (add `--with-write` against staging only, to verify the ingest
round-trip with a clearly-marked sentinel brief that is excluded from all public
listings — see `docs/architecture.md`).

## Contributing

**Read [`OWNERS.md`](./OWNERS.md) first** — it's the collaboration model (who owns what,
the ingest-contract rule, how a change lands). Trunk-based: work lands on `main`. The repo
is private on the free tier, so branch protection isn't available — PR-and-review is by
agreement between the maintainers, and the safety net is that push ≠ deploy (deploys are a
manual `railway up`). Treat `main` as the thing that's always deployable. Before
merging anything, `npm run typecheck`, `npm test`, and `npm run build` must all pass (this
is also CI, see `.github/workflows/ci.yml`). `.superpowers/` is orchestration scratch
(agent task briefs, review diffs, progress notes) — it's checked in for provenance but is
not project documentation; ignore it when getting oriented.
