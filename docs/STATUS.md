# Gacha Lens Status

Updated: 2026-09-02 JST — post-PR #156 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase state before acting; counts below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- current merged implementation checkpoint: `f7fb7b10f2ff8a791e439446958581ee42c3eeb9`
- latest merged implementation PR: #156 `P0 Data Scale: add hardened dry-run depth collector`
- #156 Vercel Production deployment: `dpl_43UEfvXeNsfwBKmuMm4J64Y9xL9s` — `READY`
- #156 exact-head PR Code Quality run `33523845575`: full tests / lint / diff whitespace PASS
- #156 exact-head Preview `dpl_8g3Yt2GiukaCG6GfMqFnxXHfM77y`: READY
- Issue #129: closed completed
- old Draft #132: closed superseded
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

PR #156 Reviewer note: Copilot Code Review was unavailable on the current GitHub plan. The user explicitly approved a **#156-only** substitution of independent CI + strengthened Lead self-review + regression tests. This is not a global policy change.

## Current P0

Issue #119 — **Data Scale Program**.

Current ordering:

1. settle read-only Data Scale Scoreboard (#134 / #126)
2. revalidate lawful source capability matrix (#145 / #123)
3. separately approval-gated Production history/depth rollout
4. stock/restock/non-price signals
5. explainable authorized demand/social signals
6. DATA -> TRAFFIC -> CLICK -> REVENUE

Three active listings is a presentation threshold only, never a collection-completion target.

## Completed current-sequence milestones

- #146 — read-only collection throughput audit: merged
- #147 — scalable market history architecture: merged
- #148 — evidence-backed market signal architecture: merged
- #149 — upcoming forecast truthfulness fail-closed repair: merged; #130 closed; old #133 superseded/closed
- #150 — safe dry-run re-observation engine: merged; #128 closed; old #131 superseded/closed
- #153 — hardened exact provider re-observation dry-run: merged; #135 closed; old #136 superseded/closed
- #156 — hardened dry-run Depth Collector: merged; #129 closed; old #132 superseded/closed

## Re-observation foundation after #150 + #153

- repeated append-only observation planning
- deterministic retry-safe observation IDs
- exact durable marketplace identity verification before provider request
- exact persisted Rakuten/Yahoo item reads; no keyword rediscovery in this lane
- credential-bearing requests restricted to reviewed official API host + exact path
- arbitrary HTTPS/custom/query-injected endpoints fail closed
- redirects refused
- ordinary live states only `active` / `sold_out`; no fabricated `sold`
- positive integer price required
- unknown provider availability fails closed
- stale observations cannot roll current snapshot backward
- bounded serial dry-run only; live Production provider execution/persistence remains unapproved

## Depth Collector foundation after #156

- explicit target variant + parent series
- strict P3 single-item/matcher/set/ambiguity safety reused unchanged
- 10+ distinct legitimate offers can be retained under budget; no `3 listings = done` stop
- same price/title does not dedupe distinct marketplace identities
- durable listing ID + provider/native source ID + canonical URL dedupe
- duplicate candidate keys all fail closed
- same-provider distinct storefront/listing and cross-provider distinct offers are supported when identity is genuinely distinct
- SHA-256 selection binding covers target, IDs, canonical URL and row-relevant evidence
- target/URL/price/title/identity drift after selection fails closed
- strict safety is re-run before row generation
- dry-run uses the same selection-integrity gate
- projected writes are insert-only and count-bound to accepted selection
- default budget 50 / hard max 200 are operational safety bounds, not product completion targets
- Production persistence/automatic activation remains unapproved

## Current open PRs

Re-fetch before acting.

- #134 — Data Scale Scoreboard; old-base Draft, **next P0 settlement**, requires current-main clean validation/replacement
- #145 — lawful source capability matrix; old-base docs-only Draft, revalidate after #134 unless newer evidence changes priority
- #142 — F0 rerelease canonical-year repair; explicit review/approval boundary, do not auto-merge

## Dated Production data evidence

Supabase Production: `vxbrnvfhmzcxehuuzzum`.

Earlier 2026-09-01 reads recorded:

- series 10,241
- variants 23,808
- market listings / observations: first 96 / 96, later 101 / 101, then 107 / 107
- listings with 2+ observations: 0 at the 107/107 checkpoint
- safe active listings: 106 at that checkpoint
- one variant had reached 3 active listings
- completed/sold evidence: 0
- `outbound_clicks`: 68
- `stock_reports`, `restock_events`, `x_reactions`: 0

Treat all counts as dated until re-read. #150/#153/#156 are code foundations only; no Production history/depth persistence rollout has been authorized.

## F0 official automatic incident

Run `33484450472` failed safely on 2026-09-01:

- read-only audit ready
- proposed new series / variants: 4 / 19
- proposed restock event: 1
- transaction `not_started`
- DB writes 0
- deletes 0
- blocker `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 repair month-precision rerelease canonical-year loss. Explicit Production-impact approval remains required. Do not manually dispatch F0 as a substitute.

## Hard boundaries

- F0: keep fail-closed gates; repair pending #142 approval/review
- P3 V2 market: breadth seeding remains separate from depth/re-observation; strict matcher/provenance unchanged
- Kitan auto: false/off unless newer approved evidence says otherwise
- Qualia auto: unapproved; series-only manual boundary remains
- no Mercari/Amazon scraping
- authorized X/social only
- no matcher weakening for coverage
- no completed/active evidence mixing
- complete sets stay series-level
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled

## Exact next step

Canonical-sync Issue #157 is the gate before more implementation.

After its docs-only PR is exact-head validated, merged, and Production READY:

1. re-fetch Issue #126 / PR #134 on current main
2. inspect the exact stale-branch diff and clean-replace when safer
3. preserve truthful source/signal availability and `sold` vs `sold_out` semantics
4. run exact-head CI + Preview + required review gate
5. keep Production persistence/automatic activation separate and approval-gated
6. then settle #145 source matrix unless newer evidence changes priority
7. leave #142 at its explicit F0 Production-impact approval boundary

Business bottleneck remains **Data Scale first**.
