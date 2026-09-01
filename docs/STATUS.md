# Gacha Lens Status

Updated: 2026-09-02 JST — post-PR #159 checkpoint

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live GitHub/Vercel/Supabase state before acting; counts below are dated unless explicitly re-read.

## Repository / release

- repo: `karakuri3/Gacha-Lens`
- current merged implementation checkpoint: `3b0fea45a63800fdc052d007484727f9ed07e999`
- latest merged implementation PR: #159 `P0 Data Scale: add truthful read-only Scoreboard`
- #159 Vercel Production deployment: `dpl_BBV9gV6d5a7ftCihMPfc8v8oo4S7` — `READY`
- #159 exact-head PR Code Quality: full tests / lint / diff whitespace PASS
- #159 exact-head Vercel Preview for `1b81b16226d4ad87bed2adaab476b81d4cf01daa`: READY
- Issue #126: closed completed
- old Draft #134: closed superseded by #159
- generic PR Code Quality remains the default non-Production validation lane
- Auto-Merge + Standing Production Release policies remain authoritative

PR #156 Reviewer note remains historical and narrow: Copilot Code Review was unavailable on the current GitHub plan, and the user explicitly approved a **#156-only** substitution of independent CI + strengthened Lead self-review + regression tests. This is not a global policy change.

## Current P0

Issue #119 — **Data Scale Program**.

Current ordering after the post-#159 canonical-sync gate:

1. revalidate lawful source capability matrix (#145 / #123)
2. separately approval-gated Production history/depth rollout
3. stock/restock/non-price signals
4. explainable authorized demand/social signals
5. DATA -> TRAFFIC -> CLICK -> REVENUE

Three active listings is a presentation threshold only, never a collection-completion target.

## Completed current-sequence milestones

- #146 — read-only collection throughput audit: merged
- #147 — scalable market history architecture: merged
- #148 — evidence-backed market signal architecture: merged
- #149 — upcoming forecast truthfulness fail-closed repair: merged; #130 closed; old #133 superseded/closed
- #150 — safe dry-run re-observation engine: merged; #128 closed; old #131 superseded/closed
- #153 — hardened exact provider re-observation dry-run: merged; #135 closed; old #136 superseded/closed
- #156 — hardened dry-run Depth Collector: merged; #129 closed; old #132 superseded/closed
- #159 — truthful read-only Data Scale Scoreboard: merged; #126 closed; old #134 superseded/closed

## Scoreboard foundation after #159

The Scoreboard is now the standard repository-side read-only view for measuring whether Gacha Lens is improving through **DATA -> TRAFFIC -> CLICK -> REVENUE** rather than PR/agent activity.

Truthfulness contract:

- measured metric states remain distinct: `available`, `unavailable`, `not_instrumented`
- source capability state is separate: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`
- `supported_source_count` counts only `active` capability entries
- capability inventory count remains separate from active support count
- X is `paid_access_required` unless reviewed authorized collection is enabled; absent social evidence is `not_instrumented`, not zero interest
- Mercari remains `partnership_required`
- only actual `status=sold` counts as completed-sale evidence; `sold_out` is not a transaction
- `review_required=true` stock/restock/social rows are excluded from trusted signal coverage
- current outbound-click evidence supports provider+variant eligibility only; it is not listing-level conversion/revenue attribution
- database `ingestion_runs` and GitHub Actions execution are separate evidence lanes; zero DB rows must not be presented as zero workflow runs
- raw provider payloads and secrets are not emitted
- Scoreboard integration is read-only and does not authorize Production history/depth persistence or automatic collection activation

CLI/spec:

- `docs/DATA_SCALE_SCOREBOARD.md`
- `lib/domain/data-scale-scoreboard.js`
- `scripts/data-scale-scoreboard-report.mjs`

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

- #145 — lawful source capability matrix; old-base docs-only Draft, **next P0 settlement after canonical sync #160**; revalidate or clean-replace from current main rather than blindly merging stale history
- #142 — F0 rerelease canonical-year repair; explicit review/approval boundary, do not auto-merge

## Dated Production data evidence

Supabase Production: `vxbrnvfhmzcxehuuzzum`.

Read-only validation performed during #159 settlement measured:

- series: 10,241
- variants: 23,808
- market listings: 107
- active safe single listings: 106
- distinct variants with market evidence: 104
- fresh <30d depth: 96 variants at depth 1, 1 variant at depth 2, 0 at depth 3-4 / 5-9 / 10+
- market listing observations: 107
- listings with 0 observations: 0
- listings with exactly 1 observation: 107
- listings with 2+ observations: 0
- completed `sold` evidence: 0
- verified affiliate provenance rows: 3
- review-safe stock reports: 0
- review-safe restock events: 0
- review-safe X reactions: 0
- outbound clicks: 0 / 21 / 38 at 24h / 7d / 30d at validation time
- new listings / observations in the measured 24h window: 11 / 11
- Production database `ingestion_runs` market rows in that 24h window: 0; this does **not** claim GitHub Actions runs were zero

Treat all counts as dated until re-read. #150/#153/#156 are code foundations only; no Production history/depth persistence rollout has been authorized.

The dominant measured data bottleneck remains history: 107 known listings still had only one observation each at this checkpoint.

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

Canonical-sync Issue #160 is the gate before more implementation.

After its docs-only PR is exact-head validated, merged, and Production READY:

1. re-fetch Issue #123 / Draft PR #145 on current main
2. inspect the stale docs diff and clean-replace when safer
3. preserve durable capability states and current lawful-access truthfulness
4. keep Mercari partnership-only, X authorized/paid-access only, and avoid scraping substitutions
5. treat Aucfan/API licensing or any other paid source as separate diligence + explicit approval, not implicit activation
6. run exact-head CI + Preview + normal docs review gate
7. keep Production history/depth persistence/automatic activation separate and approval-gated
8. leave #142 at its explicit F0 Production-impact approval boundary

Business bottleneck remains **Data Scale first**.
