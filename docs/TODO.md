# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — first successful reusable bounded history batch / Issue #204 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #204.

- On branch `docs/canonical-sync-post-bounded-success-204` or its open PR, finish the P0-P canonical-sync gate below.
- Once this content is on `main`, treat P0-P as complete and resume at P1-J.
- Do not create a recursive docs sync merely to mark #204's own merge.

## P0-A — F0 separate approval boundary

- [x] Prove scheduled F0 run `33484450472` failed closed with transaction not_started, DB writes/deletes 0.
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

## P0-C — R1 / original R2 historical chain — complete

- [x] #172 R1 exact-provider canary completed, Production writes 0.
- [x] #173/#176 Yahoo JSONP exact-read repair merged and Production READY.
- [x] #180/#182 original R2 atomic repository prerequisite completed.
- [x] Original #179 Production attempt failed closed on first Rakuten not_found; remaining calls0/RPC0/writes0.
- [x] Post-failed-attempt canonical sync completed.

Old R1/R2 approvals are consumed.

## P0-D — Yahoo-only R2 v2 — complete SUCCESS

- [x] #187/#188 Yahoo-only v2 repository prerequisite merged.
- [x] Reviewed v2 Production migration applied; ledger `20260902095120 / r2_yahoo_only_reobservation_canary_v2`.
- [x] Actions `33621881117` executed exactly once.
- [x] Yahoo attempts 4 total / 1 each / retry0 / all unchanged.
- [x] Exactly one verified atomic v2 RPC.
- [x] Production 113/113/0 -> 113/117/4 for listings/observations/re-observed; sold0.
- [x] Deterministic rows4/4; each target exactly two observations.
- [x] Workflow removed; final branch diff0/run count1/never merged.
- [x] Post-success canonical sync completed.

Do not rerun R2 merely to refresh evidence.

## P0-M — Reusable bounded re-observation repository prerequisite #196/#198 — complete

- [x] #195 selects reusable history compounding before automatic R3.
- [x] Add generic bounded domain/runner/SELECT-only resolver/migration.
- [x] Explicit batch size 1..10.
- [x] Yahoo + Rakuten exact persisted identity support.
- [x] Exact-main/cohort/snapshot/prior-count digest + distinct approval namespace.
- [x] Prior observation count >1 supported when exact.
- [x] Dry-run provider/RPC/write0.
- [x] Future approved write budget max3/listing / max30 total with provider pacing.
- [x] Require all-safe before exactly one RPC.
- [x] Require pre-RPC sanitized resolver manifest; no automatic retry.
- [x] Exact listing/deterministic observation result sets.
- [x] Separate canonical identity from persisted DB URL/raw identity.
- [x] Protect listing/observation/import-issue race paths.
- [x] Exact target invariants + concurrency-tolerant global count checks.
- [x] No-sold/no-sold_at; SECURITY INVOKER; service_role-only.
- [x] Focused tests and exact-head CI/Preview/disposable migration proof.
- [x] Final implementation head `c6372d9f3a1857a2d18302c1a4118cf685e13ece`.
- [x] Byte-identical replacement PR #198 merged as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c` after Draft->Ready connector defect on #197.
- [x] #196 closed.

## P0-N — Post-prerequisite canonical sync #199/#200 — complete

- [x] Canonical four updated.
- [x] Code Quality `33656178555` SUCCESS.
- [x] Preview `dpl_FRXK3zijJnjvamSAaRAmMrEJNg1P` READY.
- [x] PR #200 merged; main became `0a509fe5813216b529b6192e41fb0875b28d10db`.
- [x] Production deployment `dpl_EJRVBn8vH1ZE9eSB2F8divjangNh` READY.
- [x] #199 closed.

## P1-F — First reusable bounded batch planning #201 — complete

- [x] Detect legitimate P3 breadth drift to 115 listings / 119 observations / 4 re-observed / sold0 via run `33655998914`.
- [x] Freeze Yahoo cohort: Lead Netstore6 + Toysanta2.
- [x] Freeze observation key `reobs-v1:bounded-20260903-01`.
- [x] Require review-safe exact persisted identities, sold_at=null, prior count1, unresolved0.
- [x] Compute deterministic IDs; collision0/8.
- [x] Project all-safe +8 history => 12/115 = 10.43% at then-current denominator.
- [x] First recorded digest `9940a558...` later proved incorrect; preserve as superseded audit evidence.
- [x] Root cause: manual digest reproduction omitted persisted identity fields included by merged `frozenCohortEntry()`.

## P1-G — First reusable bounded Production attempt #201 — migration SUCCESS / data execution FAIL-CLOSED

- [x] Apply reviewed generic bounded migration once.
- [x] Verify ledger `20260902165958 / market_reobservation_bounded_v1`.
- [x] Verify function SECURITY INVOKER / empty search_path / service_role-only.
- [x] Verify migration alone leaves market data 115/119/4/sold0.
- [x] First one-shot `33658579004` guard PASS.
- [x] Fail closed at approval validation before provider loop due invalid digest.
- [x] Prove provider0/RPC0/writes0.
- [x] Do not rerun first one-shot.
- [x] Remove first workflow; cleanup `772f687c339fd729f3e11c682649926e4ca52645`; final diff0/run count1/never merged.
- [x] First exact approval consumed/non-reusable.

## P0-O — Post-first-attempt canonical sync #202/#203 — complete

- [x] Preserve invalid digest as superseded evidence.
- [x] Record generic schema installed, data execution not yet successful.
- [x] Record first run provider0/RPC0/writes0 and workflow cleanup.
- [x] Recompute post-sync digest against main `9859ab4d1d92043cc914dd00ea5814eff614e6f3`.
- [x] PR #203 merged; #202 closed.
- [x] Production deployment for #203 READY.

## P1-H — Post-sync #201 revalidation — complete

- [x] Re-fetch exact main `9859ab4d1d92043cc914dd00ea5814eff614e6f3`.
- [x] Re-select same Yahoo8.
- [x] Verify target snapshots exact, prior count1 each, unresolved0, collision0.
- [x] Verify generic function/ledger/security; do not reapply migration.
- [x] Compute repository-equivalent cohort digest `1142a10b4c8818562b27f9222a388be073934ca83a33932c2dfca65a5d4782bf`.
- [x] Obtain fresh exact human approval for Yahoo8 max3 each/max24 total, >=1000ms pacing, one RPC iff all safe, no RPC retry, SELECT-only resolver if ambiguous, and one disposable push-trigger workflow.

## P1-I — First reusable generic bounded data execution — complete SUCCESS

- [x] Create disposable branch `ops/bounded-reobs-one-shot-201-retry-20260903` from exact approved main.
- [x] Add exactly one branch-only push-trigger workflow using existing Secrets only.
- [x] Run Actions `33660684355` exactly once; job `100350188660`.
- [x] Exact-main + one-file branch guard PASS.
- [x] Yahoo provider attempts **8 total / exactly 1 each / retry0**.
- [x] Rate-limit0 / timeout0.
- [x] Outcomes **7 unchanged / 1 price_changed**.
- [x] Truthful price change: `yahoo-toysanta-g-5l370018il-003-57693` **568 -> 399**, status active.
- [x] Pre-RPC resolution manifest preserved.
- [x] Invoke exactly one bounded RPC after all eight safe plans.
- [x] RPC verified, applied_count8.
- [x] Exact lane deltas: listings0 / observations+8 / re-observed+8 / sold0.
- [x] Independent Production SELECT verifies 115 listings / 127 observations / 12 re-observed / sold0.
- [x] Deterministic rows8/8; every frozen target exactly two observations.
- [x] History coverage reaches **12/115 ~=10.43%**, crossing first 10% Scoreboard threshold.
- [x] Artifact ID `9858557931` saved.
- [x] Remove workflow immediately; cleanup `c4a058f5cda1ad770bd5340e9650217484a6028e`.
- [x] Verify disposable branch final file diff0, push-trigger run count1, never merged.
- [x] Mark retry approval/token/workflow authority consumed/non-reusable.
- [x] Never rerun `33660684355`.

## P0-P — Post-success canonical sync #204 — current phase gate

- [x] Add durable success evidence to #201.
- [x] Create Issue #204.
- [x] Create branch `docs/canonical-sync-post-bounded-success-204` from main `9859ab4d...`.
- [x] Update exactly `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record 8 attempts / 1 each / retry0 and exact provider outcomes.
- [x] Record one truthful price change 568 -> 399.
- [x] Record exactly one RPC +8 observations/+8 re-observed/sold0.
- [x] Record Production 115/127/12/sold0 and 10.43% history coverage.
- [x] Record workflow cleanup/final diff0/run count1/non-merge.
- [x] Record retry approval consumed and no rerun.
- [ ] Cross-file consistency self-review; disclose docs-only non-independence.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Confirm no unresolved GitHub/Vercel threads and main drift safe.
- [ ] Squash merge if docs-only gates pass.
- [ ] Verify normal Git-triggered Vercel Production READY.

Once this content reaches `main`, P0-P is closed by definition; do not create a recursive sync merely to record #204's merge.

## P1-J — Reassess Data Scale bottleneck after history threshold — next after #204

**Read-only first.**

Goal: determine the single next DATA move after repeated-history coverage crossed the first 10% threshold.

- [ ] Re-fetch current main and live Production counts.
- [ ] Re-run/re-read the current Data Scale Scoreboard inputs without writing Production data.
- [ ] Confirm live history coverage remains above the first threshold after any independent P3 breadth growth.
- [ ] Measure current breadth, repeated-history, depth and source/provenance gaps separately.
- [ ] Compare at least four options: more bounded history, R3 depth read-only, lawful breadth expansion, source/provenance quality repair.
- [ ] Rank by expected user value and revenue leverage under DATA -> TRAFFIC -> CLICK -> REVENUE.
- [ ] Choose one next DATA experiment only after evidence identifies the bottleneck.
- [ ] If the defined useful Data Scale threshold is now sufficient, shift priority to TRAFFIC/GSC/affiliate click evidence rather than continued infrastructure.
- [ ] Keep all Production/provider execution fresh-approval-only.

## P2 — R3/R4 depth rollout — future separately approved

Do not advance automatically because history threshold passed.

- [ ] Re-evaluate R3 priority only after P1-J evidence.
- [ ] R3 candidate: bounded read-only depth collection for explicit variants; separately authorize applicable live provider/search envelope; Production writes0.
- [ ] R4 candidate: persist only strict-safe R3 subset; separate Production DB approval.

## Separate known workflow debt

- [x] #182: 9 migrations applied before stale expected-8 failure.
- [x] #188: 10 migrations applied before stale expected-8 failure.
- [x] #197/#198: 11 migrations applied before stale expected-8 failure.
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

## Hold — do not do without explicit approval/new evidence

- [ ] Do NOT merge #142 or manually dispatch F0 without its required approval.
- [ ] Do NOT make more Yahoo calls under exhausted #172 approval.
- [ ] Do NOT rerun original R2 v1 `33605362604`.
- [ ] Do NOT rerun successful R2 v2 `33621881117`.
- [ ] Do NOT rerun failed first generic run `33658579004`.
- [ ] Do NOT rerun successful generic run `33660684355`.
- [ ] Do NOT reuse either #201 approval/token/workflow authorization.
- [ ] Do NOT invoke old R2 RPCs merely because functions exist.
- [ ] Do NOT reapply R2 migrations or generic bounded v1 migration.
- [ ] Do NOT make new generic Yahoo/Rakuten provider calls or bounded RPC writes without fresh exact approval.
- [ ] Do NOT execute R3/R4 by implication.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT change Secrets/Variables by implication.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Keep `.github/workflows/gacha-ingestion.yml` disabled.
