# macro.watch — Design Spec

- **Date:** 2026-07-11
- **Status:** approved in discussion (Sov + M5); pending final review of this document
- **Repos:** new `SovereignSignal/macro-watch` (the site) + publisher additions to `sovs-macro` (M5 lane)
- **Hosting:** Railway (Sov-confirmed) — one project: Next.js web service + Railway Postgres. Deploy = push to main, same discipline as the pipeline.

## 1. Product decisions (settled in brainstorm)

- **Audience: fully public, free.** A distribution/reputation surface for the macro intelligence system. No auth, no paywall in v1; the architecture (DB + ingest API) leaves room for accounts/premium later without rework.
- **Liveness: brief-cadence + fresh panels.** The site updates the moment a brief publishes (daily 14:00 UTC Mon–Fri, weekend Sat 12:00), and data panels refresh every ~15 min from the pipeline's existing caches. No new data collection, no streaming.
- **Surfaces (all four in v1):** the Brief (latest + archive), the Living Theme Map (with longitudinal history), Accountability, and the Catalyst board — plus About, RSS, and full-text search.
- **Identity: Sovereign Signal branded.** "SovsClaw — a Sovereign Signal system." The About page explains the system (AI-composed, deterministically validated, self-grading), not a person. Standard not-investment-advice disclaimer.

## 2. Architecture

```
pipeline-host (pipeline)                          Railway project: sovs-macro-site
┌──────────────────────────────┐             ┌──────────────────────────────┐
│ run_email_cron_job           │   HTTPS     │  Next.js app (SSR + ISR)     │
│  └─ post-Sent-verification ──┼──POST──────▶│   /api/ingest/* (bearer)     │
│ site_publish.py (15-min cron)│             │   pages render from Postgres │
│  └─ panels/ledgers/events ───┼──POST──────▶│                              │
│ local retry queue (fail-soft)│             │  Railway Postgres            │
└──────────────────────────────┘             └──────────────────────────────┘
        push-only, one-directional: Railway never reaches into pipeline-host
```

- **Push-only boundary.** The publisher POSTs; the site never pulls. A bearer token
  (`MACRO_WATCH_INGEST_TOKEN`, in pipeline-host's `.env.secrets` and Railway env) guards ingest.
- **Site can't hurt the pipeline.** Publisher failures are alert-only (alerting seam) with a
  local retry queue — unpublished artifacts ship on the next tick.

## 3. Data contract (ingest API)

All endpoints: `POST /api/ingest/<kind>`, `Authorization: Bearer <token>`, JSON body,
zod-validated, **idempotent upsert on natural keys**. Responses: `{ok, upserted, revalidated}`.

| Endpoint | Natural key | Payload (core fields) |
|---|---|---|
| `briefs` | `date + kind` | `date, kind(daily\|weekend), subject, telegram_ping, html` (sanitized), `sent_verified_at` |
| `theme-events` | `event_id` | the reducer's event shape: `event_id, date, theme_slug, theme_name, direction(raise\|lower\|hold\|candidate\|invalidate\|retire), evidence, trigger_state, next_check, source(daily\|weekly)` |
| `theme-state` | snapshot | full `theme-state.json` payload + curated-map fields (conviction, current read, raise/lower conditions, live triggers) |
| `panels` | `kind + taken_at` | `kind(dashboard\|odds_lens\|scoreboard), taken_at, payload` (jsonb passthrough of the existing cache shapes) |
| `claims` | `claim_id` | both ledgers: id, kind(smart_money\|map), themes[], predicate, data_anchor, quality fields (market_type + observable/narrative/geo scores), opened_at, expires_at, status, resolution fields |
| `forward-events` | `event_id` | the forward-event ledger shape: event, date, expectation, surprise framing, resolution when reconciled |

**Sanitization (publisher-side, before POST):** strip `notion.so`/`app.notion.com` links and
any internal paths; verify no recipient addresses; briefs are already book-agnostic. A
sanitizer unit test pins each rule.

## 4. Database schema (Postgres, Drizzle ORM)

**Scope amendment (Sov, 2026-07-11): this Postgres is the sovs-macro system's
queryable projection, not just the site's store.** Any sovs-macro consumer
(analytics, future graders, other services in the Railway project) may READ it.
Two invariants keep that safe: (1) the pipeline on pipeline-host remains
**file-canonical** (`SOVS_STATE_ROOT`) and never reads the DB on any critical
path — the DB is a one-way projection fed by the publisher; (2) the ingest API
stays the only write path, so the projection is always reconstructable by
re-publishing from pipeline state.

- `briefs(date pk, kind, subject, ping, html, sent_verified_at, ingested_at)`
- `themes(slug pk, name, status active|candidate|retired, first_seen, last_event_at)`
- `theme_events(event_id pk, date, theme_slug fk, direction, evidence, trigger_state, next_check, source)`
- `theme_state(id pk, taken_at, payload jsonb)` — latest row renders `/map`; history kept
- `panel_snapshots(id pk, kind, taken_at, payload jsonb)` — time-series (sparklines later, free)
- `claims(claim_id pk, kind, themes text[], payload jsonb, status, opened_at, expires_at, resolved_at)`
- `forward_events(event_id pk, event_date, payload jsonb, resolution jsonb null)`
- Full-text: generated tsvector over briefs.html(text-stripped), theme_events.evidence, claims payload.

## 5. Pages

- `/` — today's brief rendered in full (including injected lens + deep research), dashboard
  panel, compact theme-map strip, footer to archive/RSS.
- `/briefs`, `/briefs/[date]` — archive with permalinks; weekend reviews labeled.
- `/map`, `/map/[theme]` — the flagship. Grid of themes (conviction, one-line read, trigger
  states, lifecycle badge). Per-theme page: current card + **full event timeline** (every
  raise/lower/candidate/retire since birth, each linked to its source brief) + related
  claims + a conviction-over-time visual.
- `/accountability` — coverage and method orientation, separate smart-money and map-derived
  scoreboards, upcoming decisions, qualitative review, claim history, and a source-linked
  public ledger. Headline rates stay hidden until each track has eight final decisions.
- `/catalysts` — upcoming forward events with what-would-surprise framing; resolved events
  shown expectation-vs-outcome.
- `/about` — what this is, how it works (pipeline → validation → external outcome grading), Sovereign
  Signal identity, disclaimer.
- `/search` — Postgres full-text across briefs, theme events, claims.
- `/feed.xml` — RSS of briefs (title = subject, body = ping + link).

## 6. Freshness & caching

- Ingest handlers call Next.js on-demand revalidation for affected routes — pages update
  seconds after a publish.
- Panel-driven components carry "updated Nm ago" badges from `taken_at`.
- ISR fallback: if Postgres is briefly unavailable, previously rendered pages keep serving.

## 7. Error handling

- **Publisher (sovs-macro):** never blocks or fails the pipeline. On POST failure: artifact
  written to a local queue dir (`memory/site-publish-queue/`), retried each 15-min tick,
  alert via the alerting seam after sustained failure (>2h). Brief publishing runs strictly
  after Sent verification — a failed send never publishes.
- **Ingest:** schema-invalid payloads → 422 with reasons (publisher logs + alerts; never
  retries a 422 blindly). Token mismatch → 401. Upserts make retries safe.
- **Site:** every panel/page has an explicit empty/stale state; no data ≠ broken page.

## 8. Design language

The brief's identity, extended: Georgia serif body, restrained sharp-market-note layout,
generous whitespace, light + dark themes, scorpion mark + "a Sovereign Signal system"
byline. Charts (conviction timelines, sparklines) follow the dataviz house method at
implementation time. No app-dashboard aesthetics.

## 9. Testing

- **Publisher:** unit tests in sovs-macro (sanitizer rules, payload builders, queue/retry,
  idempotent re-publish) — same suite/venv as the pipeline.
- **Site:** zod schema tests; ingest handler tests (idempotency, auth); page render tests
  with fixture data; one e2e smoke in CI (ingest fixture → page shows it).
- **Launch check:** publish a real brief end-to-end to a staging URL before DNS cutover.

## 10. Ops

- Railway project `sovs-macro-site` (`production` environment): `macro-watch` service
  (Next.js, deploys from Railway's GitHub source on `main`) + Railway Postgres.
  Env: `DATABASE_URL` (reference variable to the Postgres service's private-network
  `DATABASE_URL`), `MACRO_WATCH_INGEST_TOKEN`, `SITE_URL`.
- pipeline-host env additions (`.env.secrets`): `MACRO_WATCH_INGEST_URL`, `MACRO_WATCH_INGEST_TOKEN`.
- Domain: `macro.watch` → Railway custom domain (Sov owns DNS).
- Railway operations via the authenticated CLI (per house railway-ops practice), not MCP.

## 11. Launch & backfill

1. Ship site + ingest with fixture data; deploy to Railway URL.
2. Land the publisher in sovs-macro (coordinated edit — send-path hook touches
   `run_email_cron_job.py`).
3. Backfill: 32+ theme events, both claim ledgers, forward events, available staged brief
   HTML; archive grows organically from launch.
4. Staging validation with one real publish cycle → DNS cutover to macro.watch.

## 12. Non-goals (v1)

No accounts, no premium/paywall, no comments, no true real-time streaming, no OG-image
generation, no email signup (RSS only), no admin UI (ingest is the only write path).

## 13. Open items

- `macro.watch` DNS access + Railway custom-domain setup (Sov).
- `MACRO_WATCH_INGEST_TOKEN` provisioning (generate at implementation; store in Railway env
  + pipeline-host `.env.secrets`).
- Scorpion/Sovereign Signal mark assets for the site header (Sov to supply or approve a
  simple text-mark for v1).
