# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — successful Yahoo-only R2 v2 / Issue #193 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #193.

- On branch `docs/canonical-sync-post-r2-v2-success-193` or its open PR, finish the P0-L canonical-sync gate below.
- Once this content is on `main`, treat P0-L as complete and resume at P1-E.
- Do not create a recursive docs sync merely to mark #193's own merge.

## P0-A — F0 separate approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction `not_started`, DB writes/deletes 0.
- [x] Create Issue #137 / PR #142 repair and validate tests/lint/diff/Preview.
- [ ] Obtain remaining required review/explicit approval before merging #142.
- [ ] Do not manually rerun/dispatch F0 without separate approval.

## P0-B — Data Scale foundations — complete

- [x] #150 re-observation engine.
- [x] #153 exact Rakuten/Yahoo provider reads.
- [x] #156 Depth Collector.
- [x] #159 truthful read-only Data Scale Scoreboard.
- [x] #162 lawful source capability matrix.
- [x] #169 equal-time/null-time re-observation safety.
- [x] #170 Production history/depth rollout plan.

## P0-C — R1 #172 — complete

- [x] Freeze 3 Rakuten + 3 Yahoo.
- [x] Complete Rakuten reads: 3 `not_found`, DB writes 0.
- [x] Repair Yahoo exact JSONP padding under #173/#176.
- [x] Complete final Yahoo reads: 2 unchanged / 1 not_found.
- [x] Consume Yahoo continuation budget exactly 9/9.
- [x] Close #172.

R1 grants no later provider/write authority.

## P0-D — Yahoo repair / canonical sync chain — complete

- [x] #173/#176 Yahoo JSONP repair merged and Production READY.
- [x] #177/#178 post-Yahoo canonical sync merged and Production READY.

## P0-E — Original R2 atomic prerequisite #180/#182 — complete

- [x] Freeze original 2 Rakuten + 2 Yahoo cohort/key `reobs-v1:r2-20260902-01`.
- [x] Add one-transaction v1 RPC and exact identity/snapshot/history guards.
- [x] Add exact-main/cohort approval binding, provider budgets/pacing and no-auto-retry resolver.
- [x] Exact-head CI/Preview PASS.
- [x] Disposable Supabase applied all repository migrations before known stale migration-list assertion.
- [x] Merge #182 and verify Production READY.

## P0-F — Post-original-prerequisite sync #183/#184 — complete

- [x] Sync canonical four.
- [x] Record #184-only review substitution.
- [x] Merge #184 and verify normal Production READY.

## P1-A — #179 first approved original R2 Production attempt — complete as fail-closed execution

- [x] Obtain exact human approval for v1 Production migration + max-12 provider envelope + exactly-one RPC only-if-all-four-seen.
- [x] Apply reviewed v1 migration to Supabase Production; tool ledger `20260902073919`, name `r2_atomic_reobservation_canary`.
- [x] Verify v1 function SECURITY INVOKER, empty search_path and service_role-only EXECUTE.
- [x] Run one-shot Actions `33605362604` once.
- [x] First target `rakuten-auc-toysanta-10386044` ends `not_found`.
- [x] Stop immediately; remaining three provider calls 0; RPC 0; market-data writes 0.
- [x] Remove one-shot workflow from disposable branch and preserve audit-only branch history.
- [x] Verify Production 113 listings / 113 observations / 0 re-observed / 0 completed sold / 0 sold_out.
- [x] Mark original #179/v1 execution approval/token consumed.

This was a successful safety outcome but did not create repeated history.

## P0-G — Post-failed-attempt sync #185/#186 — complete

- [x] Record applied v1 Production schema state and generated ledger timestamp.
- [x] Record exact fail-closed attempt evidence and consumed authorization.
- [x] Merge #186 and verify Production READY.

## P1-B — R2 redesign/reselection #187/#188 — complete

Evidence-driven decision: use Yahoo-only for the next first-history proof rather than retaining weak Rakuten targets for symmetry.

- [x] Create Issue #187 from main `e43a7c146d329bc3f5e5436b62b3e8d634cb1292`.
- [x] Freeze four Yahoo Shopping rows and key `reobs-v1:r2-20260902-02`.
- [x] Preserve v1 unchanged/inert.
- [x] Add distinct V2 approval namespace/cohort digest/RPC migration.
- [x] Freeze exact four deterministic v2 observation IDs in regression tests.
- [x] Enforce exact Yahoo reads only, serial >=1000ms, max 3 attempts/listing / max 12 total.
- [x] Fail closed before RPC on any non-valid exact `seen`.
- [x] Preserve one-transaction, one-prior-observation, identity/snapshot/import-issue, deterministic-ID, positive-price, active/sold_out, no-sold and protected-field guards.
- [x] Preserve service_role-only SECURITY INVOKER / empty search_path.
- [x] Preserve no automatic RPC retry and SELECT-only ambiguous resolver.
- [x] Expected success deltas fixed to +0 listings / +4 observations / +4 re-observed / +0 completed sold.
- [x] Final PR head `53d7de690a7b5aacba65f69d30b6c70249182b3d`.
- [x] PR Code Quality `33613902680` SUCCESS.
- [x] Vercel Preview `dpl_26iNtrQRcAN3ntTZHgxsiAAutV28` READY.
- [x] Foundation `33613902714`: all 10 migrations applied successfully, then known stale expected-8 assertion failed.
- [x] Obtain #188-only human review substitution.
- [x] Squash merge #188 as `f3da6c82952dd44bf343d2c1717cd62920ace116`.
- [x] Verify Issue #187 closed and normal Production READY.

#188 review substitution ended with #188 and grants no later Production execution authority.

## P0-J — Post-#188 canonical sync #189/#190 — complete

- [x] Sync canonical four from exact #188 merge state.
- [x] Merge as `dc25eb16b7e057397fe3bf9527f5467ac54b281a`.
- [x] Verify normal Git-triggered Production `dpl_65egbLB3KUCntXStsECrp6ztrdCi` READY.

## P1-C — Fresh Yahoo-only R2 v2 preflight / approval / migration — complete

Exact approval identity:

- approved code/main SHA: `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- observation key `reobs-v1:r2-20260902-02`

- [x] Re-fetch main, #179 and Production state.
- [x] Re-read exact frozen four Yahoo rows.
- [x] Verify each one observation, exact identity, review-safe, positive price, active/sold_out, `sold_at=null`.
- [x] Verify unresolved import issues = 0 for all four.
- [x] Verify deterministic v2 observation IDs collision-free.
- [x] Verify v2 function/migration absent before application.
- [x] Compute/freeze exact digest/token.
- [x] Obtain exact human approval for migration + max-12 frozen Yahoo envelope + exactly-one RPC only-if-all-four-seen.
- [x] Apply reviewed v2 migration; ledger `20260902095120`, name `r2_yahoo_only_reobservation_canary_v2`.
- [x] Verify SECURITY INVOKER, empty search_path, PUBLIC/anon/authenticated denied, service_role allowed.
- [x] Verify post-migration Production remains 113/113/0; provider HTTP 0; v2 RPC 0; market-data writes 0.
- [x] Stop at separate workflow-authority boundary.

## P0-K — Post-v2-migration canonical sync #191/#192 — complete

- [x] Create Issue #191 / branch `codex/post-r2-v2-migration-sync-191`.
- [x] Keep changed paths exactly canonical four docs.
- [x] Record ledger/function/security state and frozen cohort evidence.
- [x] Record migration complete and provider/RPC actions 0.
- [x] Focused/full tests, lint, diff checks pass; build limitation classified as missing secret-free data-source config only.
- [x] Independent Verifier PASS on exact head `b2a15b74b30a116a3469d47c8a055c34c821b947`.
- [x] Independent Reviewer PASS; blocking/major/minor findings 0.
- [x] PR Code Quality `33619012438` SUCCESS.
- [x] Preview `dpl_GQjuVKc3HH2G5EqAhgeP27VsgTzr` READY.
- [x] Squash merge #192 as `f1d723f971ddbdceed830bc87f2c67936577f56b`.
- [x] Verify normal Production `dpl_EQwjhzqm5hHpxSWr36x4QFjBFrYc` READY.

## P1-D — Yahoo-only R2 v2 exact one-shot execution — complete SUCCESS

The human separately authorized the smallest credentialed mechanism from the approved code SHA.

- [x] Create disposable branch `ops/r2-v2-one-shot-179-20260902` from exact approved SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`.
- [x] Add exactly one branch-only push-trigger workflow with read-only repository permission and existing Secrets only.
- [x] Use exact v2 SHA/digest/token; no `workflow_dispatch`.
- [x] Verify current main `f1d723f...` differs from approved code SHA only by canonical docs and one-shot branch differs by exactly the workflow file before provider execution.
- [x] Execute exactly once as Actions run `33621881117`.
- [x] Yahoo provider attempts: **4 total / 1 each / retries 0 / rate-limit 0 / timeout 0**.
- [x] All four exact outcomes: **unchanged**.
- [x] Invoke one verified atomic v2 RPC after all four safe plans; no automatic retry.
- [x] Artifact postwrite: 113→113 listings / 113→117 observations / 0→4 re-observed / sold 0→0.
- [x] Fresh independent Production SELECT matches artifact exactly; deterministic rows 4/4, each target exactly 2 observations.
- [x] Preserve original prices 698 / 1500 / 898 / 458, active status and `sold_at=null`.
- [x] Delete workflow immediately from same branch in commit `41add3c5629cb33ae48d0e00aca6b67270a6ea94`.
- [x] Verify final branch tree has zero file differences from approved code SHA.
- [x] Verify branch Actions run count remains exactly 1; deletion produced no second run.
- [x] Do not merge disposable branch to main.
- [x] Mark v2 provider/RPC and workflow authorizations consumed/non-reusable.

**R2 first truthful repeated-history objective is achieved.**

## P0-L — Post-success canonical sync #193 — current phase gate

- [x] Create Issue #193 from exact main `f1d723f971ddbdceed830bc87f2c67936577f56b`.
- [x] Create branch `docs/canonical-sync-post-r2-v2-success-193`.
- [x] Update only `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record run `33621881117`, artifact `9843223874`, exact 4-attempt provider evidence, one atomic +4 history result and cleanup commit.
- [x] Record Production 113 listings / 117 observations / 4 re-observed / sold 0.
- [x] Record each frozen Yahoo target now has exactly 2 observations and deterministic row present.
- [x] Record all R2 provider/write/workflow approvals consumed.
- [ ] Complete cross-file consistency self-review as non-independent Reviewer/Verifier under docs-only small-task rule.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Confirm no unresolved GitHub/Vercel threads.
- [ ] Squash merge only if Auto-Merge + Standing Production Release gates pass.
- [ ] Verify normal Git-triggered Production READY.
- [ ] Close #179 completed after the canonical success state is on main.

Once this content reaches `main`, P0-L is closed by definition; do not create a recursive sync just to record #193's own merge.

## P1-E — Read-only post-R2 Data Scale reassessment — next after #193

Do **not** jump directly to R3/R4 merely because R2 succeeded.

- [ ] Re-fetch main and Production after #193 release.
- [ ] Run/review the Data Scale Scoreboard using new baseline **113 listings / 117 observations / 4 re-observed**.
- [ ] Compare actual R2 result against `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md` success criteria.
- [ ] Re-rank current Data Scale bottlenecks under #119 by expected DATA gain / engineering effort / Production risk.
- [ ] Decide whether R3 read-only depth collection is still the highest-priority next bounded workstream.
- [ ] If yes, create a fresh R3 task with explicit variants/cohort/request ceiling and no Production writes.
- [ ] Obtain any required live provider/search authority separately before making R3 calls.
- [ ] Keep R4 persistence separately Production-write approval-bound even if R3 succeeds.

## Separate known workflow debt

- [x] #182 Foundation `33600534418`: all 9 migrations applied before stale-list failure.
- [x] #188 Foundation `33613902714`: all 10 migrations applied before the same stale expected-8 failure.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

- [ ] R3 candidate plan: freeze 2 explicit variants, <=10 accepted offers total, separately authorize applicable live provider/search envelope, Production DB writes 0.
- [ ] R4 candidate plan: persist only strict-safe R3 subset, <=10 new listing+observation pairs, separate Production DB approval.

R2 success does not authorize either stage.

## P3 — Licensed completed-sale / source expansion

- [ ] Maintain source capability matrix and recheck provider terms before acting.
- [ ] Perform Aucfan commercial/data-rights diligence before payment/credentials.
- [ ] Build Mercari partnership dossier; never scrape Mercari or Amazon.

## P4 — Non-price signals

- [ ] Add timestamped provenance-bearing stock/inventory evidence.
- [ ] Keep official restock/re-release separate from inferred unavailability.
- [ ] Add preorder demand/social signals only at authorized exact scope.

## P5 — Traffic / affiliate / GSC

- [ ] Restore/re-read authorized GSC reporting before current SEO performance claims.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure search impressions/clicks before pruning.
- [ ] Preserve strict affiliate provenance and provider+variant click attribution.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 without its required approval.
- [ ] Do NOT make more Yahoo provider calls under exhausted #172 approval.
- [ ] Do NOT rerun original #179 v1 run `33605362604` or reuse its approval/token.
- [ ] Do NOT rerun successful v2 run `33621881117` or recreate/reuse its disposable workflow authorization.
- [ ] Do NOT invoke v1/v2 R2 RPC merely because functions exist.
- [ ] Do NOT reapply completed v1/v2 Production migrations.
- [ ] Do NOT execute R3/R4 by implication.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT purchase/activate paid/licensed sources without approval.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

After every major Production/recovery/security/release milestone: update STATUS/HANDOFF/DECISIONS/TODO, use a docs-only PR, merge and verify Production READY before the next major implementation/execution phase.
