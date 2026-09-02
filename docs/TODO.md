# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #183 / PR #184.

- On branch `docs/canonical-sync-post-r2-prereq-183` / open PR #184, finish the P0-H gate below.
- On `main`, #183/#184 is complete by definition and P0-H should be treated as closed; resume at P1 #179. Do not create another recursive docs sync just to update #184's own merge checkbox.

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
- [x] Complete Rakuten reads: 3 × not_found, HTTP 200, DB writes 0.
- [x] Diagnose Yahoo exact `/* */` padding under bounded continuation approval.
- [x] Complete final Yahoo reads: 2 unchanged / 1 not_found.
- [x] Consume Yahoo continuation budget exactly 9/9.
- [x] SELECT-reverify frozen rows unchanged with one observation each.
- [x] Close #172.

R1 grants no R2 authority.

## P0-D — Post-R1 canonical sync #174/#175 — complete

- [x] Sync canonical docs, validate, merge #175, verify Production READY.

## P0-E — Yahoo JSONP repair #173/#176 — complete

- [x] Permanently accept only fixed raw-byte-0 callback or exact raw-byte-0 `/* */` + fixed callback.
- [x] Repair independent-review leading-byte and callback-override findings.
- [x] Final independent Reviewer + Verifier PASS.
- [x] Full validation / CI / Preview PASS.
- [x] Merge #176 and verify Production READY.

## P0-F — Post-Yahoo canonical sync #177/#178 — complete

- [x] Sync four canonical docs.
- [x] Merge #178 under its task-specific substitution and verify Production READY.

## P0-G — R2 atomic persistence prerequisite #180/#182 — complete in repository

- [x] Freeze exact #179 four-listing cohort and key `reobs-v1:r2-20260902-01`.
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
- [x] Disposable Supabase `33600534418`: all 9 migrations applied; stale 8-version assertion only failure.
- [x] Apply #180/#182-only review substitution.
- [x] Merge #182 as `d80450626fd30768bb8f0af68340f0d2aea00bbb` and verify Production `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` READY.
- [x] Confirm Production R2 migration/function still absent; R2 provider/write counts 0.

## P0-H — Post-#182 canonical sync #183 / PR #184

Completed on PR branch before the latest authorization record:

- [x] Re-fetch pre-sync main `d80450626fd30768bb8f0af68340f0d2aea00bbb`.
- [x] Verify #182 Production READY.
- [x] SELECT-read Production baseline: 113 listings / 113 observations / 0 re-observed / 0 completed sold / 0 sold_out.
- [x] SELECT-reverify frozen #179 cohort: 4/4 active, single/review-safe, one observation each, unresolved import issues 0.
- [x] SELECT-verify Production migration `20260902150500` and R2 RPC function absent.
- [x] Create Issue #183 / PR #184 from exact main.
- [x] Keep changed paths exactly HANDOFF / STATUS / DECISIONS / TODO.
- [x] Preserve Decision IDs and repair canonical-sync self-reference behavior.
- [x] Human explicitly authorizes **#184 only** to substitute exact-head CI + exact-head Vercel Preview + strengthened full-diff self-review for independent Reviewer + Verifier.

Remaining **only while this file is on PR #184 branch**:

- [ ] Exact-head PR Code Quality PASS on the final head containing the #184-specific authorization record.
- [ ] Exact-head Vercel Preview READY on that same head.
- [ ] Strengthened full-diff/canonical-consistency self-review PASS on that same head with no unresolved blocking finding.
- [ ] Confirm main has not moved / branch behind main 0 and changed paths remain exactly four docs.
- [ ] Merge #184 only if all remaining Auto-Merge / Standing Production Release gates pass.
- [ ] Verify the resulting normal Git-triggered Production deployment READY.

When this file reaches `main`, treat P0-H as closed and resume P1. The #184 substitution does not authorize anything in P1.

## P1 — R2 tiny Production re-observation persistence #179 — next after #184 reaches main

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
2. [ ] allow fresh exact provider reads for the frozen four, max 3 attempts/listing and max 12 total;
3. [ ] only if all four are valid exact `seen`, allow one atomic RPC write with:
   - market listings +0
   - observations +4
   - re-observed listings +4
   - completed `sold` +0
   - deletes 0
   - protected identity/provenance changes 0
   - exactly four listing updates limited to price/status/last_observed_at/updated_at

- [ ] Obtain fresh explicit human approval for that exact combined #179 scope.

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

## Separate known workflow debt

- [x] Confirm Foundation run `33600534418` applied all 9 migrations before stale-list failure.
- [ ] Repair workflow only as a separate bounded workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

- [ ] R3: freeze 2 explicit variants, <=10 accepted offers total, obtain separate live provider/search approval, DB writes 0.
- [ ] R4: persist only strict-safe R3 subset, <=10 new listing+observation pairs, obtain separate Production DB approval.

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
- [ ] Do NOT apply the R2 Production migration/function without fresh exact #179 approval.
- [ ] Do NOT make the R2 live provider requests without fresh exact #179 approval.
- [ ] Do NOT execute R2 Production persistence without fresh exact #179 approval.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT purchase/activate paid/licensed sources without approval.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Do NOT re-enable `.github/workflows/gacha-ingestion.yml`.

## Forced handoff hygiene

After every major Production/recovery/security/release milestone: update STATUS/HANDOFF/DECISIONS/TODO as needed, use a docs-only PR, merge and verify Production READY before the next major implementation/execution phase.
