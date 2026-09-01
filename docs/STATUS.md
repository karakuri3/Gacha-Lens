# Gacha Lens Status

Updated: 2026-09-01 JST — post-PR #150 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase state before acting; counts below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- verified `main` before this canonical-sync PR: `53cbfabb8916e6647dde3d18423d855899df80d0`
- latest merged implementation PR: #150 `P0 Data Scale: add safe dry-run re-observation engine`
- #150 Vercel Production deployment: `dpl_3Wo9ToRQVUDWwftN58NzUbbi4q7F` — `READY`
- #150 exact-head full Node tests / lint / diff whitespace / Vercel Preview: PASS
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

## Current P0

Issue #119 — **Data Scale Program**.

Business/product ordering:

1. market history / repeated observations
2. multi-listing depth per variant
3. measurable collection health
4. lawful source expansion
5. stock/restock/non-price signals
6. explainable authorized demand/social signals
7. DATA -> TRAFFIC -> CLICK -> REVENUE

Three active listings is a presentation threshold only, never a collection-completion target.

## Completed current-sequence milestones

- #146 — read-only collection throughput audit: merged
- #147 — scalable market history architecture: merged
- #148 — evidence-backed market signal architecture: merged
- #149 — upcoming forecast truthfulness fail-closed repair: merged; #130 closed; old #133 superseded/closed
- #150 — safe dry-run re-observation engine: merged; #128 closed; old #131 superseded/closed

### #150 durable behavior

- repeated append-only observation planning
- deterministic retry-safe observation IDs
- exact marketplace identity verification
- ordinary live states only `active` / `sold_out`; no fabricated `sold`
- unchanged observations remain valid time evidence
- positive integer price required
- unknown provider availability fails closed
- stale observations older than `last_observed_at` fail closed and cannot roll current snapshot backward
- dry-run output only; Production history persistence remains unapproved

## Current open PRs

Re-fetch before acting.

- #136 — exact Rakuten/Yahoo provider re-observation read; old stacked Draft, **must be clean-replaced from current main**
- #132 — multi-listing depth collector; old-base Draft, requires clean revalidation/replacement
- #134 — read-only Data Scale Scoreboard; old-base Draft, requires clean revalidation/replacement
- #145 — lawful source capability matrix; docs-only Draft, requires revalidation/rebase
- #142 — F0 rerelease canonical-year repair; explicit review/approval boundary, do not auto-merge

## #136 security finding before clean replacement

Old #136 accepts configurable HTTPS endpoints. Because:

- Rakuten sends `accessKey` as a request header
- Yahoo sends `appid` in the query

an arbitrary custom HTTPS host could receive credential material if misconfigured.

Required repair in the clean replacement:

- lock each provider request to the reviewed official API host + path, or an equivalently strict allowlist
- arbitrary HTTPS custom hosts must fail before request execution
- keep exact-item/no-keyword behavior
- keep serial pacing, bounded retries/timeouts, sanitized diagnostics
- keep runner dry-run/read-only
- do not run live Production-connected provider reads or persist observations without separate approval

## Dated Production data evidence

Supabase Production: `vxbrnvfhmzcxehuuzzum`.

Issue #119 earlier 2026-09-01 snapshot:

- series 10,241
- variants 23,808
- market listings / observations 96 / 96
- listings with 2+ observations 0
- completed/sold evidence 0

Issue #128 later recorded 101 market listings / 101 observations, still one observation per known listing at that checkpoint.

A later same-day read recorded `outbound_clicks` 68 while `stock_reports`, `restock_events`, and `x_reactions` were 0. Treat all counts as dated evidence until re-read.

## F0 official automatic incident

Run `33484450472` failed safely on 2026-09-01:

- read-only audit ready
- proposed new series / variants: 4 / 19
- proposed restock event: 1
- transaction `not_started`
- DB writes 0
- deletes 0
- blocker `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 repair month-precision rerelease canonical-year loss. Current PR validation passes, but independent review + explicit Production-impact approval remain required. Do not manually dispatch F0 as a substitute.

## Automatic lanes / hard boundaries

- F0: keep fail-closed gates; fix pending #142 approval/review
- P3 V2 market: breadth seeding remains separate from depth/re-observation; strict matcher/provenance unchanged
- Kitan auto: false/off unless newer approved evidence says otherwise
- Qualia auto: unapproved; series-only manual boundary remains

Always preserve:

- no Mercari/Amazon scraping
- authorized X/social only
- no matcher weakening for coverage
- no completed/active evidence mixing
- complete sets stay series-level
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled

## Exact next step

Canonical-sync Issue #151 is the gate before more implementation.

After its docs-only PR is validated/merged:

1. clean-replace #136/#135 from current main
2. add strict official endpoint allowlisting and regression tests
3. validate exact-head CI + Preview + independent review
4. keep live provider execution and Production persistence at a separate approval boundary
5. then settle #132 depth collector and #134 Scoreboard

Business bottleneck remains **Data Scale first**.
