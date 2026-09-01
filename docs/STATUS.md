# Gacha Lens Status

Updated: 2026-09-01 JST — post-PR #153 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase state before acting; counts below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- verified `main` before this canonical-sync PR: `af5356148cb75975f13383d095e01a805e7120db`
- latest merged implementation PR: #153 `P0 Data Scale: harden exact provider re-observation dry-run`
- #153 Vercel Production deployment: `dpl_9srsV4znx24SK7mmC9AX2Vkds7Pw` — `READY`
- #153 exact-head full Node tests / lint / diff whitespace / Vercel Preview / independent review: PASS
- Issue #135: closed completed
- old Draft #136: closed superseded
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

## Current P0

Issue #119 — **Data Scale Program**.

Business/product ordering:

1. multi-listing depth per variant
2. measurable collection health / Scoreboard
3. lawful source capability expansion
4. separately approval-gated Production history rollout
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
- #153 — hardened exact provider re-observation dry-run: merged; #135 closed; old #136 superseded/closed

### Re-observation durable behavior after #150 + #153

- repeated append-only observation planning
- deterministic retry-safe observation IDs
- exact durable marketplace identity verification before provider request
- exact persisted Rakuten/Yahoo item reads; no keyword rediscovery in this lane
- credential-bearing requests restricted to reviewed official API host + exact path
- arbitrary HTTPS/custom/credential-bearing/query-injected endpoints fail closed
- redirects refused
- ordinary live states only `active` / `sold_out`; no fabricated `sold`
- unchanged observations remain valid time evidence
- positive integer price required
- unknown provider availability fails closed
- stale observations cannot roll current snapshot backward
- bounded serial dry-run only; live Production provider execution/persistence remains unapproved

## Current open PRs

Re-fetch before acting.

- #132 — multi-listing Depth Collector; old-base Draft, **next implementation after canonical sync**, requires current-main clean validation/replacement
- #134 — read-only Data Scale Scoreboard; old-base Draft, requires current-main clean validation/replacement after #132 unless new evidence changes priority
- #145 — lawful source capability matrix; old-base docs-only Draft, revalidate after higher-priority data-generation/measurement lanes
- #142 — F0 rerelease canonical-year repair; explicit review/approval boundary, do not auto-merge

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

The code foundation can now plan repeated observations and perform exact provider reads, but no Production history persistence rollout has been authorized.

## F0 official automatic incident

Run `33484450472` failed safely on 2026-09-01:

- read-only audit ready
- proposed new series / variants: 4 / 19
- proposed restock event: 1
- transaction `not_started`
- DB writes 0
- deletes 0
- blocker `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 repair month-precision rerelease canonical-year loss. Current PR validation may pass, but explicit Production-impact approval remains required. Do not manually dispatch F0 as a substitute.

## Automatic lanes / hard boundaries

- F0: keep fail-closed gates; repair pending #142 approval/review
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

Canonical-sync Issue #154 is the gate before more implementation.

After its docs-only PR is exact-head validated, merged, and Production READY:

1. re-fetch Issue #129 / PR #132 on current main
2. clean-replace/rebase only after exact diff review
3. preserve many distinct legitimate offers per variant with strict identity dedupe and matcher/provenance safety
4. run exact-head CI + Preview + independent collection-semantics review
5. keep Production persistence/automatic activation separate and approval-gated
6. then settle #134 Scoreboard, followed by #145 source matrix unless newer evidence changes priority

Business bottleneck remains **Data Scale first**.
