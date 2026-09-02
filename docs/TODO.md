# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — reusable bounded re-observation repository prerequisite / Issue #199 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #199.

- On branch `docs/canonical-sync-post-bounded-prereq-199` or its open PR, finish the P0-N canonical-sync gate below.
- Once this content is on `main`, treat P0-N as complete and resume at P1-F.
- Do not create a recursive docs sync merely to mark #199's own merge.

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

## P0-C — R1 / Yahoo repair / original R2 chain — complete historical evidence

- [x] #172 R1 exact-provider canary completed, Production writes 0.
- [x] #173/#176 Yahoo JSONP exact-read repair merged and Production READY.
- [x] #177/#178 post-Yahoo canonical sync completed.
- [x] #180/#182 original R2 atomic repository prerequisite completed.
- [x] #183/#184 post-prerequisite canonical sync completed.
- [x] First original #179 Production attempt failed closed on first Rakuten `not_found`; remaining calls 0, RPC 0, writes 0.
- [x] #185/#186 post-failed-attempt canonical sync completed.

Old R1/R2 approvals are consumed and grant no new authority.

## P0-D — Yahoo-only R2 v2 repository/schema/execution chain — complete SUCCESS

- [x] #187/#188 separate Yahoo-only R2 v2 repository prerequisite merged.
- [x] #189/#190 canonical sync completed.
- [x] Fresh exact v2 preflight/digest/approval completed.
- [x] Apply reviewed v2 Production migration under exact approval; ledger `20260902095120`, name `r2_yahoo_only_reobservation_canary_v2`.
- [x] #191/#192 post-migration canonical sync completed.
- [x] Execute one-shot Actions `33621881117` exactly once.
- [x] Yahoo attempts 4 total / 1 each / retries 0 / all outcomes `unchanged`.
- [x] Invoke exactly one verified atomic v2 RPC after all four safe plans.
- [x] Production 113->113 listings / 113->117 observations / 0->4 re-observed / completed sold 0.
- [x] Verify deterministic v2 rows 4/4 and each target exactly two observations.
- [x] Remove one-shot workflow immediately; branch final file diff 0; run count exactly 1; never merge branch.
- [x] #193/#194 post-success canonical sync merged and Production READY.
- [x] Close #179 completed.

**R2 first truthful repeated-history objective is achieved. Do not rerun it merely to refresh evidence.**

## P0-M — Reusable bounded re-observation repository prerequisite #196/#198 — complete

Reason: post-R2 history coverage is only 4/113 ~=3.54%; current Scoreboard threshold is 10%. Do not create another bespoke hardcoded eight-row canary.

- [x] #195 read-only reassessment selects reusable history compounding before automatic R3.
- [x] Create Issue #196.
- [x] Add generic bounded v1 domain/runner/SELECT-only resolver/migration.
- [x] Batch supports explicit 1..10 listings.
- [x] Support Yahoo + Rakuten exact persisted identities.
- [x] Freeze exact current-main/cohort/snapshot/prior-count digest and distinct approval namespace.
- [x] Prior observation count >1 supported when exact.
- [x] Dry-run provider/RPC/write = 0.
- [x] Future write budget max3/listing / max30 total with current provider pacing.
- [x] Require all safe plans before exactly one atomic RPC.
- [x] Require pre-RPC sanitized resolver manifest; no automatic retry.
- [x] Bind exact listing and deterministic observation ID result sets.
- [x] Separate canonical URL identity from exact persisted DB URL/raw identity.
- [x] Lock listing/observation/import-issue race paths in bounded transaction.
- [x] Keep exact target invariants while making global scoreboard checks concurrency-tolerant.
- [x] Preserve no-sold/no-sold_at and service_role-only SECURITY INVOKER contract.
- [x] Add focused persistence/runner/resolver tests.
- [x] Final frozen implementation head `c6372d9f3a1857a2d18302c1a4118cf685e13ece`.
- [x] PR Code Quality #198 run `33655012819` SUCCESS.
- [x] Exact-head Preview `dpl_8Pc5xkekW6iM53XNXu2p4j1y4fz3` READY and attached/reused by #198.
- [x] Foundation `33655012798`: all 11 migrations applied successfully, then known stale expected-8 assertion failed.
- [x] Consume #196/#197-only review substitution through byte-identical replacement PR #198.
- [x] Close Draft #197 unmerged after Draft->Ready connector defect; create non-Draft byte-identical #198 with no code commit changes.
- [x] Squash merge #198 as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`.
- [x] Verify Issue #196 closed.
- [x] Fresh post-merge Production SELECT: generic bounded function absent, generic ledger absent, Production still 113/117/4/sold0.

Repository prerequisite is complete. **Production generic migration/provider/RPC execution remains unapproved.**

## P0-N — Post-#198 canonical sync #199 — current phase gate

- [x] Create Issue #199 from exact main `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`.
- [x] Create branch `docs/canonical-sync-post-bounded-prereq-199`.
- [x] Update only `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record #197 Draft-ready connector defect and #198 byte-identical replacement path.
- [x] Record #198 CI/Preview/disposable migration proof and consumed review substitution.
- [x] Record generic Production function/ledger absent and 113/117/4/sold0 unchanged.
- [x] Record next generic Production migration/provider/RPC boundary as fresh-approval-only.
- [ ] Cross-file consistency self-review under docs-only small-task rule; disclose non-independence.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Confirm no unresolved GitHub/Vercel threads and main drift safe.
- [ ] Squash merge only if Auto-Merge + Standing Production Release gates pass.
- [ ] Verify normal Git-triggered Vercel Production READY.

Once this content reaches `main`, P0-N is closed by definition; do not create a recursive sync just to record #199's own merge.

## P1-F — First reusable bounded history batch planning — next after #199

**Read-only planning only until a new human Production approval is granted.**

Goal: prepare an 8-10 listing first generic bounded batch that can raise truthful history coverage toward/through the current 10% Scoreboard threshold without another hardcoded canary.

- [ ] Re-fetch current main and Production after #199 release.
- [ ] SELECT-only enumerate existing marketplace listings with exact durable provider/native/public identity.
- [ ] Prefer listings with exactly one observation so each safe write increases re-observed coverage by one.
- [ ] Require `listing_type=single`, `market_review_type=single`, `review_required=false`, `matched_variant_id=variant_id`, `sold_at=null`, positive price, active/sold_out, no unresolved import issue.
- [ ] Require sufficiently old/freshness-appropriate `last_observed_at` for a truthful new observation bucket.
- [ ] Use provider evidence quality rather than cosmetic Yahoo/Rakuten symmetry.
- [ ] Freeze 8-10 exact listing IDs, snapshots and exact prior observation counts.
- [ ] Freeze a new observation key.
- [ ] Compute deterministic observation IDs and verify 0 collisions.
- [ ] Compute cohort digest bound to then-current main.
- [ ] Run/inspect generic dry-run only if practical; provider calls 0, RPC 0, Production writes 0.
- [ ] Produce an exact execution proposal: Production migration application + provider attempt budget (<=3/listing, <=30 total) + exactly one RPC only if all plans safe + no auto retry.
- [ ] Obtain fresh explicit human approval before applying generic migration or making any live provider/RPC calls.
- [ ] If a credentialed one-shot workflow is still needed, obtain separate exact workflow authority unless explicitly included in the new approval.

Success planning state is a frozen, collision-free, review-safe cohort and exact approval identity — **not** a Production write.

## P1-G — First reusable bounded Production execution — future human-bound

Only after P1-F evidence and exact approval:

- [ ] Apply `20260902213000_market_reobservation_bounded_v1.sql` to Production once.
- [ ] Verify SECURITY INVOKER / empty search_path / service_role-only EXECUTE.
- [ ] Verify migration alone changes market data by 0.
- [ ] Execute only the approved frozen exact-provider envelope.
- [ ] Fail closed before RPC on any unsafe target.
- [ ] Invoke exactly one bounded RPC only if every target plan is safe.
- [ ] No automatic RPC retry.
- [ ] If commit transport is ambiguous, use the prewritten SELECT-only resolver manifest.
- [ ] Verify exact target rows/IDs/counts and concurrency-safe global scoreboard deltas.
- [ ] Force canonical sync immediately after any Production execution milestone.

## Separate known workflow debt

- [x] #182 Foundation: 9 migrations applied before stale expected-8 failure.
- [x] #188 Foundation: 10 migrations applied before stale expected-8 failure.
- [x] #197/#198 Foundation: 11 migrations applied before stale expected-8 failure.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded Production-capable workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

Do not advance automatically just because R2 succeeded.

- [ ] Re-evaluate R3 priority after reusable history coverage improves or if new scorecard evidence changes the bottleneck.
- [ ] R3 candidate: bounded read-only depth collection for explicit variants, separately authorize applicable live provider/search envelope, Production DB writes 0.
- [ ] R4 candidate: persist only strict-safe R3 subset, separate Production DB approval.

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
- [ ] Do NOT rerun original #179 v1 run `33605362604` or reuse its approval/token.
- [ ] Do NOT rerun successful R2 v2 run `33621881117` or recreate/reuse its workflow authorization.
- [ ] Do NOT invoke v1/v2 R2 RPC merely because functions exist.
- [ ] Do NOT reapply completed v1/v2 Production migrations.
- [ ] Do NOT apply generic bounded v1 Production migration without fresh exact approval.
- [ ] Do NOT make generic Yahoo/Rakuten provider calls or generic RPC writes without fresh exact approval.
- [ ] Do NOT execute R3/R4 by implication.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT change Secrets/Variables by implication.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Keep `.github/workflows/gacha-ingestion.yml` disabled.
