# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — successful Yahoo-only R2 v2 / Issue #193 canonical sync

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here.

## Self-referential canonical-sync rule

This file is authored by Issue #193.

- If read from branch `docs/canonical-sync-post-r2-v2-success-193` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #193 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to mark #193 complete.
- After #193 reaches `main`, do not rerun R2 merely to refresh evidence. Resume under Issue #119 with read-only scorecard/rollout reassessment before any R3/R4 or new Production execution.

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

R2 has now proven truthful repeated-observation history end-to-end in Production. The immediate question is no longer “can one listing have history?” but “what is the safest highest-leverage next Data Scale expansion?” Evaluate that read-only before R3/R4.

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

Canonical main immediately before Issue #193 sync:

`f1d723f971ddbdceed830bc87f2c67936577f56b`

That is PR #192's squash merge after the post-v2-migration canonical sync.

Completed milestones:

- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP exact-read repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 original R2 atomic persistence prerequisite: completed
- #183/#184 post-prerequisite canonical sync: completed
- #179 first approved original R2 Production attempt: fail-closed before RPC/write on first Rakuten `not_found`; old approval consumed
- #185/#186 post-attempt canonical sync: completed
- #187/#188 Yahoo-only R2 v2 repository prerequisite: completed and merged
- #189/#190 post-#188 canonical sync: completed and Production READY
- #179 Yahoo-only R2 v2 fresh preflight and exact Production approval: completed
- #179 approved v2 Production migration application: completed
- #191/#192 post-v2-migration canonical sync: completed and Production READY
- #179 Yahoo-only R2 v2 exact provider + atomic persistence run: **SUCCESS**

PR #192 release evidence:

- final head: `b2a15b74b30a116a3469d47c8a055c34c821b947`
- squash merge/main: `f1d723f971ddbdceed830bc87f2c67936577f56b`
- PR Code Quality `33619012438`: SUCCESS
- exact-head Preview `dpl_GQjuVKc3HH2G5EqAhgeP27VsgTzr`: READY
- normal Git-triggered Production `dpl_EQwjhzqm5hHpxSWr36x4QFjBFrYc`: READY

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

Original key: `reobs-v1:r2-20260902-01` across two Rakuten + two Yahoo listings.

The reviewed v1 migration was applied under the original exact #179 approval. Connected Supabase tooling recorded:

- ledger version `20260902073919`
- name `r2_atomic_reobservation_canary`

Verified Production v1 function:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- SECURITY INVOKER
- empty search_path
- PUBLIC/anon/authenticated EXECUTE denied
- service_role EXECUTE allowed

The first approved v1 execution ran once as Actions `33605362604` and stopped fail-closed on `rakuten-auc-toysanta-10386044` with final `not_found`.

Durable outcome:

- first-target exact HTTP attempt count is not observable from retained artifact/log; reviewed reader bounds it to 1–3
- remaining three original targets: 0 calls
- atomic RPC calls: 0
- Production market-data writes: 0
- no retry
- old #179/v1 approval/token and its disposable workflow authorization are consumed

Never reuse that approval/token or invoke v1 merely because the function exists.

## Why R2 v2 was Yahoo-only

The redesign was evidence-driven, not symmetry-driven:

- R1 Rakuten exact evidence produced `not_found` on 3/3 distinct frozen rows
- the first #179 attempt produced another Rakuten `not_found`
- R1 Yahoo final evidence produced valid `unchanged` results for two durable rows
- Production had additional Yahoo rows that were single/review-safe, one-observation, unresolved-issue-free and old enough for repeat checks

Keeping weak Rakuten targets merely for a cosmetic 2+2 split was rejected. Provider symmetry is not a success criterion.

## Yahoo-only R2 v2 repository and schema contract

Observation key:

`reobs-v1:r2-20260902-02`

Repository migration:

`supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`

RPC:

`public.apply_market_reobservation_r2_canary_v2(jsonb)`

Durable design:

- v1 remains intact/inert historical state
- distinct V2 approval confirmation namespace and digest kind/version
- exact fixed Yahoo-only four + exact v2 key
- exact approved-code SHA + cohort binding
- exactly four Yahoo Shopping exact reads; no rediscovery/provider substitution
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

Production schema application was completed before execution:

- ledger version: `20260902095120`
- ledger name: `r2_yahoo_only_reobservation_canary_v2`
- v2 function present, SECURITY INVOKER, empty search_path
- PUBLIC/anon/authenticated EXECUTE denied; service_role allowed

Do not reapply the v2 migration.

## Frozen Yahoo-only R2 v2 cohort and deterministic rows

1. `yahoo-lead-netstore-302507s186ook3`
   - variant `tarts-y096563-面会窓`
   - series `tarts-y096563`
   - native `lead-netstore_302507s186ook3`
   - URL `https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html`
   - price 698 / active
   - deterministic row `market-reobservation-8a75ea4bf9142e03626b21494b70177c`
2. `yahoo-selen-shope-5500000224314`
   - variant `gashapon-4570118105790000-コライドン`
   - series `gashapon-4570118105790000`
   - native `selen-shope_5500000224314`
   - URL `https://store.shopping.yahoo.co.jp/selen-shope/5500000224314.html`
   - price 1500 / active
   - deterministic row `market-reobservation-790961862647eeaeccf27f8115a688c8`
3. `yahoo-lead-netstore-qq222607s309ptk2`
   - variant `tarts-y901065-たっつん`
   - series `tarts-y901065`
   - native `lead-netstore_qq222607s309ptk2`
   - URL `https://store.shopping.yahoo.co.jp/lead-netstore/qq222607s309ptk2.html`
   - price 898 / active
   - deterministic row `market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1`
4. `yahoo-toysanta-g-5l960018a9-002-57393`
   - variant `gashapon-4582769979163000-くちぱっち`
   - series `gashapon-4582769979163000`
   - native `toysanta_g-5l960018a9-002-57393`
   - URL `https://store.shopping.yahoo.co.jp/toysanta/g-5l960018a9-002-57393.html`
   - price 458 / active
   - deterministic row `market-reobservation-e1ac79e10392067e6deb89991ed4ac53`

All four deterministic rows now exist in Production and each listing has exactly two observations.

## Successful R2 v2 Production execution

Human-approved execution identity:

- approved code SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- cohort digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- exact token `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:dc25eb16b7e057397fe3bf9527f5467ac54b281a:441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`

The human separately authorized the credentialed one-shot mechanism:

- disposable branch `ops/r2-v2-one-shot-179-20260902`
- branch starts from exact approved code SHA `dc25eb16...`
- one branch-only push-trigger workflow only
- existing GitHub Secrets only
- no `workflow_dispatch`
- no merge to `main`
- immediate same-branch workflow-file removal after evidence capture

Execution evidence:

- workflow-add commit `bb741654797286c801cc5c0415070e14fa96aa21`
- Actions run `33621881117`
- artifact `r2-v2-one-shot-179-33621881117`, artifact id `9843223874`
- run conclusion **SUCCESS**
- total Yahoo HTTP attempts **4**
- exactly 1 attempt/listing
- retries 0, rate-limits 0, timeouts 0
- all four outcomes `unchanged`
- one verified atomic v2 RPC result with applied_count 4
- no automatic RPC retry

Artifact postwrite:

- before: 113 listings / 113 observations / 0 re-observed / 0 completed sold
- after: 113 listings / 117 observations / 4 re-observed / 0 completed sold

A separate connected Supabase SELECT-only verification matched the artifact exactly:

- market listings **113**
- observations **117**
- listings with 2+ observations **4**
- completed sold **0**
- sold_out **0**
- deterministic v2 rows **4/4**
- each frozen target exactly **2 observations**
- all four remain `active`, original prices unchanged and `sold_at=null`
- new shared `observed_at = 2026-09-02T10:55:01.023Z`
- provenance provider `yahoo_shopping`, key `reobs-v1:r2-20260902-02`, outcome `unchanged`

This is the first truthful repeated-observation history in Production.

## One-shot cleanup / replay safety

Immediately after evidence capture:

- workflow file deleted from disposable branch in commit `41add3c5629cb33ae48d0e00aca6b67270a6ea94`
- compare approved code SHA -> cleanup commit reports two audit commits but **0 changed files**
- branch Actions run count remains exactly **1**
- deletion caused no second run
- disposable branch was not merged to main

The v2 provider/RPC approval and one-shot workflow authorization are consumed/non-reusable. Do not recreate or rerun them merely because the code/function still exists.

## Current Production checkpoint

As of the successful R2 v2 verification:

- market listings: **113**
- observations: **117**
- re-observed listings: **4**
- completed `sold`: **0**
- `sold_out`: **0**

R2 objective achieved.

## Exact next action after Issue #193 reaches main

Do not automatically jump to R3/R4. The rollout stages remain separately approved.

Stay read-only first:

1. re-fetch current main and Production after #193 release;
2. run/review the Data Scale Scoreboard against baseline 113/117/4;
3. compare the R2 result with `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md` success/failure criteria;
4. inspect current Data Scale bottlenecks and whether R3 read-only depth collection remains the highest DATA gain per engineering/risk cost under #119;
5. if justified, open a fresh bounded R3 task with explicit targets/request ceiling and no Production writes;
6. obtain any live provider/search authorization separately before R3 calls if policy requires it;
7. R4 persistence always remains a separate Production-write approval after R3 evidence.

Do not rerun R2 for confirmation.

## Known workflow debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions.

- #182 run `33600534418`: all 9 migrations applied, then expected-8 assertion failed
- #188 run `33613902714`: all 10 migrations applied, including v2, then the same expected-8 assertion failed

This is known harness debt, not a migration-application failure. Repair is a separate workflow-change task with its own applicable approval boundary.

## Current approval boundaries

Explicit human approval remains required before:

- any new R2 retry/replay
- R3/R4 approval-bound live provider or Production execution
- merge/dispatch of F0/#142
- Production-capable workflow/schedule changes or dispatches
- Secrets/Variables changes
- paid/licensed activation
- destructive/irreversible actions

Consumed and non-reusable:

- #172 Yahoo continuation approval
- original #179/v1 provider/write approval and token
- original v1 disposable one-shot workflow authorization
- #188 review substitution
- v2 migration/provider/RPC approval
- v2 disposable one-shot workflow creation/run/cleanup authority

## Thread-handoff essentials

If context is lost, preserve these facts:

- main before #193 sync: `f1d723f971ddbdceed830bc87f2c67936577f56b`
- #192 is merged and normal Production is READY
- Production is now **113 listings / 117 observations / 4 re-observed / 0 completed sold**
- Production v1 and v2 RPCs exist; v2 ledger version is `20260902095120`
- R2 v2 run `33621881117` succeeded with 4 Yahoo attempts total, all unchanged, one atomic +4 history result
- workflow was removed; branch has one run only and zero final file diff from approved code SHA
- all R2 execution/workflow approvals are consumed
- do not rerun R2
- next safe phase is read-only scorecard/rollout reassessment under #119
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
