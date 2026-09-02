# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #183 / PR #184.

- On branch `docs/canonical-sync-post-r2-prereq-183` / open PR #184, finish the P0-H gate below.
- On `main`, #183/#184 is complete by definition and P0-H should be treated as closed; resume at P1 #179. Do not create another recursive docs sync just to update #184's own merge checkbox.

## P0-A — Keep F0 at its real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction `not_started`, DB writes/deletes 0.
- [x] Trace blocker and create Issue #137 / PR #142 repair.
- [x] Verify #142 tests/lint/diff/Preview.
- [ ] Obtain remaining required review/explicit approval before merging #142.
- [ ] Do not manually rerun/dispatch F0 without separate approval.

## P0-B — Re-observation / depth / measurement foundations — complete

- [x] #150 re-observation engine.
- [x] #153 exact Rakuten/Yahoo provider reads.
- [x] #156 Depth Collector.
- [x] #159 truthful read-only Data Scale Scoreboard.
- [x] #162 lawful source capability matrix.
- [x] #169 equal-time/null-time re-observation safety.
- [x] #170 Production history/depth rollout plan.

## P0-C — R1 exact-provider read-only canary #172 — complete

- [x] Freeze 6 known listings: 3 Rakuten + 3 Yahoo.
- [x] Obtain exact task-specific read approval.
- [x] Complete Rakuten reads: 3 × not_found, HTTP 200, DB writes 0.
- [x] Diagnose Yahoo exact `/* */` padding under bounded continuation approval.
- [x] Complete final Yahoo reads: 2 unchanged / 1 not_found, HTTP 200.
- [x] Consume Yahoo continuation budget exactly 9/9; no further call under that approval.
- [x] SELECT-reverify frozen six unchanged with one observation each.
- [x] Close #172.

R1 grants no R2 authority.

## P0-D — Post-R1 canonical sync #174/#175 — complete

- [x] Sync canonical docs.
- [x] Pass validation / Preview.
- [x] Merge #175.
- [x] Verify Production `dpl_8PP2URX7qF9LRCD9UguM6JRPBFQ6` READY.

## P0-E — Yahoo JSONP repair #173/#176 — complete

- [x] Permanently accept only fixed raw-byte-0 callback or exact raw-byte-0 `/* */` + fixed callback.
- [x] Repair independent-review leading-byte and callback-override findings.
- [x] Re-run final independent Reviewer + Verifier: PASS.
- [x] Full validation / CI / Preview: PASS.
- [x] Merge #176 and verify Production `dpl_4U73Cev864RvycfGGPteqQxMS246` READY.
- [x] Close #173.

## P0-F — Post-Yahoo canonical sync #177/#178 — complete

- [x] Sync exactly HANDOFF / STATUS / DECISIONS / TODO.
- [x] Record 113 listings / 113 observations / 0 re-observed / 0 completed sold.
- [x] Merge #178 as `82ef2532253a99b1ba1c46b48a22442281c27442` under its task-specific substitution.
- [x] Close #177 and verify normal Production READY.

## P0-G — R2 atomic persistence prerequisite #180/#182 — complete in repository

- [x] Freeze exact #179 four-listing cohort and key `reobs-v1:r2-20260902-01`.
- [x] Add R2-specific single-transaction PostgreSQL RPC migration.
- [x] Add exact identity/snapshot/one-prior-observation/import-issue/deterministic-ID guards.
- [x] Restrict writes to 4 observation inserts + 4 listing snapshot updates; never completed `sold`/`sold_at`.
- [x] Restrict RPC execution to service_role with `SECURITY INVOKER` and empty search path.
- [x] Add exact-head/cohort approval binding and read-only dry-run.
- [x] Enforce exact provider reads, pacing, max 3 attempts/listing / max 12 total.
- [x] Stop before RPC on any unsafe provider result.
- [x] Add one-RPC/no-auto-retry behavior and SELECT-only ambiguous-commit resolver.
- [x] Exact-head PR Code Quality `33600534520`: PASS.
- [x] Exact-head Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY.
- [x] Disposable Supabase run `33600534418`: all 9 migrations applied successfully; red only at stale 8-version assertion.
- [x] Apply human's #180/#182-only CI+Preview+disposable-migration+self-review substitution.
- [x] Merge #182 as `d80450626fd30768bb8f0af68340f0d2aea00bbb`.
- [x] Verify Production `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` READY.
- [x] Close #180.
- [x] Confirm Production R2 migration/function still absent and R2 provider/write counts remain 0.

The #180/#182 review substitution is finished and non-transferable.

## P0-H — Post-#182 canonical sync #183 / PR #184

This gate exists only until this exact file reaches `main`.

Completed on the PR branch:

- [x] Re-fetch pre-sync main `d80450626fd30768bb8f0af68340f0d2aea00bbb`.
- [x] Verify #182 Production deployment READY.
- [x] SELECT-read Production baseline: 113 listings / 113 observations / 0 re-observed / 0 completed sold / 0 sold_out.
- [x] SELECT-reverify frozen #179 cohort: 4/4 present, active, single/review-safe, one observation each, unresolved import issues 0.
- [x] SELECT-verify Production migration `20260902150500` absent and R2 RPC function absent.
- [x] Create Issue #183 and branch from exact main.
- [x] Update exactly HANDOFF / STATUS / DECISIONS / TODO.
- [x] Preserve existing durable Decision IDs and use unused IDs for new decisions.
- [x] Confirm changed path set is exactly the four canonical docs and branch behind main 0.
- [x] Create PR #184.
- [x] Complete full-diff/canonical consistency self-review and repair the canonical-sync self-reference problem.

Remaining **only when read on the PR branch**:

- [ ] Exact-head PR Code Quality PASS for the final head after the self-reference repair.
- [ ] Exact-head Vercel Preview READY for that same final head.
- [ ] Independent Reviewer PASS on that same final head.
- [ ] Independent Verifier PASS on that same final head.
- [ ] Merge #184 only when Auto-Merge / Standing Production Release gates pass.
- [ ] Verify the resulting normal Git-triggered Production deployment READY.

When this file is on `main`, treat all P0-H items as closed by the self-referential rule and resume P1; do not open another canonical-sync PR only to flip these boxes.

## P1 — R2 tiny Production re-observation persistence #179 — next after #184 reaches main

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

### Repository preparation — complete

- [x] Freeze exactly 4 known listings: 2 Rakuten + 2 Yahoo.
- [x] Freeze exact provider/native/public identity and review-safe single scope.
- [x] Freeze deterministic logical key and observation IDs.
- [x] Define atomic transaction and exact expected deltas.
- [x] Add fail-closed provider/identity/price/availability/timestamp/snapshot/partial-write guards.
- [x] Add post-write verification and SELECT-only ambiguous-commit resolver.

### Fresh pre-execution reread — required after #184 reaches main

- [ ] Re-fetch current `main` and #179.
- [ ] Re-read current Production global counts.
- [ ] Re-read the four frozen listings and observation counts.
- [ ] Recheck deterministic observation-ID collisions.
- [ ] Recheck unresolved import issues.
- [ ] Recheck Production migration/function state.
- [ ] Recheck current Supabase function/security guidance before any Production migration application.
- [ ] Freeze exact current-main/cohort digest and approval-token inputs.

### Hard Production approval gate

Present one exact request covering all three actions:

1. [ ] apply reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql` to Supabase Production;
2. [ ] allow fresh exact provider reads for the frozen four, max 3 attempts/listing and absolute max 12 HTTP attempts;
3. [ ] only if all four are valid exact `seen`, allow one atomic RPC write with successful deltas:
   - market listings +0
   - observations +4
   - re-observed listings +4
   - completed `sold` +0
   - deletes 0
   - protected identity/provenance changes 0
   - exactly four listing updates limited to price/status/last_observed_at/updated_at

- [ ] Obtain **fresh explicit user approval** for that exact combined scope.

### Execution only after approval

- [ ] Apply only the reviewed Production migration/function.
- [ ] Verify function security/availability after application.
- [ ] Run only the frozen provider envelope.
- [ ] If any provider result is unsafe/not seen, stop with Production data writes = 0.
- [ ] If all four are safe, execute exactly one atomic RPC write.
- [ ] If RPC response is ambiguous, use SELECT-only resolver and never auto-retry.
- [ ] Post-write reread exact four observation IDs and listings.
- [ ] Verify global deltas exactly +0 listings / +4 observations / +4 re-observed / +0 completed sold.
- [ ] Re-run Scoreboard and record actual history gain.
- [ ] Force another canonical sync after the Production persistence milestone.

R2 approval does not authorize R3/R4, schedules, workflow changes, Secrets/Variables or paid actions.

## Separate known workflow debt — not part of #184/#179 approval

Foundation baseline workflow still hardcodes the old eight migration versions.

- [x] Confirm run `33600534418` applied all 9 migrations before stale-list failure.
- [ ] Handle workflow repair only as a separate bounded workflow-change task with applicable approval.
- [ ] Do not silently edit the workflow inside #184 or #179.

## P2 — R3/R4 depth rollout — future separately approved

### R3 read-only
- [ ] Freeze 2 explicit variants, one Rakuten-first + one Yahoo-first.
- [ ] Max 5 safe accepted offers each / 10 total.
- [ ] Max 6 planner requests / 18 HTTP attempts.
- [ ] Obtain separate live provider/search approval.
- [ ] DB writes 0.

### R4 persistence
- [ ] Freeze only strict-safe R3 subset.
- [ ] <=10 new listing+initial-observation pairs.
- [ ] Insert-only; no existing-row update/delete.
- [ ] Obtain separate Production DB approval.
- [ ] Verify exact deltas and rerun Scoreboard.

## P3 — Licensed completed-sale / source expansion

- [ ] Maintain `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`.
- [ ] Recheck provider terms immediately before acting.
- [ ] Perform Aucfan commercial/data-rights diligence before payment/credentials.
- [ ] Build Mercari partnership dossier; never scrape Mercari or Amazon.

## P4 — Non-price signals

- [ ] Add timestamped provenance-bearing stock/inventory evidence.
- [ ] Keep official restock/re-release separate from inferred unavailability.
- [ ] Add preorder demand only at exact verified scope.
- [ ] Add X/social only with authorized paid access and bounded budget.

## P5 — Traffic / affiliate / GSC

- [ ] Restore/re-read authorized GSC reporting before current SEO performance claims.
- [ ] Preserve root/series/variant sitemap separation.
- [ ] Measure search impressions/clicks before pruning.
- [ ] Preserve strict affiliate provenance and provider+variant click attribution.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 without its required approval.
- [ ] Do NOT make more Yahoo provider calls under exhausted #172 approval.
- [ ] Do NOT apply the R2 Production migration/function without fresh exact #179 approval.
- [ ] Do NOT make the R2 live provider requests without fresh exact #179 approval.
- [ ] Do NOT execute R2 Production persistence without fresh exact #179 approval.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT purchase/activate Aucfan, X, GSC paid connector access or other paid/licensed source without approval.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

After every major Production/recovery/security/release milestone:

- update STATUS
- update HANDOFF
- update DECISIONS when durable rules changed
- reorder TODO
- use a docs-only PR
- merge and verify Production READY before next major implementation/execution

Do not rely on chat-limit warnings and do not bypass this gate merely because the user says 「続けて」.
