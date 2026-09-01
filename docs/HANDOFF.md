# Gacha Lens Canonical Handoff

Updated: 2026-09-01 JST — post-PR #153 checkpoint

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Prefer newer live GitHub/Vercel/Supabase evidence over dated values in this file. Historical detail remains in Git history and linked Issues/PRs; this file is optimized for safe continuation from the current state.

## 1. Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs, relevant Issues, recent Actions, and Vercel deployment state before implementation.
3. Prefer existing durable Issue/branch/PR work over creating duplicates.
4. Do not repeat completed Production canaries/diagnostics only to refresh context.
5. Do not perform Production DB writes, migrations/backfills/cleanup, `workflow_dispatch`, Secrets/Variables changes, paid actions, destructive actions, direct pushes to `main`, or ineligible merges/releases without required approval.
6. Safe reversible PRs may use `docs/AUTO_MERGE_POLICY.md`; their normal Git-triggered Vercel release may use `docs/PRODUCTION_RELEASE_POLICY.md` only when every gate passes.
7. After a major Production/recovery/security/release milestone, synchronize the canonical four files before starting the next major implementation phase. Do not rely on chat-length warnings.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production: `https://gachalens.com`

Supabase Production project: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

Old inactive Supabase project: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse it with Production.

Vercel project: `karakuri3s-projects/gachalens`

Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## 2. Verified checkpoint

Verified `main` before this canonical-sync PR:

`af5356148cb75975f13383d095e01a805e7120db`

Latest merged implementation PR:

- PR #153 — `P0 Data Scale: harden exact provider re-observation dry-run`

PR #153 normal Git-triggered Vercel Production deployment:

- deployment: `dpl_9srsV4znx24SK7mmC9AX2Vkds7Pw`
- state: `READY`
- commit: `af5356148cb75975f13383d095e01a805e7120db`

PR #153 exact-head validation passed full Node tests, lint, diff whitespace, Vercel Preview, and independent security/collection review before merge. Production DB writes, workflow dispatches, Secrets/Variables changes, paid/API activation, destructive actions, and live provider execution performed by this milestone: **0**.

Issue #135 is closed completed. Old stacked Draft PR #136 is closed as superseded by #153.

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
- measurable DATA -> TRAFFIC -> CLICK -> REVENUE movement

Mercari remains `partnership_required`; do not scrape it. Do not scrape Amazon. X/social must use authorized API/licensing access.

## 4. Current Data Scale foundation

### #146 — throughput audit

Merged. Established that the immediate bottleneck is data depth/history throughput rather than agent/PR activity.

### #147 — market history architecture

Merged. Defines append-only observation history, listing-vs-observation identity, re-observation cadence/failure semantics, and a no-migration-first approach.

### #148 — market signal architecture

Merged. Defines evidence/provenance boundaries for stock/restock/demand/expectation/social signals.

### #149 — forecast truthfulness

Merged; Issue #130 closed. Metadata-only heuristics cannot create a public upcoming expectation score. Insufficient evidence fails closed.

### #150 — re-observation engine v1

Merged; Issue #128 closed; old #131 closed. Durable behavior:

- one known listing can accumulate repeated append-only observations
- deterministic observation IDs are retry-safe per listing/provider/logical bucket
- persisted and fetched marketplace identity must match
- ordinary live states are only `active` / `sold_out`; no fabricated completed `sold`
- unchanged observations remain valid time evidence
- price/status changes plan only allowlisted current-snapshot fields
- not-found/throttled/provider-error create no lifecycle mutation
- unknown provider availability fails closed
- missing/zero/negative/invalid prices fail closed
- stale observations cannot roll the current snapshot backward
- dry-run summaries expose projected writes while `production_actions` remains `0`

### #153 — exact provider re-observation read v1

Merged; Issue #135 closed; old #136 closed. The code can re-read already-persisted Rakuten/Yahoo listing identities through exact provider requests and feed #150 without keyword rediscovery.

Security and truthfulness contract:

- Rakuten exact reads use the reviewed official `openapi.rakuten.co.jp` API destination and exact path
- Yahoo exact reads use the reviewed official `shopping.yahooapis.jp` `itemLookup` destination and exact path
- arbitrary HTTPS hosts are rejected; TLS alone does not authorize credential delivery
- HTTP, embedded username/password, pre-supplied query strings, and fragments fail closed
- provider requests use `redirect: error`
- invalid durable listing identity fails before provider request
- Rakuten `accessKey` stays header-only in this lane; Yahoo `appid` remains confined to the reviewed request destination
- provider response identity must remain exact
- positive integer price and explicit availability are required
- provider failure/not-found never fabricates `sold`
- runner is bounded, serial, sanitized, and read-only
- live Production-connected provider execution and DB persistence are **not authorized** by this merge

## 5. Current open work

Re-fetch before acting because state can change.

### PR #132 / Issue #129 — multi-listing Depth Collector — next implementation

Open old-base Draft. This is the first implementation after the post-#153 canonical sync completes.

Purpose:

- move beyond 0->1 breadth seeding
- retain many legitimate distinct offers for the same variant
- dedupe by durable listing/provider item/canonical URL identity, not price/title
- preserve strict matcher, target variant/series scope, and affiliate provenance
- treat request limits as operational safety budgets, not completion targets

Do not merge old branch as-is. Re-fetch its diff against current main and prefer a clean current-main replacement or narrowly justified rebase. Keep Production persistence/automation separately approval-gated.

### PR #134 / Issue #126 — Data Scale Scoreboard

Open old-base Draft. Read-only measurement for catalog breadth, market depth, observation history, provider split, affiliate provenance, stock/restock/social availability, clicks, and DATA -> TRAFFIC -> CLICK -> REVENUE health.

Settle after #132 unless new verified evidence changes priority. Keep `sold` distinct from `sold_out`; unavailable/uninstrumented states must not be invented as zero.

### PR #145 / Issue #123 — source capability matrix

Open old-base docs-only Draft. Revalidate after higher-priority data-generation/measurement lanes. It must not authorize paid access, scraping, Secrets changes, or Production integration.

### PR #142 / Issue #137 — F0 rerelease canonical-year repair

Open, non-Draft, **human/approval-bound**. Do not auto-merge merely because tests/Preview pass. Merging changes code used by the scheduled Production-capable F0 official lane and can allow a future scheduled write path to proceed past the current blocker.

## 6. Dated Production scale evidence

Do not silently treat these counts as live forever.

Issue #119 earlier 2026-09-01 snapshot recorded:

- series: 10,241
- variants: 23,808
- market listings: 96
- observations: 96
- listings with 2+ observations: 0
- completed/sold evidence: 0

Issue #128 later recorded 101 market listings / 101 observations, still one observation per known listing at that checkpoint.

A later same-day read found `outbound_clicks` 68 while `stock_reports`, `restock_events`, and `x_reactions` were 0. Treat these as dated evidence until freshly re-read.

#150 and #153 provide code contracts for history generation, but no live Production history-writing rollout has been authorized.

## 7. F0 official automatic incident

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on 2026-09-01:

- read-only audit: success / `OFFICIAL_READ_ONLY_PLAN_READY`
- formal lineups: 4
- proposed new series: 4
- proposed new variants: 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- DB writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 contain the repair. Keep the safety guard intact. Do not merge #142 or manually rerun/dispatch F0 without the required explicit approvals.

## 8. Automatic lanes and hard repository rules

F0 official:

- schedule exists
- latest investigated run failed safely as above
- repair pending PR #142 approval/review

P3 V2 market:

- bounded breadth-seeding schedule remains separate from depth collection/re-observation
- strict matcher/provenance must remain unchanged

Kitan:

- manual canary already succeeded
- automatic write gate remains off by default
- do not rerun/enable without approval

Qualia:

- one-series canary already succeeded
- series-only / insert-only boundary remains
- variant writes and automatic rollout remain unapproved

Hard rules:

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan or Qualia automatic writes without approval
- do not rerun completed Kitan, Qualia, complete-set, P2, or P1 canaries without new task-specific approval
- do not weaken the strict single-item matcher
- keep complete sets at series scope; never contaminate variant prices
- never mix completed/sold evidence with active asking-price evidence
- do not scrape Mercari or Amazon

## 9. Merge/release policy

`docs/AUTO_MERGE_POLICY.md` is the authoritative narrow exception allowing eligible safe, reversible PRs to merge without repeated human acknowledgement.

If merge causes only the repository's normal Vercel Production deployment, `docs/PRODUCTION_RELEASE_POLICY.md` must also pass in full.

Always stop for explicit approval when work includes Production DB mutation/migration, workflow dispatch, Secrets/Variables changes, new/material Production-capable workflow/schedule/cron/automatic ingestion, paid actions, destructive operations, direct main push, major unresolved product/security decisions, or an ineligible release.

## 10. Exact next step after this canonical sync

After Issue #154's docs-only PR is exact-head green, merged, and its normal Vercel Production deployment is READY:

1. Re-fetch `main`, Issue #129, and old Draft PR #132.
2. Inspect its exact diff against current main; do not blindly merge stale history.
3. Build a clean current-main replacement if needed, preserving only the Depth Collector contract and tests.
4. Verify many distinct legitimate offers for one target variant remain retained while duplicate/unsafe/set/ambiguous identities fail closed.
5. Preserve strict matcher/provenance; do not make `3 listings` a stopping target.
6. Run exact-head full tests, lint, diff check, Vercel Preview, and independent collection-semantics review.
7. Merge only if Auto-Merge + Standing Release gates pass.
8. Keep Production depth persistence/automatic activation as a separate approval-gated rollout.
9. Then settle #134 Scoreboard, followed by #145 source capability matrix unless newer evidence changes priority.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
