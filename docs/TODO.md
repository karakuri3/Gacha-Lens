# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-#179 first Production attempt / Issue #185 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #185.

- On branch `docs/canonical-sync-post-r2-attempt-185` or its open PR, finish the P0-I canonical-sync gate below.
- Once this content is on `main`, treat P0-I as complete and resume at P1-B. Do not create a recursive docs sync merely to mark #185's own merge.

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
- [x] Obtain task-specific read approval.
- [x] Complete Rakuten reads: 3 × not_found, DB writes 0.
- [x] Repair Yahoo exact JSONP padding under #173/#176.
- [x] Complete final Yahoo reads: 2 unchanged / 1 not_found.
- [x] Consume Yahoo continuation budget exactly 9/9.
- [x] SELECT-reverify frozen rows unchanged with one observation each.
- [x] Close #172.

R1 grants no later provider/write authority.

## P0-D — Post-R1 canonical sync #174/#175 — complete

- [x] Sync canonical docs, merge #175, verify Production READY.

## P0-E — Yahoo JSONP repair #173/#176 — complete

- [x] Accept only fixed raw-byte-0 callback or exact raw-byte-0 `/* */` + fixed callback.
- [x] Repair independent-review findings.
- [x] Final independent Reviewer + Verifier PASS.
- [x] Full CI / Preview PASS.
- [x] Merge #176 and verify Production READY.

## P0-F — Post-Yahoo canonical sync #177/#178 — complete

- [x] Sync four canonical docs.
- [x] Merge #178 and verify Production READY.

## P0-G — R2 atomic persistence prerequisite #180/#182 — complete in repository

- [x] Freeze original #179 four-listing cohort and key `reobs-v1:r2-20260902-01`.
- [x] Add single-transaction PostgreSQL RPC migration.
- [x] Add exact identity/snapshot/one-prior-observation/import-issue/deterministic-ID guards.
- [x] Restrict writes to 4 observation inserts + 4 listing snapshot updates; never completed `sold`/`sold_at`.
- [x] Restrict RPC execution to service_role.
- [x] Add exact-head/cohort approval binding and read-only dry-run.
- [x] Enforce exact provider reads, pacing, max 3 attempts/listing / max 12 total.
- [x] Stop before RPC on any unsafe provider result.
- [x] Add one-RPC/no-auto-retry behavior and SELECT-only ambiguous-commit resolver.
- [x] PR Code Quality `33600534520` PASS.
- [x] Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK` READY.
- [x] Disposable Supabase `33600534418`: all 9 repository migrations applied before stale 8-version assertion.
- [x] Merge #182 and verify Production READY.

## P0-H — Post-#182 canonical sync #183/#184 — complete

- [x] Sync canonical four.
- [x] Record #184-only review substitution.
- [x] Exact-head CI / Preview / strengthened self-review PASS.
- [x] Merge #184 as `8a63676bc11474644f8cc09c2fde43886c00c9f0`.
- [x] Verify normal Production `dpl_GWeSyvRhWmta2oSjjmLCxPJTqqD2` READY with canonical aliases.

## P1-A — #179 first approved Production attempt — complete as fail-closed execution

### Approval / migration

- [x] Fresh-read main and Production before execution.
- [x] Freeze approval token against main `8a63676b...` and original cohort digest.
- [x] Obtain exact human approval for Production migration + max-12 provider envelope + one atomic RPC only-if-all-four-seen.
- [x] Obtain #179-only approval for a disposable branch-only GitHub Actions workflow using existing Secrets.
- [x] Apply reviewed repository migration SQL to Supabase Production.
- [x] Record Supabase tool ledger version `20260902073919`, name `r2_atomic_reobservation_canary`; do not confuse it with repository filename timestamp `20260902150500`.
- [x] Verify RPC present, SECURITY INVOKER, empty search_path, PUBLIC/anon/authenticated denied, service_role allowed.

### One-shot execution result

- [x] Create disposable branch `ops/r2-one-shot-179-20260902` from exact approved main.
- [x] Keep branch delta to the one-shot workflow only before execution.
- [x] Run Actions `33605362604` exactly once.
- [x] Exact-main / branch-only guard PASS.
- [x] First target `rakuten-auc-toysanta-10386044` returns `not_found` after exactly one successful HTTP response path.
- [x] Stop immediately under all-or-nothing contract.
- [x] Remaining three provider calls = 0.
- [x] Atomic RPC calls = 0.
- [x] R2 market-data writes = 0.
- [x] No retry.

### Post-failure verification / cleanup

- [x] Verify Production remains 113 listings / 113 observations / 0 re-observed / 0 completed sold / 0 sold_out.
- [x] Verify all four original targets remain at one observation.
- [x] Verify all four deterministic R2 IDs remain absent.
- [x] Delete temporary workflow in branch commit `cac883d9f74af9cad051a6fd853631f8a91ebc89`.
- [x] Verify disposable branch tree now differs from main by 0 files.
- [x] Verify only one Actions run exists for the branch.
- [x] Record evidence on Issue #179.
- [x] Mark old #179 execution approval/token consumed; never reuse or retry it.

This was a successful safety result but did not create repeated history.

## P0-I — Post-attempt canonical sync #185 — current phase gate

- [x] Create Issue #185 from exact main `8a63676bc11474644f8cc09c2fde43886c00c9f0`.
- [x] Create branch `docs/canonical-sync-post-r2-attempt-185`.
- [ ] Keep changed paths exactly `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [ ] Record migration-applied schema state and tool-generated ledger timestamp truthfully.
- [ ] Record failed-first-provider result, one HTTP attempt, zero RPC and zero market-data writes.
- [ ] Record one-shot workflow cleanup and consumed approval.
- [ ] Disclose non-independent sequential Reviewer/Verifier under Agent OS small-task rule.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Full canonical-consistency self-review PASS.
- [ ] Merge only if Auto-Merge / Standing Production Release gates pass.
- [ ] Verify normal Git-triggered Production READY.

Once this file is on `main`, P0-I is closed by definition.

## P1-B — R2 redesign/reselection after first fail-closed attempt — next after #185

Stay read-only until a new exact approval exists.

- [ ] Re-fetch current main and #179.
- [ ] Diagnose the original Rakuten `not_found` from repository/Production/history evidence only; do not infer sold/sold_out.
- [ ] Re-select a tiny cohort or revise provider mix using durable evidence without live provider calls.
- [ ] Decide whether Rakuten should remain represented in the next tiny canary based on evidence, not symmetry.
- [ ] Because installed RPC hardcodes the original four listing IDs/key, design a **new** migration/function contract if the cohort changes.
- [ ] Preserve one-transaction / exact identity / one-prior-observation / deterministic-ID / service-role-only / no-auto-retry safety.
- [ ] Add/adjust focused tests.
- [ ] Run repository review, CI and Preview gates.
- [ ] Fresh SELECT-only Production preflight.
- [ ] Freeze new cohort digest / approval token.
- [ ] Present a new exact human approval request for any new provider envelope, migration/function application and bounded atomic write.
- [ ] Stop before all new live provider calls and Production mutation until approved.

Do not reuse run `33605362604`, the old workflow, or the old approval token.

## Separate known workflow debt

- [x] Confirm Foundation run `33600534418` applied all 9 repository migrations before stale-list failure.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

- [ ] R3: freeze 2 explicit variants, <=10 accepted offers total, obtain separate live provider/search approval, DB writes 0.
- [ ] R4: persist only strict-safe R3 subset, <=10 new listing+observation pairs, obtain separate Production DB approval.

Do not jump here merely because the first R2 attempt failed; first decide R2's next truthful design.

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
- [ ] Do NOT rerun #179 run `33605362604` or reuse its old provider/write approval/token.
- [ ] Do NOT invoke the installed R2 RPC merely because the function exists.
- [ ] Do NOT make new R2 live provider requests without a fresh exact approval.
- [ ] Do NOT execute new R2 Production persistence without fresh exact approval.
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
