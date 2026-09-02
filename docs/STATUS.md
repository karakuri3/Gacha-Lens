# Gacha Lens Status

Updated: 2026-09-02 JST — successful Yahoo-only R2 v2 / Issue #193 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #193.

- On branch `docs/canonical-sync-post-r2-v2-success-193` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #193 is complete by definition; do not create a recursive docs sync merely to mark its own merge.
- After #193 is on `main`, do **not** rerun R2. Resume under Issue #119 with read-only scorecard/rollout reassessment before deciding whether R3/R4 or another data-scale task is justified.

## Repository / release checkpoint

- canonical main before #193 sync: `f1d723f971ddbdceed830bc87f2c67936577f56b`
- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 original R2 atomic persistence prerequisite: completed
- #183/#184 post-prerequisite canonical sync: completed
- #179 first approved original R2 attempt: fail-closed on first Rakuten `not_found`; RPC 0; market-data writes 0; approval consumed
- #185/#186 post-attempt canonical sync: completed
- #187/#188 Yahoo-only R2 v2 repository prerequisite: completed and merged
- #189/#190 post-#188 canonical sync: completed and Production READY
- #179 fresh v2 preflight and exact migration/provider/RPC approval: completed
- #179 approved v2 Production migration application: completed
- #191/#192 post-v2-migration canonical sync: completed and Production READY
- #179 Yahoo-only R2 v2 provider/RPC execution: **SUCCESS**
- #142/#137 F0: separate approval boundary

PR #192 release evidence:

- final head `b2a15b74b30a116a3469d47c8a055c34c821b947`
- squash merge/current pre-#193 main `f1d723f971ddbdceed830bc87f2c67936577f56b`
- PR Code Quality `33619012438`: SUCCESS
- exact-head Vercel Preview `dpl_GQjuVKc3HH2G5EqAhgeP27VsgTzr`: READY
- normal Git-triggered Production `dpl_EQwjhzqm5hHpxSWr36x4QFjBFrYc`: READY
- Issue #191: completed

## Successful Yahoo-only R2 v2 execution

The human separately authorized the disposable one-shot execution mechanism for #179.

Approved execution identity:

- approved code SHA: `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- cohort digest: `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- observation key: `reobs-v1:r2-20260902-02`
- disposable branch: `ops/r2-v2-one-shot-179-20260902`
- workflow-add commit: `bb741654797286c801cc5c0415070e14fa96aa21`
- Actions run: `33621881117`
- artifact: `r2-v2-one-shot-179-33621881117`, artifact id `9843223874`
- workflow removal commit: `41add3c5629cb33ae48d0e00aca6b67270a6ea94`

Execution result:

- run conclusion: **SUCCESS**
- event: branch `push`; `workflow_dispatch` was not used
- Yahoo HTTP attempts: **4 total**
- attempts per listing: **1 each**
- retries: **0**
- rate limited: **0**
- timed out: **0**
- all four provider outcomes: **`unchanged`**
- RPC result verified: **true**
- applied count: **4**
- automatic RPC retry: **0**

The workflow guard verified before provider execution that:

- the disposable branch was created from exact approved code SHA `dc25eb16...`;
- current main was exact expected docs-only successor `f1d723f...`;
- approved-code -> current-main drift was exactly the four canonical docs from #191/#192;
- approved-code -> one-shot branch delta was exactly one workflow file.

After execution, the workflow file was immediately removed from the disposable branch. The branch final tree has **0 file differences** from approved code SHA and the branch has exactly **1 Actions run**. It was never merged to `main`.

## Fresh Production checkpoint after R2 v2 success

Artifact postwrite verification and a separate connected Supabase SELECT-only verification agree exactly:

- market listings: **113**
- observations: **117**
- listings with 2+ observations: **4**
- completed `status=sold`: **0**
- `status=sold_out`: **0**
- deterministic v2 observation rows present: **4/4**

The four Yahoo-only v2 listings are all still active with original prices and now have exactly two observations each:

1. `yahoo-lead-netstore-302507s186ook3` — 698 / active / **2 observations**
2. `yahoo-selen-shope-5500000224314` — 1500 / active / **2 observations**
3. `yahoo-lead-netstore-qq222607s309ptk2` — 898 / active / **2 observations**
4. `yahoo-toysanta-g-5l960018a9-002-57393` — 458 / active / **2 observations**

All four new deterministic rows share:

- `observed_at = 2026-09-02T10:55:01.023Z`
- provider `yahoo_shopping`
- observation key `reobs-v1:r2-20260902-02`
- outcome `unchanged`

All four listings remain `sold_at=null`. This is the first truthful repeated-observation history in Production.

## Production schema state

Original v1 R2 function remains installed from the prior failed-safe attempt:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- SECURITY INVOKER, empty `search_path`, service_role-only EXECUTE

Yahoo-only v2 function remains installed from the approved migration:

- repository migration: `supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`
- Production ledger version/name: `20260902095120` / `r2_yahoo_only_reobservation_canary_v2`
- `public.apply_market_reobservation_r2_canary_v2(jsonb)`: present
- SECURITY INVOKER (`security_definer=false`)
- empty `search_path`
- PUBLIC/anon/authenticated EXECUTE denied
- service_role EXECUTE allowed

Do not reapply either migration or invoke either R2 RPC merely because the functions exist.

## Frozen Yahoo-only R2 v2 deterministic rows

Observation key: `reobs-v1:r2-20260902-02`.

- `yahoo-lead-netstore-302507s186ook3` -> `market-reobservation-8a75ea4bf9142e03626b21494b70177c`
- `yahoo-selen-shope-5500000224314` -> `market-reobservation-790961862647eeaeccf27f8115a688c8`
- `yahoo-lead-netstore-qq222607s309ptk2` -> `market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1`
- `yahoo-toysanta-g-5l960018a9-002-57393` -> `market-reobservation-e1ac79e10392067e6deb89991ed4ac53`

All four are now present in Production. They are historical evidence, not reusable write authorization.

## Approval state

Consumed/non-reusable:

- #172 Yahoo continuation authorization
- original #179/v1 execution approval/token
- original #179 v1 one-shot workflow authorization
- #188 review substitution
- v2 migration/provider/RPC execution approval bound to `dc25eb16...` + digest `441957a6...`
- v2 disposable one-shot workflow creation/push/run/cleanup authorization

No approval from R1/R2 implies R3/R4, a schedule/budget expansion, another provider call, another RPC, workflow change/dispatch, Secrets/Variables change, F0/#142, paid source activation or destructive work.

## Exact next step after #193 reaches main

R2's objective is achieved. Do **not** rerun it and do **not** automatically jump to R3/R4.

Stay read-only first:

1. re-read current main and Production after #193 release;
2. run/review the Data Scale Scoreboard against the new 113/117/4 baseline;
3. compare actual R2 evidence with `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md` success criteria;
4. inspect whether R3 read-only depth work remains the highest DATA gain per engineering/risk cost under Issue #119;
5. if R3 is still justified, open a new bounded task with a fresh cohort/request envelope and obtain any required live-provider authority separately;
6. R4 Production persistence remains a separate later approval even if R3 succeeds.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions.

- #182 run `33600534418`: all 9 migrations applied before stale expected-8 failure
- #188 run `33613902714`: all 10 migrations applied before the same stale expected-8 failure

Repair remains a separate Production-capable workflow-change task with applicable approval.

## Hard boundaries

- do not rerun R2 v1 or v2 without a completely new task-specific approval
- do not reapply completed R2 migrations
- do not recreate/reuse either R2 disposable one-shot workflow authorization
- no R3/R4 Production/provider execution by implication
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix completed sold with active/sold_out evidence, or scrape Mercari/Amazon
