# Gacha Lens Canonical Handoff

Updated: 2026-09-01 JST — post-PR #150 checkpoint

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Prefer newer live GitHub/Vercel/Supabase evidence over dated values in this file. Historical detail remains available in Git history and the linked Issues/PRs; this file is intentionally optimized for safe continuation from the current state.

## 1. Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs, relevant Issues, recent Actions, and Vercel deployment state before implementation.
3. Prefer existing durable Issue/branch/PR work over creating duplicates.
4. Do not repeat completed Production canaries/diagnostics only to refresh context.
5. Do not perform Production DB writes, migrations/backfills/cleanup, `workflow_dispatch`, Secrets/Variables changes, paid actions, destructive actions, direct pushes to `main`, or ineligible merges/releases without the required approval.
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

`53cbfabb8916e6647dde3d18423d855899df80d0`

Latest merged implementation PR:

- PR #150 — `P0 Data Scale: add safe dry-run re-observation engine`

PR #150 normal Git-triggered Vercel Production deployment:

- deployment: `dpl_3Wo9ToRQVUDWwftN58NzUbbi4q7F`
- state: `READY`
- commit: `53cbfabb8916e6647dde3d18423d855899df80d0`
- aliases include `gachalens.com` and `www.gachalens.com`

PR #150 exact-head validation passed full Node tests, lint, diff whitespace, and Vercel Preview before merge. Production DB writes, workflow dispatches, Secrets/Variables changes, paid/API activation, destructive actions, and external writes performed by the PR: **0**.

## 3. Product purpose and current P0

Gacha Lens is a gachapon market-intelligence product whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella program: Issue #119 — **Data Scale Program**.

The product is not complete when three listings exist. Three active listings remain only a truthful presentation threshold. The actual objective is compounding lawful data coverage:

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

## 4. Data Scale work completed in this checkpoint sequence

### PR #144 — recovery canonical sync

Recovered the project after the prior thread hit its limit and refreshed the canonical state around Issue #119 and the F0 incident.

### PR #145 — source capability matrix

Still open Draft at this checkpoint; docs-only work identifying lawful source expansion paths. Treat its facts as proposal/evidence until the PR is revalidated/rebased/merged.

### PR #146 — throughput audit

Merged. Quantified the current collection bottleneck and established that the problem is data depth/history throughput, not merely code/agent activity.

### PR #147 — market history architecture

Merged. `docs/MARKET_HISTORY_ARCHITECTURE.md` defines append-only observation history, listing-vs-observation identity, re-observation cadence principles, failure semantics, and a no-migration-first approach.

### PR #148 — evidence-backed market signal architecture

Merged. `docs/MARKET_SIGNAL_ARCHITECTURE.md` defines truthful component/provenance boundaries for future demand/expectation signals.

### PR #149 — forecast truthfulness repair

Merged; Issue #130 closed. Metadata-only heuristics can no longer produce a public upcoming expectation score. Insufficient evidence fails closed to `null` / `算出待ち`. Old Draft #133 was superseded and closed.

### PR #150 — re-observation engine v1

Merged; Issue #128 closed. Old Draft #131 was superseded and closed.

Current reusable domain contract:

- one known listing can accumulate repeated append-only observations
- deterministic observation identity is retry-safe per listing/provider/logical bucket
- persisted and fetched marketplace identity must match exactly
- ordinary live states are only `active` / `sold_out`; this lane cannot fabricate completed `sold`
- unchanged observations are valid time evidence
- price/status changes plan only allowlisted current-snapshot fields
- not-found/throttled/provider-error create no lifecycle mutation
- unknown provider availability fails closed
- missing/zero/negative/invalid prices fail closed
- an observation older than `last_observed_at` fails closed with `stale_observation_time` so the current snapshot cannot roll backward
- dry-run summaries expose projected writes while `production_actions` remains `0`

## 5. Current open work

Re-fetch before acting because state can change.

### PR #136 — exact provider re-observation read

Open Draft, originally stacked on the old #131 branch. It should **not** be merged as-is.

Positive design already present:

- exact persisted Rakuten/Yahoo item identity reads
- no keyword rediscovery
- bounded retries/timeouts
- serial provider pacing
- sanitized diagnostics
- dry-run/read-only runner
- no DB persistence authorization

Independent review after #150 found an additional security boundary:

- the old code permits a configurable arbitrary HTTPS `options.endpoint`
- Rakuten requests carry `accessKey` in a header
- Yahoo requests carry `appid` in the query
- therefore a misconfigured/untrusted custom HTTPS endpoint could receive provider credentials/identifiers

**Required next repair:** create a clean replacement from current `main`, port only the five #135 files, and lock outbound provider requests to the reviewed official API host + path (or an equivalently strict allowlist) before merge consideration. Tests must prove an arbitrary HTTPS host is rejected. Keep the lane code-only/dry-run; do not execute live Production-connected provider reads or persist observations without the separate required approval.

### PR #132 — multi-listing depth collector

Open Draft on an old base. Purpose is to retain many legitimate distinct offers per variant under strict existing matcher/provenance rules. Revalidate/rebase or clean-replace after the provider-read step; do not preserve the old one-listing/three-listing stopping habit.

### PR #134 — Data Scale Scoreboard

Open Draft on an old base. Read-only measurement for breadth, depth, history, providers, signals, clicks, and DATA -> TRAFFIC -> CLICK -> REVENUE. Revalidate/rebase or clean-replace before merge.

### PR #145 — source capability matrix

Open Draft docs-only source research. Revalidate against current main before merge. It must not authorize paid access, scraping, Secrets changes, or Production integrations.

### PR #142 — F0 rerelease canonical-year repair

Open, non-Draft, **human/approval-bound**. Do not auto-merge merely because tests/Preview pass. Merging changes code used by the scheduled Production-capable F0 official lane and can allow a future scheduled write path to proceed past the current blocker.

## 6. Dated Production scale evidence

Do not silently treat these counts as live forever.

Issue #119 earlier 2026-09-01 snapshot recorded:

- series: 10,241
- variants: 23,808
- market listings: 96
- market listing observations: 96
- listings with 2+ observations: 0
- completed/sold evidence: 0

Issue #128 later recorded a 2026-09-01 baseline of **101 market listings / 101 observations**, again with one observation per known listing at that time.

A later read in the same recovery session found `outbound_clicks` had 68 rows while `stock_reports`, `restock_events`, and `x_reactions` were still 0. Treat those as dated evidence unless freshly re-read.

The key bottleneck remains: market breadth is thin and history depth is nearly nonexistent. #150 supplies the reusable re-observation contract, but no Production history-writing rollout has been authorized yet.

## 7. F0 official automatic incident

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on 2026-09-01.

Verified:

- read-only audit: success / `OFFICIAL_READ_ONLY_PLAN_READY`
- formal lineups: 4
- proposed new series: 4
- proposed new variants: 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- DB writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Affected rerelease candidate retained original release `2020年10月`, but restock-event generation lost the original year for month-precision canonical release. The downstream guard correctly blocked writes.

Issue #137 / PR #142 contain the repair. Keep the safety guard intact. Do not manually rerun/dispatch F0 without separate `workflow_dispatch` approval.

## 8. Automatic lanes and hard repository rules

F0 official:

- schedule exists
- latest investigated run failed safely as above
- repair pending PR #142 review/approval

P3 V2 market:

- bounded breadth-seeding schedule remains active unless newer evidence says otherwise
- strict matcher/provenance must remain unchanged
- do not confuse breadth seeding with depth collection/re-observation

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

Always stop for the explicit approval boundary when work includes Production DB mutation/migration, workflow dispatch, Secrets/Variables changes, new/material Production-capable workflows, paid actions, destructive operations, direct main push, major product/security decisions, or an ineligible release.

## 10. Exact next step after this canonical sync

After the canonical-sync PR from Issue #151 is green and merged:

1. Re-fetch `main` and PR #136.
2. Create a **clean current-main replacement** for #136/#135 rather than merging the old stacked branch.
3. Port only the provider-read/runner/docs/tests work.
4. Repair the credential-routing boundary by accepting only reviewed official Rakuten/Yahoo API host+path destinations; arbitrary HTTPS custom hosts must fail closed before any request.
5. Run full exact-head tests, lint, diff check, Vercel Preview, and independent review.
6. Merge only if Auto-Merge + Standing Release gates pass.
7. Do **not** execute live Production-connected provider re-observation or persist observations. That rollout remains a separate approval-gated task.
8. Then proceed to clean validation/integration of #132 depth collector and #134 Scoreboard, preferring existing work over duplicates.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
