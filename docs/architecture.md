# Architecture

Deeper reference for the ingest → projection → render pipeline this repo implements. Start
with the [README](../README.md) for orientation and the
[design spec](specs/2026-07-11-macro-watch-design.md) for the product decisions; this
document is about how the code actually does it.

## Schema and natural keys

Drizzle schema: `src/db/schema.ts`. Every ingest endpoint upserts on the table's natural
key — the pipeline can safely POST the same artifact twice (retries, redeploys, backfill
replays) and never duplicate a row.

| Table | Primary/natural key | Notes |
|---|---|---|
| `briefs` | `(date, kind)` | `date` is `YYYY-MM-DD`. `kind` is `daily`, `weekend`, or `week-ahead`. A daily and a week-ahead on the same date both persist. `search` is a generated `tsvector` over `subject` + HTML-stripped `html`. |
| `themes` | `slug` | Not written directly by ingest — maintained as a side effect of `theme-events` upserts (see below). `status`: `active \| candidate \| retired`. |
| `theme_events` | `event_id` | FK `theme_slug → themes.slug`. `direction`: `raise \| lower \| hold \| candidate \| invalidate \| retire`. `search` is a generated `tsvector` over `evidence`. |
| `theme_state` | `taken_at` (unique) | Snapshot table; `payload` is the full `theme-state.json` passthrough (curated conviction/read/conditions/triggers per theme). History accumulates — nothing is deleted; `/map` reads the latest row. |
| `panel_snapshots` | `(kind, taken_at)` composite unique | `kind`: `dashboard \| odds_lens \| scoreboard`. `payload` is a jsonb passthrough of the pipeline's existing cache shape — the site does not reshape it. |
| `claims` | `claim_id` | `kind`: `smart_money \| map`. `themes` is a `text[]` (a claim can tag more than one theme). `payload` jsonb carries predicate, data_anchor, and quality fields. `search` is a generated `tsvector` over `payload->>'predicate'` + `payload->>'data_anchor'`. |
| `forward_events` | `event_id` | `resolution` is `null` until the event is reconciled. |

**`forward_events` resolution contract.** `forwardEventSchema` (`src/lib/ingest/claims.ts`)
allows `resolution` to be absent or `null`, but if it's present, `resolution.outcome` —
a non-empty string — is required (`resolved_at` and `note` are optional passthrough).
The pipeline's publisher is responsible for deriving `outcome` before it POSTs a resolved
event; a resolution object with no `outcome` fails schema validation (422), same as any
other malformed payload.

**`theme_events` also maintains `themes`.** `upsertThemeEvents` (`src/lib/ingest/themes.ts`)
runs each batch in a transaction; for every event it upserts the parent `themes` row with:

- `status` derived from the event's `direction` (`statusFor()`): `candidate` →
  `candidate`; `retire` or `invalidate` → `retired`; anything else (`raise`, `lower`,
  `hold`) → `active`.
- `first_seen = least(existing, event.date)`, `last_event_at = greatest(existing,
  event.date)`.
- A **date guard** on `status` and `name`: the update only applies if
  `event.date >= themes.last_event_at`, so replaying an older backfilled event can never
  regress a theme's status or name past a newer event that already landed. This is what
  makes out-of-order backfill safe.

## Ingest flow and revalidation targets

Every route under `src/app/api/ingest/*/route.ts` is built from one factory,
`createIngestHandler` (`src/lib/ingest/handler.ts`):

```
auth (bearer, timing-safe) → JSON.parse → zod schema.safeParse → upsert(db, payload)
  → revalidatePath() for each affected route → { ok, upserted, revalidated }
```

- **Auth** (`src/lib/ingest/auth.ts`): a single shared token, `MACRO_WATCH_INGEST_TOKEN`.
  Compared with `crypto.timingSafeEqual`; fails closed (401) if the env var is unset at
  all, not just on a mismatch.
- **Auth failure → 401.** **Schema failure → 422** with the zod `issues` array in the
  body — the publisher logs and alerts on 422s but never blindly retries one, since a
  malformed payload will fail again.
- **Rendering** — the data pages (`/`, `/briefs`, `/map`, `/catalysts`, `/feed.xml`, plus
  `/accountability` and `/search`) are `export const dynamic = 'force-dynamic'`: server-
  rendered per request, always current with Postgres. They are deliberately **not** ISR-
  cached — the site is a live projection, and static-with-revalidation prerendered them
  empty at build (no database reachable during `next build`), which showed blank data in
  the window after each deploy until an ingest revalidated them. Dynamic rendering removes
  that class of staleness entirely. Only `/about` and `/icon.svg` are static.
- **Revalidation** — the ingest handlers still call Next.js on-demand `revalidatePath`
  (a `'layout'`-typed target busts every nested route in one call — e.g. a theme-events
  POST invalidates `/map` and every `/map/[theme]`). With the pages now force-dynamic this
  is belt-and-suspenders rather than the primary freshness mechanism. Outside a Next.js
  request scope (unit tests), `revalidatePath` throws — the handler catches it and logs a
  warning rather than failing the request.

Revalidation targets by endpoint:

| Endpoint | Revalidates |
|---|---|
| `briefs` | `/`, `/briefs`, `/briefs/[date]`, `/briefs/[date]/[kind]`, `/feed.xml` |
| `theme-events` | `/`, `/map` (layout — cascades to all `/map/[theme]`) |
| `theme-state` | `/`, `/map` (layout) |
| `panels` | `/`, `/track-record`, and `/accountability` when `kind === 'scoreboard'` |
| `claims` | `/accountability`, `/map` (layout — claims surface as "related claims" on theme pages) |
| `forward-events` | `/catalysts` |

## Public watch keys on the scoreboard panel

Panel kinds stay `dashboard`, `odds_lens`, and `scoreboard`. The fast publish adds
optional keys inside the existing scoreboard payload, beside `rows`. A missing key
renders an empty state. `rows` is still stored and is not the track-record table.

| Field path | Use |
|---|---|
| `scoreboard` panel `payload.updated_at` | ISO timestamp. Also stamped on the latest `dashboard` and `odds_lens` payloads. The header and footer show `Updated <relative time>` from the newest of those three. |
| `scoreboard` panel `payload.rows` | Unchanged legacy summary rows. |
| `scoreboard` panel `payload.scoreboard` | `{as_of, totals:{scored,hit,miss,void,open,hit_rate,brier}, recent:[...], open:[...]}`. `/track-record` and the home summary. |
| `scoreboard` panel `payload.scoreboard.recent[]` | `{call_id,title,made_at,resolved_at,status,note,url?}`. `call_id` must start with `sovs-macro:`. |
| `scoreboard` panel `payload.scoreboard.open[]` | `{call_id,title,made_at,horizon}`. |
| `scoreboard` panel `payload.kalshi_movers` | `{as_of, window_hours, stale, items:[...]}`. Home board. |
| `scoreboard` panel `payload.kalshi_movers.items[]` | `{ticker,title,url,prob_now,prob_prev,change_pp,change_1h_pp?,volume_24h,category}`. The 1-hour column renders only when `change_1h_pp` is present. |

`hit_rate` and `brier` may be JSON `null`. Calls and markets whose id, title, note, url,
source, or publication names a guarded paywalled or email-only outlet are dropped on ingest
and again at render. `payload.rows` is not filtered. The built-in guard lists in
`src/lib/security/blocked-publishers.ts` and `private-sources.ts` are stored hashed
(`src/lib/security/term-hash.ts`); `BLOCKED_PUBLISHERS` and `PRIVATE_SOURCE_NAMES` add
plaintext entries from the deploy environment. Tests install fictional stand-ins
(`tests/helpers/fake-source-defaults.ts`).

## Health endpoint

`GET /api/health` (`src/app/api/health/route.ts`) is a readiness check —
`force-dynamic` (never cached). It runs `select 1` against Postgres and returns
`{ok, ready, service, database}` with 200 when reachable and 503 when not.
It's Railway's `healthcheckPath` (`railway.json`).

## Honest-denominator scoring rules

`src/lib/scoring.ts` implements the accountability math. The pipeline's claim
vocabulary is `pending | hit | miss | partial | expired | judgment-required | void` —
**not** the site-plan draft's `open/resolved_correct/resolved_incorrect/invalidated`
language; do not reintroduce that vocabulary.

- **Batting average = hits / (hits + misses), only.** `resolved = hits + misses` is the
  *only* quantity that ever feeds `hitRate`. `pending` never enters the denominator —
  there's nothing to grade yet. `partial`, `expired`, `judgment-required`, and `void` are
  each tallied and displayed but **never** counted as a hit, a miss, or folded into
  `resolved` — none of them is a correct/incorrect outcome, so averaging them in would
  overstate or understate the record.
- **`hitRate` is `null` when `resolved === 0`.** This is a deliberate honest-empty-state,
  not a bug: "0 resolved — not enough to grade yet" beats a fabricated percentage.
- **Minimum-sample floors gate what's *displayed*, not what's counted.**
  `OVERALL_MIN_SAMPLE = 8`, `GROUP_MIN_SAMPLE = 4`. `battingAverage(board, minSample)`
  returns `board.hitRate` only once `board.resolved >= minSample`; below the floor it
  returns `null` even if `hitRate` is technically computable, so a handful of early claims
  can't produce a headline number that overstates confidence. Each track uses the 8-floor;
  per-theme and per-evidence-type breakdowns use the 4-floor
  (`src/app/accountability/page.tsx`, `src/components/GradeMeter.tsx`).
- **Prediction-market accuracy needs a market baseline.** `openingProbability()` reads the
  probability assigned to the recorded side at admission. Once a track clears the display
  floor, its card can show mean implied probability, accuracy lift versus that baseline,
  and Brier score. A high raw hit rate alone does not establish forecasting edge.
- **Quality class** (`qualityClass()`) is read straight off `payload.market_type`;
  claims with no `market_type` fall into an `'unclassified'` bucket rather than being
  dropped.
- **`groupBoards()`** builds one `ScoreBoard` per key from a `keysOf` selector; a claim
  contributes to every key it carries (e.g. every theme in its `themes[]` array), so a
  multi-theme claim is graded once per theme it touches, not just once overall.

### Accountability page structure

`src/app/accountability/page.tsx` leads with orientation before statistics. Every section
above the public ledger is computed from the **whole** record (`getClaims(db)`, no filters).
Query-string filters only narrow the ledger table, which is served 25 rows at a time
(`getClaimsPage`, `?page=N`, newest first); the pager links carry the active filters, and the
filter form omits `page` so a new filter starts on its first page.

- **Record status** states whether the system is tracking, early, or ready to publish a
  headline rate. It separates total rows, mechanically eligible claims, final decisions,
  pending outcomes, and qualitative checks.
- **Method and scope** explains admission, external verification, scoring, and the current
  coverage boundary. Current automation covers smart-money Polymarket signals and weekly
  map-derived market checks. Daily narrative is outside the claim record.
- **Performance by track** (`src/components/GradeMeter.tsx`) keeps smart-money and map-derived
  calls separate. Below the eight-decision floor it still shows correct and incorrect
  counts. Theme and evidence-type breakdowns stay hidden until they have a final decision.
- **Upcoming decisions** (`src/components/ExpiryHorizon.tsx`) includes only `pending`
  mechanically eligible claims. Qualitative flip conditions never enter the expiry chart.
- **Qualitative map review** names the human-review set and states that it never enters
  performance statistics.
- **Claim history** (`src/components/ClaimsBook.tsx`) shows one mark per mechanically eligible
  claim. **Public ledger** (`src/components/ClaimsTable.tsx`) preserves every row with readable
  labels, source links, opening probabilities, evidence types, and verified results, paginated
  so the page's HTML weight no longer grows with the record.

## Field-map position semantics

`src/lib/field-map.ts` computes the pure, deterministic layout for the `/map` hero (the
field). Same inputs always produce the same layout — no `Date.now()`, no randomness.

- **Y-axis: conviction band.** `high | medium | low`; a theme with no conviction rating
  reads as `low` (`bandKeyOf()`). Bands stack top-down (`high`, `medium`, `low`), each
  sized to fit its own members via a collision sweep — a band grows taller than the
  default `BAND_H` when a column of themes stacks deep at the same x position.
- **X-axis: 30-day directional pressure.** `pressureScore()` sums a weight per
  theme-event inside the 30-day window ending "as of" the render date
  (`windowStart()`): `raise +1, lower −1, candidate +0.5, invalidate −0.5, hold 0,
  retire −1`, then clamps the sum to `[−3, +3]` (`PRESSURE_CLAMP`). `xForPressure()`
  maps that clamped score linearly onto the field's x range.
- **Within-band placement** is a deterministic jitter keyed on a hash of the theme's
  slug (`slugJitter()`, djb2-xor), so a given theme always lands at the same vertical
  offset inside its band on repeated renders — it isn't visual noise, it's a stable
  fingerprint. A single top-down sweep then nudges any two nodes whose label footprints
  (`x0`..`x1`) overlap apart by at least `V_GAP`.
- **Retired themes never plot on the field.** They're excluded from the pressure/band
  layout entirely and instead pinned to a thin "shelf" below the bands, sorted by name,
  wrapping into rows as needed (`SHELF_*` constants).
- **Dormant candidates leave the field.** A `candidate` whose last event is more than
  45 days before the as-of date (`DORMANT_AFTER_DAYS`, `src/lib/theme-lifecycle.ts`)
  is dormant: not plotted, not shelved, listed only in the grid's collapsed Dormant
  section. The stored status never changes; any new event revives it.
- **Conviction gauge:** `lit` is the number of filled positions on the diamond gauge —
  `high → 3, medium → 2, low → 1, unrated → 0` (`LEVEL` map).
- **Labels shorten, never truncate meaning:** the `"new theme candidate — "` prefix is
  stripped (candidacy is already encoded by a hollow-diamond marker), and anything past
  28 characters gets an ellipsis; the full name is always available in the tooltip and
  the grid below the field (`fieldLabel()`).

## Sentinel-exclusion rule (`PUBLIC_BRIEF_MIN_DATE`)

`scripts/smoke.mjs --with-write` verifies the ingest round-trip on a live deployment by
POSTing a clearly-marked sentinel brief dated `1999-01-01` and checking that its permalink
renders. That date was chosen as "obviously synthetic" — until an empty `briefs` table
made that single sentinel row the *only* brief, at which point it became the homepage hero
(the "obviously synthetic" assumption inverted the moment it was the only date-ordering
input). A sentinel briefly reached prod this way and was manually deleted
(`d10ab8b`).

The fix is now structural rather than a naming convention:

- `PUBLIC_BRIEF_MIN_DATE = '2000-01-01'` (`src/lib/queries/briefs.ts`).
- **Every listing/latest/RSS/search query** filters `date >= PUBLIC_BRIEF_MIN_DATE`:
  `getLatestBrief`, `listBriefs` (both in `src/lib/queries/briefs.ts`), and the brief
  branch of `searchAll` (`src/lib/queries/search.ts`).
- **`getBriefByDate` has no such filter** — a sentinel's direct permalink
  (`/briefs/1999-01-01`) still renders. This is intentional and is exactly how the smoke
  round-trip verifies without ever polluting a public listing, the homepage, the RSS feed,
  or search results.
- A regression test (`tests/briefs-pages.test.tsx`) pins this: a `1999-01-01` brief must
  never appear in `getLatestBrief` or `listBriefs`, but must still resolve via
  `getBriefByDate`.

If a future ingest endpoint gains its own "obviously out of range" sentinel convention,
apply the same pattern: filter every public aggregate/listing query, but leave direct
lookups-by-key unfiltered.
