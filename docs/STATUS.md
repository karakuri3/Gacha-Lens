# Gacha Lens Status

Updated: 2026-09-02 JST — post-PR #162 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase/provider state before acting; counts and provider terms below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- current merged checkpoint: `94ea0d8aac95e76e657326bc6c6df515f8603f22`
- latest merged milestone: #162 `P0 Data Scale: refresh lawful source capability matrix`
- #162 Vercel Production deployment: `dpl_Bp4p6evfsMsqideLzDg39uPmdzqA` — `READY`
- #162 exact head: `b7d3a2215fe420e88a47eddc32b32c03be4a945e`
- #162 PR Code Quality run `33531641763`: full tests / lint / diff whitespace PASS
- #162 exact-head Preview `dpl_DxzDWG9jdYkRVac3ZTADsamhYgjg`: READY
- #162 diff: exactly one new docs file
- Issue #123: closed completed
- old Draft #145: closed superseded by #162
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

PR #156 Reviewer note remains historical and narrow: the user approved a **#156-only** substitution of independent CI + strengthened Lead self-review + regression tests when Copilot Code Review was unavailable. This is not a global policy change.

## Current P0

Issue #119 — **Data Scale Program**.

Current ordering after post-#162 canonical sync:

1. create and complete a dedicated **read-only Production history/depth rollout plan** under #119
2. separately request approval for any live Production provider-read canary / DB persistence canary / workflow or schedule activation
3. use the Scoreboard to verify actual history/depth improvement after any approved rollout
4. pursue licensed completed-sale evidence, with Aucfan currently the strongest identified commercial candidate
5. continue stock/restock/non-price and explainable demand/social work only from authorized evidence
6. DATA -> TRAFFIC -> CLICK -> REVENUE

Three active listings is a presentation threshold only, never a collection-completion target.

## Completed current-sequence milestones

- #146 — read-only collection throughput audit: merged
- #147 — scalable market history architecture: merged
- #148 — evidence-backed market signal architecture: merged
- #149 — upcoming forecast truthfulness fail-closed repair: merged
- #150 — safe dry-run re-observation engine: merged
- #153 — hardened exact provider re-observation dry-run: merged
- #156 — hardened dry-run Depth Collector: merged
- #159 — truthful read-only Data Scale Scoreboard: merged
- #162 — current lawful source capability matrix: merged; #123 closed; old #145 superseded/closed

## Source capability checkpoint after #162

Canonical source contract: `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

Current verified source posture, dated 2026-09-02:

- Rakuten Ichiba API: `active`
- Yahoo Shopping API / ValueCommerce: `active`
- Bandai / Takara Tomy Arts official catalog: active inside existing repository contracts
- Kitan Club official: capability exists, bounded/manual canary history; auto remains off
- Qualia official: limited conservative capability; broad variant/auto rollout unapproved
- Aucfan API/MCP: `paid_access_required`; best current licensed candidate for completed-sale/history, but commercial fields/rights/pricing remain unverified until diligence
- Yahoo Auctions broad public market API: `unavailable` through the reviewed current public path
- Mercari C2C broad market data: `partnership_required`; no scraping
- Mercari Shops Public API: official seller/shop API exists, but broad market-intelligence capability is unavailable through that authenticated-shop scope
- X API: `paid_access_required`; prices/quotas/search products are time-sensitive and must be rechecked before any activation
- eBay Browse: lower-priority `planned`; current Buy API marketplace support did not include Japan at verification and historical Marketplace Insights access was restricted
- Surugaya / Mandarake / AmiAmi broad automation: partnership/permission diligence before automation
- Gacha Lens outbound clicks: active first-party provider+variant intent evidence, not transaction evidence
- current GSC Wizard reporting path: `unavailable` because the connected read returned subscription/payment-required; this is not a zero-traffic claim and not a claim that Search Console itself is unavailable

No paid source, API credit, credential, partnership, scraping path, or Production collector was activated by #162.

Provider prices, quotas, supported markets and commercial terms are dated facts. Recheck official sources immediately before purchase, credential use, implementation or external commitment.

## Scoreboard foundation after #159

The Scoreboard is the standard repository-side read-only measurement view for **DATA -> TRAFFIC -> CLICK -> REVENUE**.

Truthfulness contract:

- `available`, `unavailable`, `not_instrumented` remain distinct
- source capability state is separate from metric availability
- only actual `status=sold` counts as completed-sale evidence
- `sold_out` is not a transaction
- review-required stock/restock/social evidence is excluded
- outbound-click evidence is provider+variant scoped, not listing-level conversion/revenue attribution
- Production DB ingestion-run evidence and GitHub workflow-run evidence remain separate
- Scoreboard does not authorize Production collection/persistence

## Re-observation / depth foundations

After #150 + #153:

- append-only repeated observation planning
- retry-safe observation IDs
- exact persisted Rakuten/Yahoo item reads without keyword rediscovery
- credential destinations restricted to reviewed official host/path
- redirects refused
- only ordinary `active` / `sold_out` live states; no fabricated `sold`
- positive price + explicit availability required
- stale observations cannot roll current snapshot backward

After #156:

- explicit target variant + parent series
- strict P3 matcher/set/ambiguity safety reused unchanged
- many genuinely distinct offers can be retained; no `3 listings = done`
- durable marketplace identity dedupe
- SHA-256 selection binding and post-selection drift checks
- insert-only projected-write contract
- default budget 50 / hard max 200 are safety bounds, not product targets

All three remain code/dry-run foundations. Live Production-connected provider execution and DB persistence remain unapproved.

## Dated Production data evidence

Supabase Production: `vxbrnvfhmzcxehuuzzum`.

Read-only validation during #159 measured:

- series: 10,241
- variants: 23,808
- market listings: 107
- active safe singles: 106
- variants with safe active market evidence: 104
- fresh <30d depth: 96 variants ×1, 1 variant ×2, 0 variants ×3+
- observations: 107
- listings with exactly one observation: 107
- listings with 2+ observations: 0
- completed `sold`: 0
- verified affiliate provenance: 3
- review-safe stock/restock/X: 0 / 0 / 0
- outbound clicks: 0 / 21 / 38 at 24h / 7d / 30d at validation time

Treat these as dated until re-read. The measurable bottleneck remained repeated history: every known listing still had only one observation.

## Current open work

Re-fetch before acting.

- Issue #119 — Data Scale umbrella. No dedicated Production history/depth rollout-planning child Issue existed at the #162 checkpoint; create one only after canonical-sync #163 closes.
- PR #142 / Issue #137 — F0 rerelease canonical-year repair; explicit Production-impact review/approval boundary, do not auto-merge or manually dispatch F0.

## F0 official automatic incident

Run `33484450472` failed safely on 2026-09-01:

- transaction `not_started`
- DB writes 0 / deletes 0
- blocker `official_bounded_rerelease_canonical_release_mismatch`

PR #142 contains the repair; approval remains required before merge and any manual rerun/dispatch.

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- Kitan auto remains off; Qualia auto remains unapproved
- no Mercari/Amazon scraping
- do not misuse Mercari Shops seller scope as market-wide access
- do not automate public storefronts without reviewed API/feed/permission
- authorized X/social only
- no matcher weakening for coverage
- no completed/active evidence mixing
- complete sets stay series-level
- no Aucfan/X/GSC-paid/other paid activation without explicit approval

## Exact next step

Canonical-sync Issue #163 is the current gate.

After its docs-only PR is exact-head green, merged, and Production READY:

1. re-fetch #119, `main`, Production counts and open PRs
2. confirm no newer dedicated rollout-planning Issue exists
3. create one bounded child Issue for **read-only Production history/depth rollout planning**
4. reconcile #150/#153/#156/#159/#162 into exact canary, idempotency, transaction, rollback, provider-budget and Scoreboard-success requirements
5. re-read Production/provider health read-only before sizing anything
6. stop at the explicit boundary before any live Production provider request, DB write, workflow dispatch/schedule change, Secrets/Variables change, or paid action
7. keep #142 approval-bound

Business bottleneck remains **Data Scale first**.
