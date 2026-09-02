# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — reusable bounded re-observation repository prerequisite / Issue #199 canonical sync

This is the canonical operational handoff for resuming Gacha Lens. Re-fetch live GitHub/Vercel/Supabase/provider evidence before acting when current state matters.

## Self-referential canonical-sync rule

This file is authored by Issue #199.

- If read from branch `docs/canonical-sync-post-bounded-prereq-199` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #199 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to record #199's own merge.
- After #199 reaches `main`, resume Issue #119 with read-only planning for the first bounded reusable re-observation cohort. Do not apply the generic Production migration or make provider/RPC calls without fresh explicit approval.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not rerun completed or failed canaries merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, destructive work, direct main pushes, and ineligible merges/releases require explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major implementation/execution phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production
- Vercel project: `karakuri3s-projects/gachalens`
- Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`
- Vercel team ID: `team_ftNyyXQQ8osmTZYExJeSqcvU`
- Preferred local path: `C:\dev\Gacha-Lens`

## Product purpose / priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Near-term order: **DATA -> TRAFFIC -> CLICK -> REVENUE**.

R2 proved truthful repeated-observation history end-to-end in Production. The current DATA bottleneck is still history coverage: Production has 4 re-observed listings out of 113 (~3.54%), while the current Scoreboard treats history as not enabled below 10%. At the same denominator, 12 re-observed listings are needed to exceed the first threshold, so +8 truthful first re-observations would cross it.

Do not solve that by creating another bespoke hardcoded R2 RPC. Issue #196 / PR #198 merged a reusable bounded 1..10 repository prerequisite specifically to avoid permanent one-off canaries.

## Absolute project safety rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually change F0 official auto or P3 V2 market auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict single-item matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out listing evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no direct push to `main`
- no Production DB write/migration/schema/backfill/reset/cleanup without exact applicable approval
- no approval-bound provider call, workflow dispatch/change, Secrets/Variables change, paid/destructive action, or R3/R4 execution by implication

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Current repository checkpoint

Repository prerequisite merge:

- original implementation Issue: #196
- original Draft PR: #197 — closed unmerged only because the connected Draft->Ready GraphQL wrapper failed before mutation on unsupported `Repository.fullDatabaseId`
- byte-identical replacement PR: #198
- implementation branch: `feat/bounded-reobservation-persistence-196`
- frozen implementation head: `c6372d9f3a1857a2d18302c1a4118cf685e13ece`
- #198 squash merge / current pre-#199 main: `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`
- Issue #196: closed completed

#198 validation evidence:

- PR Code Quality `33655012819`: SUCCESS
- exact-head Vercel Preview reused/attached to #198: `dpl_8Pc5xkekW6iM53XNXu2p4j1y4fz3`, READY
- Foundation `33655012798`: disposable `db reset --local --no-seed` applied all 11 repository migrations successfully, including `20260902213000_market_reobservation_bounded_v1.sql`; run then failed only at the known stale assertion expecting the original eight migration versions
- review threads: 0
- base drift before merge: 0

The human explicitly allowed a one-task review substitution for #196/#197 only: exact-head CI + Vercel Preview + disposable migration-apply proof + strengthened self-review in place of independent Reviewer/Verifier. That substitution was consumed by the byte-identical repository merge through #198 and grants no Production execution authority.

## Reusable bounded re-observation repository contract

Repository migration:

`supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`

RPC name if/when separately applied to Production:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Approval namespace:

`APPROVE_MARKET_REOBSERVATION_BOUNDED_V1`

Durable contract:

- explicit frozen cohort only, minimum 1 / maximum 10 listings
- Rakuten (`provider=rakuten_ichiba`, listing `source=rakuten`) and Yahoo (`provider/source=yahoo_shopping`)
- exact persisted provider/native/public identity; no rediscovery or provider substitution inside the lane
- exact current-main SHA + observation key + frozen listing snapshots + expected prior observation counts -> SHA-256 cohort digest
- old R2 v1/v2 tokens cannot validate
- dry-run: DB SELECTs only, provider 0, RPC 0, Production writes 0
- future write mode: serial exact reads, max 3 attempts/listing, absolute max 30 at batch ceiling
- existing provider pacing preserved (Rakuten >=1200ms, Yahoo >=1000ms)
- any unsafe/not_found/throttle/provider error/identity mismatch/snapshot drift stops before RPC
- exactly one atomic RPC only after every frozen provider plan is safe
- no automatic RPC retry
- sanitized resolver manifest must be persisted before RPC so ambiguous commit state can be resolved SELECT-only
- deterministic observation IDs are recomputed in SQL
- expected prior observation count must match current DB count and may be >1
- append exactly one observation per target; update only price/status/last_observed_at/updated_at
- never write completed `sold` or `sold_at`
- canonical marketplace identity and the exact persisted DB URL/raw identity are validated separately
- listing rows, observation append path, and unresolved import-issue path are protected against relevant concurrent races
- exact target/RPC invariants remain strict; global postwrite counts are concurrency-tolerant minimum-delta checks so unrelated legitimate P3 growth is not misclassified as corruption
- SECURITY INVOKER, empty search_path, schema-qualified relations
- EXECUTE denied to PUBLIC/anon/authenticated; service_role only
- ambiguous resolver returns only `committed | not_committed | inconsistent`, provider 0, RPC 0, writes 0, automatic retry false

Exactly seven new repository files were merged for this prerequisite; existing R2 v1/v2 files and workflows were not modified.

## Production state after #198 repository merge

A fresh connected Supabase SELECT after #198 merge proved:

- `public.apply_market_reobservation_bounded_v1(jsonb)`: **absent**
- Production migration ledger entry `market_reobservation_bounded_v1`: **absent**
- market listings: **113**
- observations: **117**
- re-observed listings: **4**
- completed sold: **0**

Therefore #198 is a repository prerequisite only. Vercel release does not mean the generic migration is installed in Supabase Production.

Do not apply `20260902213000_market_reobservation_bounded_v1.sql` to Production without a new explicit approval.

## Successful R2 v2 Production evidence — historical and terminal

R2 Yahoo-only v2 remains the first truthful repeated-history proof.

Frozen key: `reobs-v1:r2-20260902-02`.

Four targets:

1. `yahoo-lead-netstore-302507s186ook3` — 698 / active
2. `yahoo-selen-shope-5500000224314` — 1500 / active
3. `yahoo-lead-netstore-qq222607s309ptk2` — 898 / active
4. `yahoo-toysanta-g-5l960018a9-002-57393` — 458 / active

Successful one-shot evidence:

- approved code SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- cohort digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- disposable branch `ops/r2-v2-one-shot-179-20260902`
- Actions `33621881117`: SUCCESS
- Yahoo HTTP attempts 4 total, exactly 1/listing
- all four outcomes `unchanged`
- exactly one verified atomic v2 RPC
- 113->113 listings / 113->117 observations / 0->4 re-observed / completed sold 0->0
- deterministic v2 rows 4/4 present; each target exactly two observations
- workflow immediately removed; branch final file diff 0; branch run count exactly 1; branch never merged

R2 provider/write/workflow approvals are consumed/non-reusable. Do not rerun R2 merely to reconfirm it.

## Original R2 v1 historical evidence

- repository migration `20260902150500_r2_atomic_reobservation_canary.sql`
- Production ledger `20260902073919`, `r2_atomic_reobservation_canary`
- v1 function remains installed service_role-only / SECURITY INVOKER / empty search_path
- first approved execution `33605362604` stopped fail-closed on first Rakuten target `not_found`
- exact first-target attempt count is not observable; reviewed reader bounds it to 1-3
- remaining target calls 0, RPC 0, market-data writes 0, no retry
- old v1 approval/token/workflow authorization are consumed

Yahoo-only v2 Production migration is also already applied as ledger `20260902095120`, `r2_yahoo_only_reobservation_canary_v2`; do not reapply or invoke it by implication.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

Evidence chain:

- #182 Foundation: 9 migrations applied before stale expected-8 failure
- #188 Foundation: 10 migrations applied before stale expected-8 failure
- #197/#198 Foundation: 11 migrations applied before the same stale expected-8 failure

This is known harness debt, not migration failure. Repairing the Production-capable workflow remains a separate approval-bound task.

## Exact next action after Issue #199 reaches main

Stay read-only first. Do not jump to R3/R4 and do not apply the generic migration yet.

1. re-fetch current main and Production after #199 release;
2. SELECT-only rank at least 8 and at most 10 existing exact listings suitable for a first generic bounded batch, prioritizing listings with exactly one observation, review-safe identity, no unresolved import issue, `sold_at=null`, positive price and sufficiently old last observation;
3. prefer provider evidence quality over cosmetic provider symmetry; use current Rakuten/Yahoo exact-read evidence when choosing the cohort;
4. freeze a new observation key, exact cohort snapshots, prior observation counts, deterministic IDs and cohort digest against the then-current main;
5. run/inspect the generic **dry-run only** if practical; provider/RPC/write counts must remain 0;
6. present the exact migration + provider-attempt envelope + one-RPC-only-if-all-safe scope for fresh human Production approval;
7. workflow/credential execution mechanism, if needed, remains a separately explicit boundary unless covered exactly by that new approval;
8. after any future Production execution milestone, force canonical sync again before moving to R3/R4.

## Approval state / hard stops

Consumed/non-reusable:

- #172 Yahoo continuation approval
- original #179 v1 provider/write token and one-shot workflow authorization
- #188 review substitution
- Yahoo-only R2 v2 migration/provider/RPC approval
- Yahoo-only R2 v2 one-shot workflow authorization
- #196/#197 independent-review substitution, consumed by byte-identical #198 repository merge

Not authorized now:

- generic bounded v1 Production migration
- any new Yahoo/Rakuten provider calls for the generic lane
- generic bounded RPC or Production market-data writes
- workflow creation/change/dispatch for generic execution
- R3/R4 execution
- F0/#142 merge/dispatch
- Secrets/Variables changes
- paid/licensed activation
- destructive/irreversible actions
