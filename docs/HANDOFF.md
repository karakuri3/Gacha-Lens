# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-PR #162 checkpoint

This is the canonical operational handoff for resuming Gacha Lens in a fresh ChatGPT/Codex task. Prefer newer live GitHub/Vercel/Supabase/provider evidence over dated values here. Historical detail remains in Git history and linked Issues/PRs; this file is optimized for safe continuation from the current state.

## 1. Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AGENT_QUEUE.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs, relevant Issues, recent Actions, Vercel deployment state, and any live provider/Production evidence needed before acting.
3. Prefer existing durable Issue/branch/PR work over creating duplicates.
4. Do not repeat completed Production canaries/diagnostics merely to refresh context.
5. Do not perform Production DB writes, migrations/backfills/cleanup, live Production-connected provider execution, `workflow_dispatch`, Secrets/Variables changes, paid actions, contractual commitments, destructive actions, direct pushes to `main`, or ineligible merges/releases without required approval.
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

Current merged `main` / Production checkpoint before this canonical-sync PR:

`94ea0d8aac95e76e657326bc6c6df515f8603f22`

Latest merged milestone:

- PR #162 — `P0 Data Scale: refresh lawful source capability matrix`
- Issue #123: closed completed
- old Draft PR #145: closed as superseded by #162

PR #162 normal Git-triggered Vercel Production deployment:

- deployment: `dpl_Bp4p6evfsMsqideLzDg39uPmdzqA`
- state: `READY`
- commit: `94ea0d8aac95e76e657326bc6c6df515f8603f22`
- aliases include `gachalens.com`, `www.gachalens.com`, and `gachalens.vercel.app`

PR #162 exact-head validation:

- exact head: `b7d3a2215fe420e88a47eddc32b32c03be4a945e`
- PR Code Quality run `33531641763`: full Node tests PASS, lint PASS, diff whitespace PASS
- exact-head Preview `dpl_DxzDWG9jdYkRVac3ZTADsamhYgjg`: READY
- branch behind main: 0
- diff: exactly one new docs file, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`
- full-diff/source-claim Lead review: PASS with no blocking findings
- Production DB writes, provider credential use, workflow dispatch/schedule changes, Secrets/Variables changes, paid/API activation, scraping, contractual commitments, destructive actions, and live provider execution: **0**

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

## 4. Current Data Scale foundation

### #146 — throughput audit

Merged. Proved the immediate bottleneck is data depth/history throughput rather than agent/PR activity.

### #147 — market history architecture

Merged. Defines append-only observation history, listing-vs-observation identity, cadence/failure semantics, and a no-migration-first approach.

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

Merged; Issue #126 closed; old #134 closed. This is the read-only operating measurement contract.

Durable behavior:

- independent DATA / TRAFFIC / CLICK / REVENUE / COLLECTION HEALTH panels
- metric states: `available`, `unavailable`, `not_instrumented`
- source capability states are separate from metric states
- only actual `status=sold` is completed-sale evidence; `sold_out` is not a completed transaction
- review-required stock/restock/social rows are excluded
- market depth is bucketed 0 / 1 / 2 / 3-4 / 5-9 / 10+, with no `3 listings = done` rule
- known listings with zero observations stay visible
- current outbound-click attribution is provider+variant scoped, not listing-level/revenue attribution
- Production `ingestion_runs` and GitHub workflow-run evidence are separate
- raw provider payloads are not emitted
- Scoreboard availability does not authorize Production history/depth execution or persistence

### #162 — lawful source capability matrix

Merged; Issue #123 closed; old #145 closed superseded. Canonical source research is now `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.

Durable source conclusions as verified 2026-09-02:

- **Rakuten Ichiba API:** `active` for current lawful marketplace breadth/exact re-observation capability.
- **Yahoo Shopping API / ValueCommerce:** `active` for current lawful marketplace breadth/exact item capability.
- **Bandai / Takara Tomy Arts:** active official catalog/release sources inside existing repository contracts.
- **Kitan Club:** source capability exists; prior bounded/manual canary succeeded; automatic writes remain off.
- **Qualia:** limited conservative official capability; automatic/broad variant rollout remains unapproved.
- **Aucfan:** `paid_access_required`; strongest identified licensed/commercial candidate for completed-sale/history. Contract fields, marketplace composition, storage/display/derived-data rights, rates, retention, pricing and public-product use rights require diligence before any payment or implementation.
- **Yahoo Auctions broad public API:** current broad market API is unavailable; the old Auctions Web API was retired. Do not treat seller/order APIs as a market-history substitute.
- **Mercari C2C:** `partnership_required`; do not scrape. It remains a strategic future data-partnership target.
- **Mercari Shops Public API:** an official seller/shop API exists, but it is authenticated-shop scoped. It is **not** broad C2C market intelligence and must not be used as if it were.
- **X API:** `paid_access_required`; current access/pricing/search scope is time-sensitive and must be rechecked immediately before any activation. No credits/credentials/spend were approved by #162.
- **eBay Browse:** lower-priority `planned`; current Buy API supported-marketplace list did not include Japan at verification, and Marketplace Insights historical access was restricted/not open to new users.
- **Surugaya / Mandarake / AmiAmi broad automation:** partnership/permission diligence first; public pages are not automatic scraping permission.
- **Gacha Lens outbound clicks:** active first-party provider+variant purchase-intent evidence, not transaction evidence.
- **Google Search Console reporting:** current connected GSC Wizard path returned subscription/payment-required during #162 verification. Treat current reporting as `unavailable`, not zero; this is not a claim that Search Console itself is unavailable.

Provider prices, quotas, supported markets, product tiers and licensing terms are **dated facts**, not durable constants. Recheck authoritative provider documentation immediately before any activation, purchase, credential change, implementation, or external commitment.

## 5. Fresh dated Production evidence from #159 validation

Read-only Production validation during the #159 settlement measured:

- series: 10,241
- variants: 23,808
- market listings: 107
- active safe single listings: 106
- variants with safe active market evidence: 104
- fresh <30d depth: 96 variants ×1, 1 variant ×2, 0 variants ×3-4, ×5-9, or ×10+
- observations: 107
- listings with exactly 1 observation: 107
- listings with 2+ observations: 0
- completed `sold`: 0
- verified affiliate provenance listings: 3
- review-safe stock / restock / X: 0 / 0 / 0
- outbound clicks: 0 / 21 / 38 for 24h / 7d / 30d at validation time
- new listings / observations in that 24h window: 11 / 11
- Production DB `ingestion_runs` market rows in that 24h window: 0; this does **not** imply zero GitHub Actions runs

These are dated measurements, not permanent live facts. Re-read before making current claims or sizing a rollout.

The dominant measured weakness remains **history not enabled in Production**: every known listing still had only one observation at the checkpoint.

## 6. Current open work / approval boundaries

Re-fetch before acting.

### Issue #119 — next safe phase: Production history/depth rollout planning

No dedicated rollout-planning Issue existed at the #162 checkpoint. After this canonical sync closes, create a bounded child Issue under #119 for a **read-only Production history/depth rollout plan** that reconciles #150, #153, #156, #159 and #162.

Planning may safely include:

- fresh read-only Production counts and provider-health evidence
- exact lane responsibilities: breadth vs depth vs re-observation
- proposed canary size/cadence/request budgets
- idempotency/transaction/post-write verification requirements
- rollback/stop conditions
- Scoreboard success metrics
- exact approval checklist for each Production-impacting step

Planning itself must not execute live Production provider requests with credentials, mutate the DB, dispatch workflows, add/change schedules, change Secrets/Variables, buy access, or create contractual obligations.

Any later first live provider-read canary, DB persistence canary, workflow/schedule activation, Secrets/Variables change, or `workflow_dispatch` remains a separate explicit approval boundary.

### PR #142 / Issue #137 — F0 rerelease canonical-year repair

Open, non-Draft, **human/approval-bound**. Do not auto-merge merely because tests/Preview pass. Merging changes code used by the scheduled Production-capable F0 official lane and can allow a future scheduled write path to proceed past the current blocker.

## 7. F0 official automatic incident

Scheduled `Gacha Official Bounded Automatic Production` run `33484450472` failed safely on 2026-09-01:

- read-only audit: `OFFICIAL_READ_ONLY_PLAN_READY`
- proposed new series / variants: 4 / 19
- proposed restock event inserts: 1
- Production transaction: `not_started`
- DB writes: 0
- deletes: 0
- blocker: `official_bounded_rerelease_canonical_release_mismatch`

Issue #137 / PR #142 contain the repair. Keep the guard intact. Do not merge #142 or manually rerun/dispatch F0 without required approvals.

## 8. Hard repository/source rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually modify F0 official auto or P3 V2 auto
- do not enable Kitan or Qualia auto without approval
- do not rerun completed Kitan/Qualia/complete-set/P2/P1 canaries without a new task-specific approval
- do not weaken the strict single-item matcher
- keep complete sets at series scope
- never mix completed/sold evidence with active asking-price evidence
- do not scrape Mercari or Amazon
- do not treat Mercari Shops seller credentials as C2C market-wide access
- do not automate other public storefronts without a reviewed API/feed/permission path
- do not purchase/activate Aucfan, X, GSC paid connector access, or another paid/licensed source without explicit approval

## 9. Merge/release policy

`docs/AUTO_MERGE_POLICY.md` is the authoritative narrow exception allowing eligible safe, reversible PRs to merge without repeated human acknowledgement.

If merge causes only the repository's normal Vercel Production deployment, `docs/PRODUCTION_RELEASE_POLICY.md` must also pass in full.

Always stop for explicit approval when work includes Production DB mutation/migration, live Production-connected provider execution where approval is required, workflow dispatch, Secrets/Variables changes, new/material Production-capable workflow/schedule/cron/automatic ingestion, paid actions, contractual obligations, destructive operations, direct main push, major unresolved product/security decisions, or an ineligible release.

## 10. Exact next step after this canonical sync

After Issue #163's docs-only PR is exact-head green, merged, and its normal Vercel Production deployment is READY:

1. Re-fetch `main`, Issue #119, current Production counts, and open PRs.
2. Confirm no newer dedicated history/depth rollout Issue already exists.
3. Create one bounded child Issue under #119 for a **read-only Production history/depth rollout plan**.
4. Design the plan around #150 re-observation, #153 exact provider reads, #156 Depth Collector, #159 Scoreboard, and #162 source priorities.
5. Re-read Production counts/provider health read-only before choosing canary sizes or cadence.
6. Explicitly separate planning from approval-bound execution.
7. Do **not** run Production credentials/provider reads, persist observations/listings, dispatch workflows, change schedules, or modify Secrets/Variables without their required explicit approvals.
8. Keep #142 at its explicit F0 Production-impact approval boundary.

Business priority remains **DATA first**, then TRAFFIC, CLICK/conversion, and REVENUE.
