# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-PR #159 checkpoint

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Prefer newer live GitHub/Vercel/Supabase evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs; this file is optimized for safe continuation from the current state.

## 1. Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs, relevant Issues, recent Actions, and Vercel deployment state before implementation.
3. Prefer existing durable Issue/branch/PR work over creating duplicates.
4. Do not repeat completed Production canaries/diagnostics only to refresh context.
5. Do not perform Production DB writes, migrations/backfills/cleanup, `workflow_dispatch`, Secrets/Variables changes, paid actions, destructive actions, direct pushes to `main`, or ineligible merges/releases without required approval.
6. Safe reversible PRs may use `docs/AUTO_MERGE_POLICY.md`; their normal Git-triggered Vercel release may use `docs/PRODUCTION_RELEASE_POLICY.md` only when every gate passes.
7. After a major Production/recovery/security/release milestone, synchronize the canonical four files before starting the next major implementation phase.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production: `https://gachalens.com`

Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse it with Production.

Vercel project: `karakuri3s-projects/gachalens`

Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## 2. Verified checkpoint

Current merged `main` / Production code checkpoint before this canonical-sync PR:

`3b0fea45a63800fdc052d007484727f9ed07e999`

Latest merged implementation:

- PR #159 — `P0 Data Scale: add truthful read-only Scoreboard`
- Issue #126: closed completed
- old Draft PR #134: closed as superseded by #159

PR #159 normal Git-triggered Vercel Production deployment:

- deployment: `dpl_BBV9gV6d5a7ftCihMPfc8v8oo4S7`
- state: `READY`
- commit: `3b0fea45a63800fdc052d007484727f9ed07e999`

PR #159 exact-head validation:

- exact head: `1b81b16226d4ad87bed2adaab476b81d4cf01daa`
- PR Code Quality run `33528129361`: full Node tests PASS, lint PASS, diff whitespace PASS
- exact-head Vercel Preview `dpl_C5SD2tVQ8fSekWZ9rmUNJGBhEBi1`: READY
- branch was behind main by 0; diff was exactly five new files
- full-diff Lead review: PASS, disclosed as non-independent; Issue #126 did not impose the separate external Reviewer requirement used by Issue #129
- Production DB writes, workflow dispatches, Secrets/Variables changes, paid/API activation, destructive actions, and Production data mutation: **0**

## 3. Product purpose and current P0

Gacha Lens is a gachapon market-intelligence product whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella program: Issue #119 — **Data Scale Program**.

Three active listings remain only a truthful presentation threshold, not a completion target. The actual objective is compounding lawful data coverage:

- broad official/catalog coverage
- multiple independent market listings per variant where available
- repeated observations for price/inventory history
- completed/sold evidence only from authorized sources
- stock/restock evidence
- explainable demand/popularity evidence
- authorized social/X evidence
- click/search/purchase-intent evidence
- measurable **DATA -> TRAFFIC -> CLICK -> REVENUE** movement

Mercari remains `partnership_required`; do not scrape it. Do not scrape Amazon. X/social must use authorized API/licensing access.

## 4. Current Data Scale foundation

### #146 — throughput audit

Merged. Proved the bottleneck is data depth/history throughput rather than agent/PR activity.

### #147 — market history architecture

Merged. Defines append-only observation history, listing-vs-observation identity, re-observation cadence/failure semantics, and a no-migration-first approach.

### #148 — market signal architecture

Merged. Defines evidence/provenance boundaries for stock/restock/demand/expectation/social signals.

### #149 — forecast truthfulness

Merged; Issue #130 closed. Metadata-only heuristics cannot create a public upcoming expectation score. Insufficient evidence fails closed.

### #150 — re-observation engine v1

Merged; Issue #128 closed; old #131 closed. Durable behavior includes append-only repeated observations, retry-safe IDs, exact identity, only `active`/`sold_out` ordinary live states, positive price, explicit availability, stale-observation rollback protection, and no fabricated `sold`.

### #153 — exact provider re-observation read v1

Merged; Issue #135 closed; old #136 closed. Exact persisted Rakuten/Yahoo identities can be re-read without keyword rediscovery. Credential-bearing requests are restricted to reviewed official host+path destinations, redirects are refused, invalid durable identity fails before request, and live Production-connected execution/persistence remains unapproved.

### #156 — Depth Collector v1

Merged; Issue #129 closed; old #132 closed. Multi-listing depth is explicit-target, strict-matcher, identity-driven, SHA-256 selection-bound, insert-only in dry-run projection, and does not stop at three listings. Production persistence/automatic activation remains separately approval-gated.

PR #156 review note: Copilot Code Review was unavailable on the current GitHub plan, and the user explicitly approved a **PR-#156-only** substitution of independent CI + strengthened Lead self-review + regression tests. This is not a global policy change.

### #159 — truthful Data Scale Scoreboard v1

Merged; Issue #126 closed; old #134 closed superseded. This is the read-only operating measurement contract.

Durable behavior:

- reports independent DATA / TRAFFIC / CLICK / REVENUE / COLLECTION HEALTH panels; no vanity single score
- metric states are distinct: `available`, `unavailable`, `not_instrumented`
- source capability states are separate: `active`, `planned`, `partnership_required`, `paid_access_required`, `manual_only`, `unavailable`
- active supported source count is separate from total capability inventory count
- X remains `paid_access_required` unless reviewed authorized fetching is enabled; absent X signal collection is `not_instrumented`, not zero interest
- Mercari remains `partnership_required`
- only actual `status=sold` is completed-sale evidence; `sold_out` is not a completed transaction
- review-required stock/restock/social rows are excluded by the domain contract
- fresh market depth is bucketed 0 / 1 / 2 / 3-4 / 5-9 / 10+, with no `3 listings = done` rule
- known listings with zero observations stay visible
- outbound click attribution is provider+variant scoped; no listing-level or revenue overclaim
- Production `ingestion_runs` counts and GitHub workflow-run counts are separate evidence sources; absent workflow instrumentation stays `not_instrumented`
- raw provider payloads are not emitted
- the CLI reads Production sequentially through the existing read helper and performs no writes/dispatches/schedule changes
- Scoreboard availability does **not** authorize #150/#153/#156 Production history/depth execution or persistence

## 5. Fresh dated Production evidence from #159 validation

Read-only Production validation during the clean #126 settlement measured:

- series: 10,241
- variants: 23,808
- market listings: 107
- active safe single listings: 106
- variants with safe active market evidence: 104
- fresh <30d depth: 96 variants ×1, 1 variant ×2, 0 variants ×3-4, ×5-9, or ×10+
- observations: 107
- listings with 0 observations: 0
- listings with exactly 1 observation: 107
- listings with 2+ observations: 0
- completed `sold`: 0
- verified affiliate provenance listings: 3
- review-safe stock reports: 0
- review-safe restock events: 0
- review-safe X reactions: 0
- outbound clicks at that validation time: 0 / 21 / 38 for 24h / 7d / 30d
- new listings / observations in that 24h window: 11 / 11
- Production DB `ingestion_runs` market rows in that 24h window: 0; this **does not** imply zero GitHub Actions runs
- unresolved `import_issues`: 133

These are dated measurements, not permanent live facts. Re-read before making current claims.

The dominant measurable weakness remains **history not enabled in Production**: all 107 known listings still had only one observation at the validation checkpoint.

## 6. Current open work

Re-fetch before acting.

### PR #145 / Issue #123 — source capability matrix — next P0 settlement

Open old-base docs-only Draft. Revalidate against current main and current official source documentation. Prefer a clean current-main replacement if safer than carrying stale history.

Key boundaries already known from the earlier research:

- Rakuten: active lawful marketplace API
- Yahoo Shopping: active lawful marketplace API
- Mercari C2C: `partnership_required`; do not scrape
- X: `paid_access_required`; do not scrape/substitute unauthorized collection
- Aucfan: promising licensed completed/sold-history route, `paid_access_required`; pricing/contract must be separately approved before purchase or credentials
- additional retailer/eBay sources remain planned/partnership-gated until an authorized API/feed/permission path is verified

The source matrix is documentation/research only. It must not itself authorize paid access, credentials, Secrets changes, scraping, or Production integration.

### PR #142 / Issue #137 — F0 rerelease canonical-year repair

Open, non-Draft, **human/approval-bound**. Do not auto-merge merely because tests/Preview pass. Merging changes code used by the scheduled Production-capable F0 official lane and can allow a future scheduled write path to proceed past the current blocker.

## 7. F0 official automatic incident

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on 2026-09-01:

- read-only audit: `OFFICIAL_READ_ONLY_PLAN_READY`
- formal lineups: 4
- proposed new series / variants: 4 / 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- DB writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 contain the repair. Keep the guard intact. Do not merge #142 or manually rerun/dispatch F0 without the required approvals.

## 8. Automatic lanes and hard repository rules

- F0 official schedule exists; repair remains #142 approval-bound.
- P3 V2 market breadth seeding remains separate from Depth Collector/re-observation; strict matcher/provenance must remain unchanged.
- Kitan manual canary already succeeded; auto gate remains off unless approved.
- Qualia one-series canary already succeeded; variant writes/auto rollout remain unapproved.
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not enable Kitan or Qualia auto without approval
- do not rerun completed Kitan/Qualia/complete-set/P2/P1 canaries without a new task-specific approval
- do not weaken the strict single-item matcher
- keep complete sets at series scope
- never mix completed/sold evidence with active asking-price evidence
- do not scrape Mercari or Amazon

## 9. Merge/release policy

`docs/AUTO_MERGE_POLICY.md` is the authoritative narrow exception allowing eligible safe, reversible PRs to merge without repeated human acknowledgement.

If merge causes only the repository's normal Vercel Production deployment, `docs/PRODUCTION_RELEASE_POLICY.md` must also pass in full.

Always stop for explicit approval when work includes Production DB mutation/migration, workflow dispatch, Secrets/Variables changes, new/material Production-capable workflow/schedule/cron/automatic ingestion, paid actions, destructive operations, direct main push, major unresolved product/security decisions, or an ineligible release.

## 10. Exact next step after this canonical sync

After Issue #160's docs-only PR is exact-head green, merged, and its normal Vercel Production deployment is READY:

1. Re-fetch `main`, Issue #123, and old Draft PR #145.
2. Revalidate the source-capability research against current official documentation and current Scoreboard vocabulary.
3. Do not blindly merge stale #145; clean-replace from current main when safer.
4. Keep paid/partnership/scraping/credential boundaries explicit and unchanged.
5. Run exact-head CI, Preview, full-diff review, and current-main drift check.
6. Merge only if Auto-Merge + Standing Release gates pass.
7. After that, decide the next Data Scale step from live Scoreboard evidence, while keeping Production history/depth rollout separately approval-gated.
8. Keep #142 at its explicit F0 Production-impact approval boundary.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
