# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-R2 v2 Production migration / Issue #191 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #191.

- On branch `codex/post-r2-v2-migration-sync-191` or its open PR, finish the P0-K canonical-sync gate below.
- Once this content is on `main`, treat P0-K as complete and resume at P1-D.
- Do not create a recursive docs sync merely to mark #191's own merge.

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

## P1-B — R2 redesign/reselection #187/#188 — complete in repository/release

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
- [x] Obtain #188-only human review substitution for exact-head CI + Preview + disposable migration proof + strengthened self-review.
- [x] Squash merge #188 as `f3da6c82952dd44bf343d2c1717cd62920ace116`.
- [x] Verify Issue #187 closed.
- [x] Verify normal Production deployment `dpl_8qZotT9SYvG6zEQkmsaz9pY6Z2ms` READY with canonical aliases.
- [x] Verify at merge boundary Production still 113/113/0 and v2 function absent; v2 live provider calls 0; v2 Production writes 0.

#188 review substitution ended with #188 and grants no Production execution authority.

## P0-J — Post-#188 canonical sync #189/#190 — complete

- [x] Create Issue #189 from exact main `f3da6c82952dd44bf343d2c1717cd62920ace116`.
- [x] Create branch `docs/canonical-sync-post-r2-v2-189`.
- [x] Keep final changed paths exactly `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record #188 merge/release/CI/Preview/disposable-migration evidence.
- [x] Record #188-only review substitution as consumed/non-transferable.
- [x] Record v2 Production function absent and 0 live v2 calls/writes.
- [x] Record exact Yahoo-only cohort/key/deterministic IDs and next approval boundary.
- [x] Complete applicable review disclosure/evidence.
- [x] Exact-head PR checks and Preview pass.
- [x] Full canonical-consistency review pass.
- [x] Merge under Auto-Merge / Standing Production Release gates as `dc25eb16b7e057397fe3bf9527f5467ac54b281a`.
- [x] Verify normal Git-triggered Production `dpl_65egbLB3KUCntXStsECrp6ztrdCi` READY.

Once this file is on `main`, P0-J is closed by definition.

## P1-C — Fresh Yahoo-only R2 v2 preflight / approval / migration — complete to workflow boundary

The exact approval binds main `dc25eb16b7e057397fe3bf9527f5467ac54b281a`, digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`, and the corresponding exact V2 token.

- [x] Re-fetch current main, #179 and Production state.
- [x] Re-read exact frozen four Yahoo rows.
- [x] Verify each remains one observation, exact identity, review-safe, positive price, active/sold_out, `sold_at=null`.
- [x] Verify unresolved import issues = 0 for all four.
- [x] Verify all four deterministic v2 observation IDs remain collision-free.
- [x] Verify v2 function/migration absent before approval/application.
- [x] Refresh current Supabase function/security guidance.
- [x] Compute/freeze exact current-main + v2 cohort digest/token.
- [x] Obtain exact human approval for migration + max-12 frozen Yahoo envelope + exactly-one RPC only-if-all-four-seen.
- [x] Apply reviewed v2 migration to Production; ledger `20260902095120`, name `r2_yahoo_only_reobservation_canary_v2`.
- [x] Verify v2 RPC SECURITY INVOKER, empty `search_path`, PUBLIC/anon/authenticated denied, service_role allowed.
- [x] Verify post-migration Production remains 113/113/0; provider HTTP 0; v2 RPC 0; market-data writes 0.
- [x] Stop before provider execution because the approved scope did not authorize a new Production-capable workflow mechanism.

Do not reuse #172 Yahoo approval, original #179/v1 approval/token, or #188 review/merge authorization.

## P0-K — Post-v2-migration canonical sync #191 — current phase gate

- [x] Create Issue #191 from exact main `dc25eb16b7e057397fe3bf9527f5467ac54b281a`.
- [x] Create branch/worktree `codex/post-r2-v2-migration-sync-191`.
- [x] Keep changed paths exactly `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record ledger/function/security state and fresh frozen-cohort evidence.
- [x] Record migration complete, provider/RPC/market-data actions 0, and the exact remaining workflow boundary.
- [x] Focused queue test, full regression, lint and `git diff --check` pass; secret-free build compiles/types successfully and is then blocked only by unavailable sitemap data-source configuration.
- [ ] Independent Verifier and Reviewer pass on the frozen exact head.
- [ ] Exact-head PR checks and Vercel Preview pass.
- [ ] Merge only if Auto-Merge / Standing Production Release gates pass.
- [ ] Verify exact normal Git-triggered Production READY.

Once this file is on `main`, P0-K is closed by definition.

## P1-D — Exact disposable v2 execution workflow approval — next after #191

- [ ] Obtain separate exact human approval to create a disposable branch from approved main `dc25eb16b7e057397fe3bf9527f5467ac54b281a`.
- [ ] Approval must cover exactly one branch-only push-trigger workflow invoking only the reviewed v2 runner with the exact SHA/token and existing Secrets.
- [ ] Preserve exact-main + one-file-delta guard, read-only repo permissions, reviewed attempt limits, sanitized artifact, and no merge to main.
- [ ] Allow exactly one automatic push-triggered run; do not use `workflow_dispatch`.
- [ ] After evidence capture, immediately delete the workflow file from the same disposable branch; retain only inert audit history unless deletion is separately approved.
- [ ] STOP before creating or pushing that workflow until this exact workflow-change/automatic-run/cleanup authority exists.

## Separate known workflow debt

- [x] #182 Foundation `33600534418`: all 9 migrations applied before stale-list failure.
- [x] #188 Foundation `33613902714`: all 10 migrations applied before the same stale expected-8 failure.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

- [ ] R3: freeze 2 explicit variants, <=10 accepted offers total, obtain separate live provider/search approval, DB writes 0.
- [ ] R4: persist only strict-safe R3 subset, <=10 new listing+observation pairs, obtain separate Production DB approval.

Do not jump here while R2 repeated history is still zero unless a newer explicit product decision changes priority.

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
- [ ] Do NOT rerun original #179 run `33605362604` or reuse its old provider/write approval/token.
- [ ] Do NOT invoke v1 merely because it exists.
- [ ] Do NOT reapply the completed v2 Production migration/function.
- [ ] Do NOT create/push/run/clean up the disposable v2 workflow without its separate exact workflow authority.
- [ ] Do NOT make v2 live Yahoo requests or invoke the v2 RPC outside the approved exact SHA/token/cohort/envelope and all-four-safe evidence.
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
