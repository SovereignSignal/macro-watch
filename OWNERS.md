# Ownership & collaboration — macro-watch

macro.watch is the public site for the SovsMacro intelligence system. Two agents
plus the owner build it; this file is how they coordinate. Its pipeline-side
cousin is [`sovs-macro/OWNERS.md`]; the fuller narrative lives in Notion
("macro.watch — Docs → How We Build It Together").

## The model: two agents, one membrane

**sovsclaw produces the intelligence and pushes it through the ingest contract;
M5 receives it and presents it.** Everything upstream of the contract is
sovsclaw's; everything downstream is M5's. That seam is the only thing both
sides must agree on — which is what lets two agents move fast in parallel.

## Cast

- **sovsclaw** — the Nuc VM **and** the GPT 5.6 Sol agent resident on it; runs
  the sovs-macro pipeline, composes the briefs, reviews/contributes here.
  GitHub `sovs-claw`; commits as `SovsClaw <sov@sovereignsignal.com>`.
- **M5** — Claude Code (MacBook); built this site, owns site + infra + design +
  docs; reaches the VM over SSH.
- **Sov** — the owner. Final say; the only one who makes outward-facing or
  irreversible calls.

## Who owns what

| Area | Owner |
|---|---|
| Pipeline core, compose model, brief content | sovsclaw |
| `sovs-macro/scripts/site_publish.py` — publisher + payload shaping | sovsclaw (M5 co-touches) |
| Ingest API, zod schemas, DB schema | M5 |
| Pages, components, design system, charts | M5 |
| Railway, deploys, DNS, env, ops | M5 |
| **What** the site says — claim / theme / catalyst semantics | sovsclaw |
| **How** the site says it — layout, render, plumbing | M5 |

sovsclaw is closest to *meaning*; M5 is closest to *presentation and seams*.
Work routes itself accordingly.

## The one rule that matters

**Never silently change the ingest contract.** A payload shape, field name,
enum, or endpoint change lands on both sides in lockstep, validated with **real
payloads against the real zod schemas** before anything ships. Four would-be
production 422s (claims, forward-events, theme-state, mixed record-types) all
came from the publisher and the site drifting apart — validating actual pipeline
output against actual site schemas is the standing discipline for any contract
change.

## How a change lands

1. **Propose via PR; branch, don't push straight to main.** The repo is private
   on the free tier, so GitHub branch protection / rulesets are **not
   available** — main-discipline is therefore by **agreement between the agents,
   not platform-enforced.** Honor it; the discipline is the point.
2. **CI green → review → merge.** Tests + typecheck + build must pass
   (`npm test` runs on PGlite, no database needed). For anything touching data
   *meaning*, sovsclaw reviews; for structure/infra/design, M5 reviews.
3. **Merge ≠ deploy.** macro-watch does not auto-deploy. Someone runs
   `railway up` explicitly, then `scripts/smoke.mjs` verifies the live URL.
   This is deliberate fail-closed discipline.
4. **Contract changes are two coordinated PRs** — one to `sovs-macro`
   (publisher), one here (schema + page) — landed together, validated with real
   data.

The real safety net, given no enforced gates: **push ≠ deploy**, CI on every
push, and a manual verified deploy. A bad commit on main is recoverable and
reaches no visitor until someone deploys.

## Invariants neither agent violates

- **Honest by construction** — freshness labels on every number; batting average
  = hits/(hits+misses) only; nothing fabricated, estimated, or hidden.
- **Book-agnostic** — no positions, holdings, or trade actions ever reach the
  public site. This is what makes a public site possible at all.
- **Push-only / file-canonical** — the pipeline never reads the site's database;
  the site is always reconstructable by re-publishing from pipeline state.
- **The design language** — Fraunces / Georgia / IBM Plex Mono, reserved
  direction colors, the ◆◆◇ conviction gauge and status glyphs, restraint. New
  surfaces match it.
- **Fail-closed deploys** — explicit, verified, migrate-on-start; sentinels can
  never surface publicly (`PUBLIC_BRIEF_MIN_DATE`).

_Adopted 2026-07-12._
