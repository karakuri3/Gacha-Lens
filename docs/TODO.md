# Gacha Lens Ordered TODO

Updated: 2026-09-03 JST — first reusable bounded Production migration + fail-closed execution attempt / Issue #202 canonical sync

Work top-to-bottom unless newer verified evidence changes priority. Current umbrella: Issue #119 Data Scale.

## Canonical-sync interpretation

This file is authored by Issue #202.

- On branch `docs/canonical-sync-post-bounded-attempt-202` or its open PR, finish the P0-O canonical-sync gate below.
- Once this content is on `main`, treat P0-O as complete and resume at P1-H.
- Do not create a recursive docs sync merely to mark #202's own merge.

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

## P0-C — R1 / original R2 historical chain — complete

- [x] #172 R1 exact-provider canary completed, Production writes 0.
- [x] #173/#176 Yahoo JSONP exact-read repair merged and Production READY.
- [x] #180/#182 original R2 atomic repository prerequisite completed.
- [x] Original #179 Production attempt failed closed on first Rakuten `not_found`; remaining calls 0, RPC 0, writes 0.
- [x] Canonical sync after the failed attempt completed.

Old R1/R2 approvals are consumed and grant no new authority.

## P0-D — Yahoo-only R2 v2 chain — complete SUCCESS

- [x] #187/#188 Yahoo-only R2 v2 repository prerequisite merged.
- [x] Reviewed v2 Production migration applied; ledger `20260902095120 / r2_yahoo_only_reobservation_canary_v2`.
- [x] Execute one-shot Actions `33621881117` exactly once.
- [x] Yahoo attempts 4 total / 1 each / all `unchanged`.
- [x] Invoke exactly one verified atomic v2 RPC.
- [x] Production 113->113 listings / 113->117 observations / 0->4 re-observed / completed sold 0.
- [x] Verify deterministic v2 rows 4/4, each target two observations.
- [x] Remove one-shot workflow immediately; branch final diff 0; run count 1; never merge.
- [x] Post-success canonical sync #193/#194 complete.
- [x] Close #179 completed.

**Do not rerun R2 merely to refresh evidence.**

## P0-M — Reusable bounded re-observation repository prerequisite #196/#198 — complete

- [x] #195 read-only reassessment selects reusable history compounding before automatic R3.
- [x] Create Issue #196.
- [x] Add generic bounded v1 domain/runner/SELECT-only resolver/migration.
- [x] Batch explicit 1..10, Yahoo + Rakuten exact identities.
- [x] Exact current-main/cohort/snapshot/prior-count digest and distinct approval namespace.
- [x] Prior observation count >1 supported when exact.
- [x] Dry-run provider/RPC/write = 0.
- [x] Future write budget max3/listing / max30 total with provider pacing.
- [x] All-safe before exactly one atomic RPC.
- [x] Pre-RPC sanitized resolver manifest; no automatic retry.
- [x] Bind exact listing and deterministic observation ID result sets.
- [x] Separate canonical URL identity from persisted DB URL/raw identity.
- [x] Lock listing/observation/import-issue race paths.
- [x] Exact target invariants + concurrency-tolerant global scoreboard checks.
- [x] No-sold/no-sold_at; SECURITY INVOKER; service_role-only.
- [x] Focused tests and exact-head CI/Preview/disposable migration proof.
- [x] Final implementation head `c6372d9f3a1857a2d18302c1a4118cf685e13ece`.
- [x] Byte-identical replacement PR #198 squash merged as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c` after Draft->Ready connector defect on #197.
- [x] #196 closed.

## P0-N — Post-#198 canonical sync #199/#200 — complete

- [x] Update canonical four files.
- [x] Code Quality `33656178555` SUCCESS.
- [x] Preview `dpl_FRXK3zijJnjvamSAaRAmMrEJNg1P` READY.
- [x] PR #200 squash merged; canonical main became `0a509fe5813216b529b6192e41fb0875b28d10db`.
- [x] Production deployment `dpl_EJRVBn8vH1ZE9eSB2F8divjangNh` READY.
- [x] #199 closed.

## P1-F — First reusable bounded batch planning #201 — complete read-only planning

- [x] Detect legitimate P3 breadth drift to 115 listings / 119 observations / 4 re-observed / sold0 via run `33655998914`.
- [x] Freeze Yahoo cohort: Lead Netstore 6 + Toysanta 2.
- [x] Freeze observation key `reobs-v1:bounded-20260903-01`.
- [x] Require review-safe exact persisted identities, `sold_at=null`, prior count 1, unresolved issue 0.
- [x] Compute deterministic observation IDs; collision check 0/8.
- [x] Project all-safe +8 history => 12/115 = 10.43% at then-current denominator.
- [x] Obtain one-time human approval for migration + exact provider/RPC envelope + one disposable push-trigger workflow.

### Important superseded planning evidence

- [x] Original recorded cohort digest `9940a55824e90bf252259fb489455502b14eb4d4bf65dca92ab4ba69cd2f3b73` later proved **incorrect**.
- [x] Root cause identified: precomputation omitted persisted identity fields included by merged `frozenCohortEntry()`.
- [x] Pre-sync corrected repository-equivalent digest evidence is `e1f56e29178a339efdfaf38c66e127fe65db5c767e454cd4b2f9e04add4973c9` for main `0a509fe...`.
- [x] Mark both values as non-reusable after canonical main changes; digest must be recomputed post-sync.

## P1-G — First reusable bounded Production attempt #201 — migration SUCCESS / data execution FAIL-CLOSED

- [x] Recheck exact main, 8/8 target snapshots, prior counts, unresolved issues, deterministic collisions before consuming approval.
- [x] Apply reviewed `20260902213000_market_reobservation_bounded_v1.sql` to Production.
- [x] Verify ledger `20260902165958 / market_reobservation_bounded_v1`.
- [x] Verify function SECURITY INVOKER / empty search_path / service_role-only.
- [x] Verify migration alone leaves market data **115 listings / 119 observations / 4 re-observed / sold0**.
- [x] Create disposable branch `ops/bounded-reobs-one-shot-201-20260903` from exact approved main.
- [x] Add exactly one push-trigger workflow using existing Secrets only.
- [x] Execute Actions `33658579004` exactly once.
- [x] Guard step verifies approved main + one-file branch diff.
- [x] Runner fails closed at approval validation with `Bounded re-observation canary-write approval is invalid.`
- [x] Prove failure occurred before provider loop: Yahoo/provider attempts **0**.
- [x] Prove RPC calls **0** and market-data writes **0**.
- [x] Prove deterministic #201 rows **0/8** and all eight targets remain one observation.
- [x] Do **not** rerun `33658579004`.
- [x] Remove workflow immediately; cleanup commit `772f687c339fd729f3e11c682649926e4ca52645`.
- [x] Verify disposable branch final file diff 0, push-trigger run count 1, never merged.
- [x] Mark first #201 exact approval consumed/non-reusable.

Generic schema is installed; generic data execution has **not succeeded**.

## P0-O — Post-first-generic-attempt canonical sync #202 — current phase gate

- [x] Add durable #201 correction comment; preserve invalid `9940...` as superseded audit evidence.
- [x] Create Issue #202.
- [x] Create branch `docs/canonical-sync-post-bounded-attempt-202` from main `0a509fe...`.
- [x] Update exactly `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- [x] Record Production generic migration/ledger/security state.
- [x] Record run `33658579004` fail-closed before provider loop and provider/RPC/write 0.
- [x] Record workflow cleanup/final diff0/run count1/non-merge.
- [x] Record old #201 approval consumed and incorrect digest superseded.
- [x] Record requirement to recompute digest after this sync changes main SHA.
- [ ] Cross-file consistency self-review under docs-only small-task rule; disclose non-independence.
- [ ] Exact-head PR Code Quality PASS.
- [ ] Exact-head Vercel Preview READY.
- [ ] Confirm no unresolved GitHub/Vercel threads and main drift safe.
- [ ] Squash merge if all docs-only gates pass.
- [ ] Verify normal Git-triggered Vercel Production READY.

Once this content reaches `main`, P0-O is closed by definition; do not create a recursive sync just to record #202's own merge.

## P1-H — Post-sync #201 revalidation and fresh approval identity — next after #202

**SELECT-only until fresh human approval.**

- [ ] Re-fetch new canonical main and live Production counts.
- [ ] Re-select the same eight frozen Yahoo targets.
- [ ] Require exact identity/snapshot still matches, prior observation count 1 each, unresolved issue 0, deterministic observation-ID collisions 0.
- [ ] Re-verify generic function/ledger/security; **do not reapply migration**.
- [ ] Recompute cohort digest using merged repository semantics against the **new canonical main SHA**; do not reuse `9940...` or `e1f56e...`.
- [ ] If any target/main identity changed, stop and replan read-only.
- [ ] If safe, prepare fresh exact approval request covering only: eight Yahoo reads max3 each / max24 total, >=1000ms same-provider pacing, exactly one bounded RPC iff all eight plans safe, no RPC retry, SELECT-only resolver if ambiguous, and a new disposable branch-only push-trigger workflow if credentials require it.
- [ ] Treat previous #201 workflow/run-once authority as consumed; fresh workflow authorization required.

## P1-I — Future generic bounded data execution — human-bound

Only after P1-H fresh evidence and exact approval:

- [ ] Do not reapply migration; verify installed schema only.
- [ ] Create only the newly approved disposable execution mechanism.
- [ ] Execute only the approved exact Yahoo envelope.
- [ ] Fail closed before RPC on any unsafe target.
- [ ] Invoke exactly one bounded RPC only if all eight target plans are safe.
- [ ] No automatic RPC retry.
- [ ] If RPC transport/commit is ambiguous, use the prewritten SELECT-only resolver manifest.
- [ ] Verify exact target rows/IDs/counts and concurrency-safe global deltas.
- [ ] Force canonical sync immediately after any material Production execution milestone.

## Separate known workflow debt

- [x] #182 Foundation: 9 migrations applied before stale expected-8 failure.
- [x] #188 Foundation: 10 migrations applied before stale expected-8 failure.
- [x] #197/#198 Foundation: 11 migrations applied before stale expected-8 failure.
- [ ] Repair `.github/workflows/foundation-baseline.yml` only as a separate bounded Production-capable workflow-change task with applicable approval.

## P2 — R3/R4 depth rollout — future separately approved

Do not advance automatically just because R2 succeeded or generic schema is installed.

- [ ] Re-evaluate R3 priority after reusable history coverage improves or new scorecard evidence changes the bottleneck.
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
- [ ] Do NOT rerun successful R2 v2 run `33621881117` or reuse its workflow authorization.
- [ ] Do NOT rerun failed generic run `33658579004`.
- [ ] Do NOT reuse first #201 approval tied to invalid `9940...` digest.
- [ ] Do NOT invoke old v1/v2 R2 RPCs merely because functions exist.
- [ ] Do NOT reapply v1/v2 R2 migrations or generic bounded v1 migration.
- [ ] Do NOT make new generic Yahoo/Rakuten provider calls or bounded RPC writes without fresh exact approval.
- [ ] Do NOT create a second #201 one-shot workflow without fresh exact authorization.
- [ ] Do NOT execute R3/R4 by implication.
- [ ] Do NOT change Production-capable workflows/schedules or dispatch them without applicable approval.
- [ ] Do NOT change Secrets/Variables by implication.
- [ ] Do NOT enable Kitan/Qualia automatic writes.
- [ ] Do NOT weaken the strict matcher.
- [ ] Do NOT mix completed/sold with active/sold_out evidence.
- [ ] Do NOT scrape Mercari or Amazon.
- [ ] Do NOT touch `supabase/.temp/cli-latest`.
- [ ] Keep `.github/workflows/gacha-ingestion.yml` disabled.
