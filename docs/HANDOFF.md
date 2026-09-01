# Gacha Lens Canonical Handoff

Updated: 2026-09-01 JST

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Git/GitHub facts below were re-verified during the 2026-09-01 recovery. Production/Supabase/GSC claims are dated evidence and must not be silently promoted to current truth without a fresh allowed read.

## 1. Resume protocol

On every fresh thread/task:

1. Read this file, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `origin/main`, open PRs, relevant Issues, Actions, and active worktrees before starting implementation.
3. Prefer newer live GitHub evidence over stale chat summaries.
4. Do not repeat completed diagnostics/canaries merely to refresh context.
5. Do not perform a Production write, `workflow_dispatch`, Secrets/Variables change, destructive action, paid action, or ineligible merge without the required explicit approval.
6. Resume a single durable claim before creating duplicate work, then follow the first applicable unchecked item in `docs/TODO.md` unless newer evidence changes priority.
7. After a major Production/recovery/security/release milestone, update these canonical files before starting the next major phase. Do not wait for chat-length warnings.

Repository: `karakuri3/Gacha-Lens`

Preferred local path: `C:\dev\Gacha-Lens`

Production domain: `https://gachalens.com`

Verified `main` at this checkpoint:

`11db0433a8493704acb9935b6f5c48c747788273`

Latest merged PR at this checkpoint:

- PR #122 — `Agent Queue: add bounded one-shot orchestrator`

PR #141 added `.github/workflows/pr-code-quality.yml`, a `pull_request`-only, `contents: read` validation lane that runs `npm ci`, the full `npm test` suite, `npm run lint`, and `git diff --check`. It has no schedule, no `workflow_dispatch`, no Production credentials, no ingestion command, and no repository write. Exact-head CI and Vercel Preview passed before merge; the normal Git-triggered Vercel Production deployment for merge SHA `be4da14...` also reached success.

## 2. Product purpose and current P0

Gacha Lens is a gachapon market-intelligence product whose customer promise is:

**「欲しいガチャを、見つけて、比べて、逃さない」**

The product is not a three-listing demo. The current business/product program is Issue #119:

**`[P0] Data Scale Program: build comprehensive market-data collection`**

Issue #119 supersedes the older habit of optimizing around “3 active listings” as a collection target. Three active listings remain only a truthful presentation threshold. The actual target is comprehensive lawful data coverage over time:

- broad marketplace/source coverage
- many independent listings per variant where available
- repeated observations for price/inventory history
- completed/sold evidence where authorized
- stock/inventory and restock/re-release history
- official schedule/MSRP/lineup truth
- explainable demand/popularity/expectation signals
- authorized X/social signals
- click/search/purchase-intent evidence
- provider/source provenance and measurable collection health

Mercari remains a strategic future `partnership_required` target. Do not scrape Mercari or Amazon. X/social data must use authorized API/licensing access; record `paid_access_required` or `partnership_required` when appropriate instead of substituting unauthorized collection.

Monetization remains primarily:

- Amazon Associates
- Rakuten affiliate
- Yahoo Shopping / ValueCommerce
- Google AdSense after traffic/content readiness improves

Business work should be judged by **DATA -> TRAFFIC -> CLICK -> REVENUE**, not PR count or agent activity.

## 3. Technology and data model

Stack:

- Next.js App Router / React
- Supabase
- Vercel
- GitHub Actions
- Node.js ingestion/diagnostic scripts

Core data concepts:

- `series`
- `variants`
- `market_listings`
- `market_listing_observations`
- `restock_events`
- `stock_reports`
- `x_reactions`
- `import_issues`
- `outbound_clicks`

Public product behavior remains **Series-first for discovery, Variant-first for market evidence**:

`browse/search -> series -> lineup -> variant detail`

Variant-first remains appropriate for price evidence/history and expensive/rising/rare views. Preserve image truthfulness; never present an image as variant-specific without evidence proving that scope.

## 4. Production scale evidence

Supabase Production project:

`vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)

The old inactive project is `ihcudkfspzuixsqsvoku` (`gacha-site-start`). Never confuse it with Production.

Issue #119 records the following Production scale evidence for 2026-09-01 JST:

| Metric | 2026-09-01 evidence recorded in #119 |
| --- | ---: |
| series | 10,241 |
| variants | 23,808 |
| market listings | 96 |
| market listing observations | 96 |
| active safe single listings | 95 |
| Yahoo listings | 51 |
| Rakuten listings | 45 |
| listings with 2+ observations | 0 |
| completed/sold evidence | 0 |
| fresh variants with 1 listing | 85 |
| fresh variants with 2 listings | 1 |
| fresh variants with 3+ listings | 0 |

Treat these as the dated Issue #119 evidence snapshot, not a perpetual live count. Re-read through an allowed path before claiming current counts later.

This snapshot establishes the immediate Data Scale bottleneck: breadth exists only at tiny market depth, every persisted listing had exactly one observation, and there was no completed-sale evidence.

Stable Vercel identity:

- team/project: `karakuri3s-projects/gachalens`
- project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`

## 5. Current Data Scale implementation queue

The following PRs were open during the 2026-09-01 recovery. Re-fetch before acting because state may change after this document is merged.

### PR #131 — re-observation engine

- branch: `codex/p0-reobservation-v1`
- dry-run/code-only repeated-observation contract
- deterministic retry-safe observation identity
- strict marketplace identity comparison
- append-only observation history planning
- ordinary live states restricted to `active` / `sold_out`; this lane cannot fabricate `sold`
- a post-PR review found and repaired a 0-yen acceptance bug
- Vercel Preview succeeded on repaired head
- was awaiting full exact-head generic CI/review at the prior checkpoint

### PR #136 — exact provider re-observation read

- stacked on PR #131
- branch: `codex/p0-reobservation-provider-read-v1`
- exact persisted Rakuten/Yahoo identity re-reads through official provider APIs
- no keyword rediscovery
- serial pacing, bounded retries/timeouts, sanitized diagnostics
- dry-run/read-only; no observation/listing mutation authorized

### PR #132 — depth collector

- dry-run/code-only collector for many distinct legitimate offers per variant
- preserves strict P3 candidate safety semantics
- does not stop at one listing/variant or three listings
- operational budget is a request bound, not a completion target

### PR #133 — forecast truthfulness

- metadata alone cannot create a public upcoming expectation score
- public forecast requires at least two independent evidence families
- insufficient evidence produces `total: null` / `算出待ち`
- no paid X activation or Production ingestion change

### PR #134 — Data Scale Scoreboard

- read-only deterministic scoreboard for DATA -> TRAFFIC -> CLICK -> REVENUE progress
- distinguishes `available`, `unavailable`, and `not_instrumented`
- tracks breadth, depth, history, providers, provenance, signal states, clicks, deltas, and bottlenecks
- Mercari remains `partnership_required`; X remains not instrumented unless reviewed access exists

Independent Verifier + Reviewer remain mandatory for changes that affect collection semantics under Issue #119.

## 6. F0 official automatic incident — 2026-09-01

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on `main` SHA `3e633b1fe591aadd5e02e409104aa0214457c527`.

Important: this was a **fail-closed safety stop, not a Production data-corruption event**.

Verified run evidence:

- read-only official audit: success / `OFFICIAL_READ_ONLY_PLAN_READY`
- formal lineups: 4
- proposed new series: 4
- proposed new variants: 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- database writes: 0
- deletes: 0
- final blocker: `official_bounded_rerelease_canonical_release_mismatch`

Affected candidate:

- `gashapon-4549660515777000`
- `【箱売】機動戦士ガンダム MOBILE SUIT ENSEMBLE 15`
- official original-release evidence: `2020年10月`
- current rerelease schedule: `2026年9月 第4週`

The candidate canonical release was correctly resolved to year/month precision, but restock-event generation treated the same in-memory resolved fetch record as though it were an existing persisted series. Because a month-only persisted series shape carries no standalone year, event sanitization collapsed `canonical_release` to `null`. The downstream canonical-consistency guard then correctly blocked the run.

Issue #137 records the repair contract.

Current replacement repair PR at this checkpoint:

- PR #142 — `F0 official auto: preserve month-precision rerelease canonical year`
- branch/head: `codex/issue-137-rerelease-canonical-year` / `9e901e012e3a5dc776250ccc72923830aed6b1de`
- full `npm test`: PASS
- lint: PASS
- `git diff --check`: PASS
- Vercel Preview: PASS
- workflow/schedule changes: 0
- Production actions by the PR: 0
- safety guard weakening: 0

PR #142 must **not** be merged merely because code validation passes. Merging changes code used by the scheduled Production-capable F0 lane; a future schedule may then proceed past the blocker and perform its existing bounded write path. Keep merge/Production activation at the explicit approval boundary required by the Production policies. Do not manually rerun/dispatch F0 as a substitute.

The connected GitHub path could not successfully register Copilot as an independent reviewer at this checkpoint, and the connected Vercel review URL required an interactive Vercel login. Do not falsely claim independent review has passed; re-attempt an available independent Reviewer or obtain human review before treating the collection-semantics review gate as complete.

## 7. Automatic lanes at recovery

### F0 official

- automatic schedule exists
- latest investigated schedule failed safely as described above
- do not weaken canonical/safety gates
- repair is pending approval/review through PR #142

### P3 V2 market

- scheduled bounded breadth-seeding lane remains active
- run `33488346438` succeeded on 2026-09-01
- keep strict matcher/provenance safety
- do not confuse this breadth-seeding lane with the required future depth/re-observation architecture

### Kitan

- historical manual canary succeeded
- automatic gate remains false by default
- run `33484658907` succeeded at the automatic workflow level during the 2026-09-01 recovery; this does not authorize enabling writes if the false-by-default gate is still off
- do not rerun the manual canary or enable Kitan automatic writes without explicit approval

### Qualia

- historical one-series Production canary succeeded
- series-only, insert-only, conservative boundary remains
- variant writes remain prohibited in this phase
- automatic rollout remains unapproved

## 8. Existing market/SEO safety contracts

Approved current programmatic marketplace sources:

1. Yahoo Shopping API
2. Rakuten Ichiba API
3. approved JSON/CSV feeds

Do not scrape Mercari or Amazon.

Presentation evidence thresholds remain:

- active >= 3 -> `LISTING_GUIDE`
- completed >= 3 -> `REFERENCE`
- completed >= 5 -> `SOLD`

These are presentation/evidence thresholds, **not Data Scale collection targets**.

Never mix completed/sold evidence into active asking-price evidence. Do not weaken the strict single-item matcher merely to increase coverage. Complete sets remain series-level evidence and must not contaminate variant prices.

SEO observer separation remains:

- `/sitemap.xml`
- `/series-sitemap.xml`
- `/variant-sitemap.xml`

Preserve self-canonical indexable pagination and existing noindex behavior for intended search/filter combinations. Do not mass-noindex or remove pages without current GSC evidence.

The last older GSC snapshot in the previous handoff was dated 2026-08-27 and must be re-read before current claims.

## 9. Agent OS and validation baseline

Authoritative operating files:

- `AGENTS.md`: mandatory entry point and hard stops
- `docs/AGENT_OS.md`: lifecycle, task contract, roles, worktrees, Done Gate, and queue conventions
- `docs/AGENT_QUEUE.md`: authoritative one-shot selection, duplicate prevention, two-Builder cap, continuation, terminal outcomes, and durable resume
- `docs/AUTO_MERGE_POLICY.md`: authoritative exception for eligible safe, reversible, non-Production PRs
- `docs/PRODUCTION_RELEASE_POLICY.md`: authoritative exception for the normal Vercel Production release triggered by an eligible merge
- `.github/ISSUE_TEMPLATE/agent-task.yml`: task contract
- `.github/pull_request_template.md`: implementation and gate evidence

One task uses one dedicated `codex/` branch and worktree from verified `origin/main`. Ordinary safe failures enter the diagnose/repair/revalidate loop. A PR may be marked ready and merged autonomously only when the complete Auto-Merge Gate passes. Its normal Git-triggered Vercel release may proceed only when the Standing Production Release Gate also passes; otherwise stop at the smallest real approval boundary.

Measured Agent OS experiments #108, #112, #114, and #118 proved the documentation-only run, bounded code run, independent roles, and two disjoint Builders. Queue / Orchestrator v1 merged in PR #122; a fresh one-shot run must use `docs/AGENT_QUEUE.md` and durable GitHub state rather than chat memory.

As of PR #141, ordinary PRs targeting `main` now have generic non-Production CI for:

- full Node tests
- ESLint
- diff whitespace

Vercel remains the non-Production build/Preview evidence. JavaScript-only typecheck remains `N/A` unless repository configuration changes.

Do not interpret the generic PR CI as authorization for Production actions. External/Production commands (`db:*`, `ingest:*`, `fetch:*`, `official:*`, `market:*`, cleanup, remote audits, `workflow_dispatch`) remain governed by task-specific approval boundaries.

## 10. Approval and hard safety boundaries

Explicit approval remains required for:

- Production DB writes/migrations/backfills/cleanup/schema/seed/reset outside already-approved normal behavior
- GitHub Actions `workflow_dispatch`
- Production deployments, promotions, or gate changes excluded by `docs/PRODUCTION_RELEASE_POLICY.md`
- Repository or service Secrets / Variables changes
- new/materially changed Production-capable workflow, schedule, cron, ingestion lane, or gate
- paid operations
- destructive/irreversible actions
- direct pushes to `main`
- any PR merge excluded by `docs/AUTO_MERGE_POLICY.md`
- auth/security-boundary changes or major product decisions

Eligible safe, reversible, non-Production PRs are the narrow merge exception defined by `docs/AUTO_MERGE_POLICY.md`. Only their normal Git-triggered Vercel Production release may use the separate narrow exception in `docs/PRODUCTION_RELEASE_POLICY.md`.

Hard repository rules:

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan or Qualia auto without explicit approval
- do not rerun completed Kitan, Qualia, complete-set, P2, or P1 canaries without a new task-specific approval
- do not weaken the strict single-item matcher
- do not scrape Mercari or Amazon

## 11. Current resume point

If a new thread receives only **“Gacha Lens続けて”**, do this:

1. Re-fetch `main`, open PRs, #119, #137/#142, and latest Actions.
2. Confirm the F0 repair/review/approval state before assuming official automatic ingestion is healthy again.
3. Do not manually rerun F0 or merge PR #142 without the required approval/review gate.
4. Continue safe non-Production Data Scale work from Issue #119 and `docs/TODO.md`.
5. Use the new generic PR CI to validate Data Scale PRs #131/#132/#133/#134/#136 as they are updated/rebased.
6. Prefer finishing/verifying existing Draft work over creating redundant parallel implementations.
7. After the next major milestone, sync `HANDOFF.md`, `STATUS.md`, `DECISIONS.md`, and `TODO.md` before starting the following phase.

Immediate business bottleneck remains **Data Scale**, especially repeated observations and multi-listing depth, followed by traffic, click/conversion volume, and revenue.
