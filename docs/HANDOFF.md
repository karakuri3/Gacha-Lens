# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-#188 Yahoo-only R2 v2 prerequisite / Issue #189 canonical sync

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here.

## Self-referential canonical-sync rule

This file is authored by Issue #189.

- If read from branch `docs/canonical-sync-post-r2-v2-189` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #189 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to mark #189 complete.
- Once #189 is on `main`, resume #179 at the fresh SELECT-only Yahoo-only R2 v2 preflight below. Do not apply Production schema, make live provider calls, or invoke the v2 RPC before a new exact human approval.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel and live Production evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed or failed Production canaries merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes and ineligible merges/releases require explicit approval.
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

The immediate DATA bottleneck remains truthful repeated-observation history. Production still has zero listings with 2+ observations.

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
- no approval-bound provider call, workflow dispatch/change, Secrets/Variables change or destructive action by implication

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Current repository / release checkpoint

Current canonical main before Issue #189 sync:

`f3da6c82952dd44bf343d2c1717cd62920ace116`

That is PR #188's squash merge.

Completed milestones:

- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP exact-read repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 original R2 atomic persistence prerequisite: completed
- #183/#184 post-prerequisite canonical sync: completed
- #179 first approved original R2 Production attempt: fail-closed before RPC/write on first Rakuten `not_found`; old approval consumed
- #185/#186 post-attempt canonical sync: completed
- #187/#188 Yahoo-only R2 v2 repository prerequisite: completed and merged

PR #188 release evidence:

- final PR head: `53d7de690a7b5aacba65f69d30b6c70249182b3d`
- squash merge/main: `f3da6c82952dd44bf343d2c1717cd62920ace116`
- PR Code Quality `33613902680`: SUCCESS
- exact-head Preview `dpl_26iNtrQRcAN3ntTZHgxsiAAutV28`: READY
- Foundation `33613902714`: disposable Supabase successfully applied all 10 repository migrations, including the new v2 migration; run then failed only at the known stale expected-8 migration-order assertion
- normal Git-triggered Production `dpl_8qZotT9SYvG6zEQkmsaz9pY6Z2ms`: READY with aliases including `gachalens.com` and `www.gachalens.com`
- Issue #187: closed completed

For PR #188 only, the human explicitly allowed exact-head CI + Preview + disposable migration proof + strengthened self-review to replace independent Reviewer/Verifier. That exception ended with #188 and grants no later review or Production authority.

## R1 durable result

R1 #172 established that exact-provider reads can fail closed without changing Production:

- Rakuten frozen 3: all `not_found`
- Yahoo final frozen 3 after parser repair: two `unchanged`, one `not_found`
- Production DB writes: 0
- false completed `sold`: 0
- Yahoo continuation approval consumed exactly 9/9 and is exhausted

Do not reuse #172 Yahoo approval.

## Yahoo exact-read durable contract

PR #176 permanently repaired Yahoo exact `itemLookup` JSONP compatibility. Only these raw-byte-0 forms are accepted:

1. fixed internal callback immediately at byte 0; or
2. exact literal `/* */` at byte 0 immediately followed by that fixed callback.

Leading whitespace/BOM, alternate comments, wrong callbacks, bare JSON and malformed wrappers fail closed.

## Original R2 v1 durable state

Issue #180 / PR #182 created the original deliberately narrow R2 atomic path.

Repository migration:

`supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`

The original frozen key was `reobs-v1:r2-20260902-01` across two Rakuten + two Yahoo listings.

Under a later exact #179 human approval, the reviewed v1 migration was applied to Supabase Production. Connected Supabase tooling recorded ledger version `20260902073919`, name `r2_atomic_reobservation_canary`.

Verified Production v1 function:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- SECURITY INVOKER
- empty search_path
- PUBLIC/anon/authenticated EXECUTE denied
- service_role EXECUTE allowed

The first approved v1 execution ran once as Actions `33605362604` and stopped fail-closed on the first target `rakuten-auc-toysanta-10386044` with final `not_found`.

Durable outcome:

- exact HTTP attempt count for that target is not observable from retained artifact/log, but reviewed reader bounds it to 1–3
- remaining three original targets: 0 calls
- atomic RPC calls: 0
- Production market-data writes: 0
- no retry
- old #179/v1 approval and token are consumed

Never reuse that approval/token or invoke v1 merely because the function exists.

## Why R2 v2 is Yahoo-only

The redesign is evidence-driven, not symmetry-driven:

- R1 Rakuten exact evidence produced `not_found` on 3/3 distinct frozen rows
- the first #179 attempt produced another Rakuten `not_found`
- R1 Yahoo final evidence produced valid `unchanged` results for two durable rows
- Production has additional Yahoo rows that are single/review-safe, one-observation, unresolved-issue-free and old enough for a repeat check

For the first truthful history proof, keeping weak Rakuten targets merely to preserve a 2+2 provider split was rejected. Provider symmetry is not a success criterion.

## Frozen Yahoo-only R2 v2 cohort

Observation key:

`reobs-v1:r2-20260902-02`

1. `yahoo-lead-netstore-302507s186ook3`
   - variant `tarts-y096563-面会窓`
   - series `tarts-y096563`
   - native `lead-netstore_302507s186ook3`
   - URL `https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html`
   - current checkpoint 698 / active / 1 observation
   - deterministic v2 observation ID `market-reobservation-8a75ea4bf9142e03626b21494b70177c`
2. `yahoo-selen-shope-5500000224314`
   - variant `gashapon-4570118105790000-コライドン`
   - series `gashapon-4570118105790000`
   - native `selen-shope_5500000224314`
   - URL `https://store.shopping.yahoo.co.jp/selen-shope/5500000224314.html`
   - current checkpoint 1500 / active / 1 observation
   - deterministic v2 observation ID `market-reobservation-790961862647eeaeccf27f8115a688c8`
3. `yahoo-lead-netstore-qq222607s309ptk2`
   - variant `tarts-y901065-たっつん`
   - series `tarts-y901065`
   - native `lead-netstore_qq222607s309ptk2`
   - URL `https://store.shopping.yahoo.co.jp/lead-netstore/qq222607s309ptk2.html`
   - current checkpoint 898 / active / 1 observation
   - deterministic v2 observation ID `market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1`
4. `yahoo-toysanta-g-5l960018a9-002-57393`
   - variant `gashapon-4582769979163000-くちぱっち`
   - series `gashapon-4582769979163000`
   - native `toysanta_g-5l960018a9-002-57393`
   - URL `https://store.shopping.yahoo.co.jp/toysanta/g-5l960018a9-002-57393.html`
   - current checkpoint 458 / active / 1 observation
   - deterministic v2 observation ID `market-reobservation-e1ac79e10392067e6deb89991ed4ac53`

## Yahoo-only R2 v2 repository contract

Repository migration:

`supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`

RPC name:

`public.apply_market_reobservation_r2_canary_v2(jsonb)`

Durable design:

- v1 remains intact/inert historical state
- distinct V2 approval confirmation namespace
- distinct V2 cohort digest kind/version
- exact fixed Yahoo-only four + exact v2 key
- exact current-main + cohort approval binding
- exactly four Yahoo Shopping exact reads; no keyword rediscovery or provider substitution
- serial same-provider pacing >=1000ms
- max 3 attempts/listing / max 12 HTTP attempts total
- any non-valid exact `seen` stops before RPC
- one PostgreSQL transaction only if all four safe plans exist
- exact identity/snapshot/one-prior-observation/import-issue/deterministic-ID guards
- positive integer price; only `active` / `sold_out`
- writes only four observation inserts + four listing updates limited to price/status/last_observed_at/updated_at
- no completed `sold` and no `sold_at`
- SECURITY INVOKER, empty search_path, service_role-only EXECUTE
- no automatic RPC retry
- ambiguous resolver is SELECT-only and always returns `automatic_retry=false`, `write_retry_authorized=false`
- expected successful deltas: +0 listings / +4 observations / +4 re-observed / +0 completed sold

The four exact reviewed deterministic IDs are frozen in regression tests so Node/SQL identity drift fails CI.

## Current Production checkpoint after #188 release

Fresh SELECT-only verification immediately before #188 merge showed:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**
- each v2 frozen Yahoo row: exactly one observation, active, review-safe

Crucially:

- `public.apply_market_reobservation_r2_canary_v2(jsonb)`: **absent in Production**
- v2 Production migration/function application: **not performed**
- v2 live Yahoo provider calls: **0**
- v2 RPC calls: **0**
- v2 Production writes: **0**

A repository migration being merged and Vercel Production being READY does not mean Supabase Production schema changed.

## Exact next action after Issue #189 reaches main

Stay **read-only** and perform a fresh v2 preflight:

1. Re-fetch current `main`, #179 and open work; avoid duplicate work.
2. SELECT-only re-read the exact four frozen Yahoo rows and their observations/import issues.
3. Verify each remains review-safe, exact identity, one prior observation, positive price, active/sold_out, `sold_at=null`, no unresolved import issue.
4. Verify all four deterministic v2 observation IDs remain collision-free.
5. Verify Production v2 migration/function remains absent.
6. Refresh Supabase function/security guidance if needed.
7. Compute/freeze the exact current-main + v2 cohort digest and exact approval token `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:<main>:<digest>`.
8. Present one fresh human approval request that explicitly covers:
   - applying `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql` to Supabase Production;
   - at most 12 exact Yahoo provider HTTP attempts across the frozen four;
   - only if all four return valid exact `seen`, exactly one v2 atomic RPC with expected +0 listings/+4 observations/+4 re-observed/+0 completed sold.
9. Stop before any migration/provider/RPC mutation until that exact approval exists.

Old #172 Yahoo approval, old #179/v1 approval/token, and #188 review/merge authorization cannot authorize this execution.

Do not jump automatically to R3/R4 while repeated history remains zero unless a newer explicit product decision changes priority.

## Known workflow debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions.

- older #182 run `33600534418`: all 9 migrations applied, then expected-8 assertion failed
- #188 final-head run `33613902714`: all 10 migrations applied, including v2, then the same expected-8 assertion failed

This is known harness debt, not a migration-application failure. Repair is a separate workflow-change task with its own applicable approval boundary.

## Current approval boundaries

Explicit human approval is required before:

- v2 Production migration/function application
- v2 live Yahoo provider requests
- v2 RPC/write
- R3/R4 live/provider/Production execution
- merge/dispatch of F0/#142
- Production-capable workflow/schedule changes or dispatches
- Secrets/Variables changes
- paid/licensed activation
- destructive/irreversible actions

## Thread-handoff essentials

If context is lost, preserve these facts:

- current main before #189 sync: `f3da6c82952dd44bf343d2c1717cd62920ace116`
- #188 is merged and normal Production is READY
- Production remains 113 listings / 113 observations / 0 re-observed / 0 completed sold
- Production v1 RPC exists; Production v2 RPC does not yet exist
- next action is SELECT-only v2 preflight, then a new exact approval request
- make **zero** v2 live provider calls and **zero** v2 Production mutations before that approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
