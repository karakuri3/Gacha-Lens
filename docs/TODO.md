# Gacha Lens Ordered TODO

Updated: 2026-09-02 JST — post-R2 atomic prerequisite (#180/#182) checkpoint

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## P0-A — Keep F0 at its real approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction `not_started`, DB writes/deletes 0.
- [x] Trace blocker and create Issue #137 / PR #142 repair.
- [x] Verify #142 tests/lint/diff/Preview.
- [ ] Obtain remaining required review/explicit approval before merging #142.
- [ ] Do not manually rerun/dispatch F0 without separate approval.

## P0-B — Re-observation / depth / measurement foundations — complete

- [x] #150 re-observation engine.
- [x] #153 exact Rakuten/Yahoo provider reads, strict destination/redirect policy.
- [x] #156 Depth Collector, strict multi-offer identity/dedupe and selection binding.
- [x] #159 truthful read-only Data Scale Scoreboard.
- [x] #162 lawful source capability matrix.
- [x] #169 equal-time/null-time re-observation safety.
- [x] #170 Production history/depth rollout plan.

## P0-C — R1 exact-provider read-only canary — complete

Issue #172.

- [x] Freeze 6 known listings: 3 Rakuten + 3 Yahoo.
- [x] Confirm exact identity, single/review-safe status, one observation each, unresolved issues 0.
- [x] Recheck current official provider contracts.
- [x] Obtain explicit R1 provider-read approval.
- [x] Rakuten 3 exact reads: all HTTP 200, all `not_found`, DB writes 0.
- [x] Detect Yahoo Preview credential gap without making Yahoo request there.
- [x] Obtain separate approval for branch-only Yahoo continuation, max 9 attempts, DB access 0.
- [x] Run initial Yahoo 3 exact reads: HTTP 200, fail closed `invalid_jsonp_payload`.
- [x] Diagnose live response safely without raw-body/credential logging.
- [x] Establish exact live Yahoo JSONP padding `/* */` before exact callback.
- [x] Complete final Yahoo 3 strict one-off reads: 2 unchanged / 1 not_found, all HTTP 200.
- [x] Exhaust Yahoo continuation budget exactly 9/9; make no further call under that approval.
- [x] Reset temporary ops branch to canonical main and confirm identical.
- [x] SELECT-reverify frozen six rows unchanged, one observation each.
- [x] Record post-R1 Production-wide snapshot 110 listings / 110 observations / 0 re-observed; distinguish independent P3 growth from R1.
- [x] Close #172 completed.

R1 grants **no R2 authority**.

## P0-D — Post-R1 canonical sync — complete

Issue #174 / PR #175.

- [x] Update four canonical docs.
- [x] Pass exact-head validation and Preview.
- [x] Merge #175.
- [x] Verify resulting Production deployment `dpl_8PP2URX7qF9LRCD9UguM6JRPBFQ6` READY.

## P0-E — Yahoo exact JSONP padding repair #173/#176 — complete

- [x] Repair strict Yahoo JSONP compatibility without generic comment stripping.
- [x] Fix independent-review findings: raw byte-0 boundary and callback override.
- [x] Re-run final independent Reviewer + Verifier: PASS.
- [x] Focused/custom acceptance validation, full Node suite, lint, diff and secret review: PASS.
- [x] Exact-head PR Code Quality and Vercel Preview: PASS.
- [x] Merge #176 as `a8bf9b7d7da7826544cb72a89f77b082fd86f248`.
- [x] Verify Git-triggered Production `dpl_4U73Cev864RvycfGGPteqQxMS246` READY.
- [x] Close #173 completed.
- [x] Make no additional Yahoo provider call during permanent repair/merge.

## P0-F — Post-Yahoo repair canonical sync #177/#178 — complete

- [x] Sync exactly `HANDOFF / STATUS / DECISIONS / TODO`.
- [x] Record 113 listings / 113 observations / 0 re-observed / 0 completed sold.
- [x] Pass exact-head validation / Preview under the task-specific #178 review substitution granted at the time.
- [x] Merge PR #178 as `82ef2532253a99b1ba1c46b48a22442281c27442`.
- [x] Close Issue #177.
- [x] Verify normal Production deployment READY.

## P0-G — R2 atomic persistence prerequisite #180/#182 — complete in repository

Issue #180 / PR #182. This phase prepared the single-transaction writer only; it did not apply the migration or execute R2 in Production.

- [x] Freeze the exact #179 four-listing cohort and shared key `reobs-v1:r2-20260902-01` in the DB-side contract.
- [x] Add R2-specific PostgreSQL RPC migration with one atomic transaction.
- [x] Restrict RPC to `SECURITY INVOKER`, empty search path and `service_role` EXECUTE only.
- [x] Add exact identity/snapshot/one-prior-observation/import-issue/deterministic-ID guards.
- [x] Limit writes to 4 observation inserts + 4 listing snapshot updates; never `sold`/`sold_at`.
- [x] Add exact-head/cohort approval binding and DB-read-only dry-run.
- [x] Enforce exact provider reads, pacing, max 3 attempts/listing and max 12 total attempts.
- [x] Stop before RPC on any unsafe provider result.
- [x] Add one-RPC/no-auto-retry behavior and SELECT-only ambiguous-commit resolver.
- [x] Exact-head PR Code Quality `33600534520`: PASS.
- [x] Exact-head Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY.
- [x] Disposable Supabase run `33600534418`: all 9 migrations applied successfully.
- [x] Classify its red status correctly: stale workflow assertion expected 8 migrations but observed 9.
- [x] Apply the human's #180/#182-only substitution: exact-head CI + Preview + disposable migration proof + strengthened self-review in place of independent Reviewer/Verifier.
- [x] Merge #182 as `d80450626fd30768bb8f0af68340f0d2aea00bbb`.
- [x] Verify Git-triggered Production deployment `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` READY.
- [x] Close #180 completed.
- [x] Confirm Production migration/function remains un-applied/unavailable after merge.
- [x] Confirm R2 provider requests and Production DB writes remain 0.

The #180/#182 review substitution is **finished and non-transferable**.

## P0-H — Post-#182 canonical sync #183 — current gate

Issue #183. Branch `docs/canonical-sync-post-r2-prereq-183`.

Scope must remain exactly:

- `docs/HANDOFF.md`
- `docs/STATUS.md`
- `docs/DECISIONS.md`
- `docs/TODO.md`

Current work:

- [x] Re-fetch exact current main `d80450626fd30768bb8f0af68340f0d2aea00bbb`.
- [x] Verify #182 Production deployment `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` READY with canonical aliases.
- [x] SELECT-read Production baseline: 113 listings / 113 observations / 0 re-observed / 0 completed sold / 0 sold_out.
- [x] SELECT-reverify frozen #179 cohort: 4/4 present, active, single/review-safe, one observation each, unresolved import issues 0.
- [x] SELECT-verify Production migration `20260902150500` absent and R2 RPC function absent.
- [x] Create Issue #183 and branch from exact main.
- [x] Update `docs/HANDOFF.md`.
- [x] Update `docs/STATUS.md`.
- [x] Update `docs/DECISIONS.md`.
- [x] Update this ordered TODO.
- [ ] Confirm existing Decision IDs were preserved and new decisions use unused IDs.
- [ ] Confirm exactly four canonical docs changed and branch is based on current main.
- [ ] Create docs-only PR closing #183.
- [ ] Run canonical consistency/full-diff review and exact changed-path check.
- [ ] Pass exact-head PR Code Quality and Vercel Preview.
- [ ] Satisfy normal independent Reviewer + Verifier requirement; the #180/#182 exception does not carry forward.
- [ ] Merge only when Auto-Merge / Production Release gates pass.
- [ ] Verify exact Git-triggered Production deployment READY and close #183.

Do not start #179 Production execution before this gate closes.

## P1 — R2 tiny Production re-observation persistence #179 — final pre-execution gate after #183

Authoritative plan: `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`.

### Repository preparation — complete

- [x] Freeze exactly 4 known listings: 2 Rakuten + 2 Yahoo.
- [x] Freeze exact provider/native/public identity and review-safe single scope.
- [x] Freeze deterministic logical key and observation IDs.
- [x] Define atomic transaction and exact expected deltas.
- [x] Add fail-closed circuit breakers for provider/identity/price/availability/timestamp/snapshot/partial-write drift.
- [x] Add post-write verification and SELECT-only ambiguous-commit resolver.

### Fresh pre-execution reread — required after #183 closes

- [ ] Re-read current `main` and #179 immediately before approval request.
- [ ] Re-read current Production global counts.
- [ ] Re-read the four frozen listings and observation counts.
- [ ] Recheck deterministic observation-ID collisions.
- [ ] Recheck unresolved import issues.
- [ ] Recheck Production migration/function absence or exact current schema state.
- [ ] Recheck current Supabase function/security guidance before applying the migration.
- [ ] Freeze the exact current-main/cohort digest and approval token inputs.

### Hard Production approval gate

Present one exact request to the user covering all three actions together:

1. [ ] apply reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql` to Supabase Production;
2. [ ] allow fresh exact provider reads for the frozen four, max 3 attempts/listing and absolute max 12 HTTP attempts;
3. [ ] only if all four are valid exact `seen`, allow one atomic RPC write with expected successful deltas:
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
- [ ] Force another canonical sync immediately after the Production persistence milestone.

R2 approval does not authorize R3/R4, schedules, workflow changes, Secrets/Variables or paid actions.

## Separate known workflow debt — not part of #183/#179 approval

Foundation baseline workflow currently hardcodes the old eight migration versions.

- [x] Confirm run `33600534418` applied all 9 migrations before failing at the stale fixed-list assertion.
- [ ] Create/maintain a separate bounded workflow-repair task if/when workflow-change approval is appropriate.
- [ ] Do not silently edit the workflow inside #183 or #179.

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
- [ ] Evaluate other lawful API/feed/partner sources separately.

## P4 — Non-price signals

- [ ] Add timestamped provenance-bearing stock/inventory evidence.
- [ ] Keep official restock/re-release separate from inferred unavailability.
- [ ] Add preorder demand only at exact verified scope.
- [ ] Add X/social only with authorized paid access and bounded budget.
- [ ] Never fabricate popularity from weak proxies.

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

- [ ] update STATUS
- [ ] update HANDOFF
- [ ] update DECISIONS when durable rules changed
- [ ] reorder TODO
- [ ] use docs-only PR
- [ ] merge and verify Production READY before next major implementation/execution

Do not rely on chat-limit warnings and do not bypass this gate merely because the user says 「続けて」.
