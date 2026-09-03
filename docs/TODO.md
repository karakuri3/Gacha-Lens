# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — R4 repository prerequisite merged / Issue #209 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #209.

- On branch `docs/canonical-sync-post-r4-prereq-209` or its open PR, finish P0-R below first.
- Once this content is on `main`, treat P0-R as complete and resume at **P1-L — fresh read-only Data Scale reassessment**.
- Do not create a recursive docs sync merely to mark #209's own merge.

## P0-A — F0 separate approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction not_started, DB writes/deletes0.
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

## P0-C — R1 / R2 chain — complete historical evidence

- [x] #172 R1 exact-provider read-only canary completed, Production writes0.
- [x] #173/#176 Yahoo JSONP exact-read repair merged and Production READY.
- [x] #180/#182 original R2 atomic repository prerequisite completed.
- [x] Original #179 Production attempt failed closed on first Rakuten not_found; remaining calls0/RPC0/writes0.
- [x] #187/#188 Yahoo-only R2 v2 repository prerequisite completed.
- [x] Yahoo-only R2 v2 Actions `33621881117` succeeded: attempts4/1 each/retry0/all unchanged/one atomic RPC.
- [x] Production 113/113/0 -> 113/117/4; sold0.
- [x] R2 workflows removed and approvals consumed.

Do not rerun R1/R2 merely to refresh evidence.

## P0-M — Reusable bounded history prerequisite — complete

- [x] #196 / replacement PR #198 merged generic bounded re-observation v1.
- [x] Explicit batch1..10, Yahoo+Rakuten exact identity, exact-main/full-snapshot digest.
- [x] Dry-run provider/RPC/write0.
- [x] Approved write path max3/listing/max30, provider pacing, all-safe-before-one-RPC.
- [x] Pre-RPC resolver manifest required; no automatic RPC retry.
- [x] Exact deterministic observation IDs and target invariants.
- [x] SECURITY INVOKER / empty search_path / service_role-only.
- [x] Generic Production schema installed once: ledger `20260902165958 / market_reobservation_bounded_v1`.

## P1-F through P1-I — First reusable bounded history batch — complete SUCCESS

- [x] Freeze Yahoo8 and observation key `reobs-v1:bounded-20260903-01`.
- [x] First manual digest `9940a558...` proved invalid; first run `33658579004` failed before provider loop with provider0/RPC0/writes0.
- [x] Remove failed one-shot; authority consumed.
- [x] Recompute complete merged-payload digest `1142a10b4c8818562b27f9222a388be073934ca83a33932c2dfca65a5d4782bf` against main `9859ab4d...`.
- [x] Run `33660684355` exactly once.
- [x] Yahoo attempts8 / exactly1 each / retry0 / rate-limit0 / timeout0.
- [x] Outcomes7 unchanged / 1 truthful price_changed.
- [x] `yahoo-toysanta-g-5l370018il-003-57693`: 568 -> 399, active remained active.
- [x] Exactly one bounded RPC, applied_count8.
- [x] Production 115/119/4 -> 115/127/12, sold0.
- [x] Every frozen target exactly two observations.
- [x] Remove workflow; cleanup `c4a058f5cda1ad770bd5340e9650217484a6028e`; final diff0/run count1/never merged.
- [x] Authority consumed; never rerun `33660684355`.

## P0-P — Post-history canonical sync #204/#205 — complete

- [x] Sync canonical four after #201 success.
- [x] Record Production 115/127/12/sold0 and 10.43% history checkpoint.
- [x] Merge docs-only PR #205.
- [x] Normal Git-triggered Vercel Production release READY.

## P1-J — Read-only post-history Scoreboard reassessment #206 — complete

- [x] Re-fetch Production at 115 listings / 127 observations / 12 re-observed / sold0.
- [x] Confirm history 12/115 = 10.4348% passed first 10% threshold at that snapshot.
- [x] Measure fresh depth: 104 variants x1 / 1 x2 / 0 x3+ among 105 fresh covered variants.
- [x] Identify then-current automatic P0 bottleneck: **`depth_insufficient`**.
- [x] Choose two explicit demand-weighted R3 read-only targets: Buzz Rakuten-first + 伏黒恵 Yahoo-first.

## P1-K — R3 depth read-only execution #206 — complete SUCCESS

- [x] Exact approved main `b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`.
- [x] Disposable branch `ops/r3-depth-one-shot-206-20260903`.
- [x] Actions `33665350076`, job `100365611263`: SUCCESS, attempt1.
- [x] Artifact `r3-depth-206-evidence`, ID `9860342840`, digest `sha256:a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`.
- [x] Pre-provider exact-main/catalog/depth/unresolved gates PASS.
- [x] Planner requests5 / HTTP attempts5 / retry0 / timeout0 / rate-limit0 / permanent failures0.
- [x] Buzz: 3 requests, new strict-safe0, duplicate/existing1.
- [x] 伏黒恵: 2 requests, raw5, new strict-safe1.
- [x] Freeze candidate `yahoo-suruga-ya-601199451001`, native `yahoo_shopping:suruga-ya_601199451001`, price980, active.
- [x] Candidate key `1091dce22a0bf29f` / fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`.
- [x] Production writes0 / RPC0 / migration0.
- [x] Remove workflow; cleanup `4815827a911737eacb758845cf8d671c629a874e`; final diff0/run count1/never merged/no workflow_dispatch.
- [x] #206 authority consumed; never rerun `33665350076` without new exact authorization.

## P0-Q — R4 atomic depth repository prerequisite #207/#208 — complete

- [x] Add `market-depth-r4-persistence.js` domain contract.
- [x] Add dry-run/one-RPC runner and SELECT-only resolver.
- [x] Add migration `20260903033000_market_depth_r4_atomic_v1.sql`.
- [x] Add focused persistence/resolver/runner tests.
- [x] Freeze batch size1..10 / exact-main+manifest digest / unique approval namespace.
- [x] Require exact catalog/depth/unresolved/collision preconditions.
- [x] Insert listing + initial observation atomically in one RPC transaction.
- [x] No UPDATE/DELETE/completed sold/sold_at.
- [x] SECURITY INVOKER / empty search_path / service_role-only.
- [x] Pre-RPC resolver manifest mandatory / no automatic write retry.
- [x] Final exact PR head `e46b0c8c2e40b6f0b464cac703b982891a2d239c`.
- [x] Diff exactly7 added files / existing-file modifications0 / deletions0.
- [x] Code Quality `33670220550`: SUCCESS; 2062/2062 tests, lint, diff check PASS.
- [x] Exact-head Preview `dpl_2ejC77ayiEVzXBBhUA1w2Zt7K5y2`: READY.
- [x] Foundation `33670220535`: all12 migrations including R4 applied and DB reset completed; known stale expected-8 assertion then failed.
- [x] Strengthened self-review `5093856424`, no blocking finding; independent status not faked.
- [x] Receive one-time #208-only review substitution.
- [x] Record substitution limitation in PR and consume it on merge.
- [x] Mark Ready and squash merge with expected head.
- [x] Main becomes `10e097eaf11e70814a2d25bc1227e950f6b69d0f`; #207 closes.
- [x] Normal Git-triggered Production deployment `dpl_J3RwK5mbkfuyCPENVQFXEpCAwNgK` READY.
- [x] Confirm Supabase Production R4 function absent and candidate absent after repository release.

## P0-R — Post-R4-prerequisite canonical sync #209 — current phase gate

- [x] Create Issue #209.
- [x] Create branch `docs/canonical-sync-post-r4-prereq-209` from `10e097eaf11e70814a2d25bc1227e950f6b69d0f`.
- [x] Re-fetch current Production counts.
- [x] Detect denominator growth to **127 listings / 139 observations / 12 re-observed / sold0**.
- [x] Record current history ratio **12/127 ~=9.45%**, below the first 10% threshold again.
- [x] Confirm R4 function absent / candidate absent / target existing fresh depth unchanged.
- [x] Update `HANDOFF.md`.
- [x] Update `STATUS.md`.
- [x] Update `DECISIONS.md`.
- [x] Update `TODO.md`.
- [ ] Cross-file consistency self-review; disclose docs-only non-independence.
- [ ] Verify branch diff exactly these four docs-only files.
- [ ] Open docs-only PR `Closes #209`.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Confirm no unresolved GitHub/Vercel threads and safe main/base drift.
- [ ] Squash merge under docs-only safe auto-merge policy if all gates pass.
- [ ] Verify #209 closed and normal Git-triggered Vercel Production READY.

Once this content reaches `main`, P0-R is complete by definition. Do not create another sync merely to record #209's own merge.

## P1-L — Fresh read-only Data Scale reassessment — NEXT after #209

**Do this before any R4 Production request.**

Current reason: the live denominator changed after R3. History was 10.43% at 115 listings but is now about 9.45% at 127 listings.

- [ ] Re-fetch exact current main after #209 merge.
- [ ] Re-fetch live Production listings / observations / re-observed / completed-sold.
- [ ] Recompute current fresh safe depth distribution (x1/x2/x3+), depth p50/p90/max.
- [ ] Recompute fresh catalog/source coverage and other Scoreboard inputs needed by `docs/DATA_SCALE_SCOREBOARD.md`.
- [ ] Determine the current reviewed automatic P0 bottleneck from live data; do not carry forward `depth_insufficient` by assumption.
- [ ] Inspect recent approved P3 breadth runs only enough to understand denominator growth; do not over-attribute without run evidence.
- [ ] Compare expected user/revenue leverage of: another bounded history batch, R4 depth persistence, lawful breadth/source work, or transition toward TRAFFIC/CLICK/REVENUE.
- [ ] Pick exactly one next DATA move.

## P1-M — R4 Production depth persistence — conditional future boundary

Proceed only if P1-L fresh evidence says depth/R4 is still the highest-leverage next move.

- [ ] Fresh SELECT-only preflight on current main and current Production.
- [ ] Confirm target variant/series/review-safe state unchanged.
- [ ] Confirm 伏黒恵 fresh safe depth exact expected listing set.
- [ ] Confirm unresolved target issues0.
- [ ] Confirm candidate listing/observation/provider-native/public-URL collisions0.
- [ ] Confirm R4 function Production presence/absence directly.
- [ ] Rebuild complete frozen R4 manifest + batch digest against the then-current main.
- [ ] Request fresh exact human approval for R4 Production migration application (if absent) + exactly one atomic RPC for the frozen batch.
- [ ] If a disposable credentialed one-shot workflow is necessary, obtain separate explicit workflow authorization.
- [ ] No provider discovery inside write mode.
- [ ] Preserve resolver manifest before RPC.
- [ ] No automatic RPC retry; ambiguous outcome -> SELECT-only resolver.
- [ ] After any successful/failed Production milestone, force canonical sync again before next major phase.

## P1-N — Additional bounded history — conditional alternative

If P1-L says history is again the reviewed P0 bottleneck:

- [ ] Do not execute R4 by sunk-cost logic.
- [ ] Select a fresh review-safe cohort under generic bounded v1.
- [ ] Freeze exact current main, snapshots, prior observation counts and full persisted identities.
- [ ] Build digest only with merged repository semantics.
- [ ] Request a fresh exact provider/RPC approval and any necessary one-shot workflow authority.
- [ ] Never reuse #201 approvals/tokens/workflows.

## Separate known workflow debt

- [x] #182: 9 migrations applied before stale expected-8 failure.
- [x] #188: 10 applied.
- [x] #197/#198: 11 applied.
- [x] #208: **12 applied**, including R4.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded Production-capable workflow-change task with applicable approval.

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
- [ ] If P1-L shows useful Data Scale sufficient, move here instead of extending infrastructure for its own sake.

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 without its required approval.
- [ ] Do NOT make more Yahoo calls under exhausted #172 approval.
- [ ] Do NOT rerun original R2 v1 `33605362604`.
- [ ] Do NOT rerun successful R2 v2 `33621881117`.
- [ ] Do NOT rerun failed first generic run `33658579004`.
- [ ] Do NOT rerun successful generic run `33660684355`.
- [ ] Do NOT rerun R3 `33665350076` under consumed #206 authority.
- [ ] Do NOT reuse #201 or #206 provider/workflow authority.
- [ ] Do NOT reuse #208 review substitution for any future PR or Production action.
- [ ] Do NOT invoke old R2 RPCs merely because functions exist.
- [ ] Do NOT reapply R2 migrations or generic bounded v1 migration.
- [ ] Do NOT apply R4 Production migration or invoke R4 RPC without fresh exact approval.
- [ ] Do NOT make new generic Yahoo/Rakuten provider calls or bounded RPC writes without fresh exact approval.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT change Secrets/Variables by implication.
- [ ] Do NOT enable Kitan/Qualia automatic writes by implication.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Keep `.github/workflows/gacha-ingestion.yml` disabled.
