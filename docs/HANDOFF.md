# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — first reusable bounded Production migration + fail-closed execution attempt / Issue #202 canonical sync

This is the canonical operational handoff for resuming Gacha Lens. Re-fetch live GitHub/Vercel/Supabase/provider evidence before acting when current state matters.

## Self-referential canonical-sync rule

This file is authored by Issue #202.

- If read from branch `docs/canonical-sync-post-bounded-attempt-202` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #202 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to record #202's own merge.
- After #202 reaches `main`, resume Issue #201 with **SELECT-only post-sync revalidation and digest recomputation**. Do not make provider calls, invoke the bounded RPC, or create another credentialed one-shot workflow without a fresh exact human approval.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not rerun completed or failed canaries merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, destructive work, direct main pushes, and ineligible merges/releases require explicit approval.
6. After every major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major implementation/execution phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` (`gacha-site-start`) — never confuse with Production
- Vercel project: `karakuri3s-projects/gachalens`
- Vercel project ID: `prj_8Yelkn1wM7JGoA2WCMCGGhRt3o8x`
- Vercel team ID: `team_ftNyyXQQ8osmTZYExJeSqcvU`
- Preferred local path: `C:\dev\Gacha-Lens`

## Product purpose / priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Near-term order: **DATA -> TRAFFIC -> CLICK -> REVENUE**.

R2 proved truthful repeated-observation history end-to-end in Production. The reusable bounded lane is now installed in Supabase Production, but its first live data execution has **not** occurred. The first generic execution attempt stopped before any provider request because the precomputed approval digest was wrong.

The current truthful history baseline remains **4 re-observed listings**. Live breadth may continue to grow independently through the existing approved P3 lane, so re-fetch denominator/counts before calculating the current history ratio.

## Latest Production checkpoint — authoritative

Pre-#202 canonical main:

`0a509fe5813216b529b6192e41fb0875b28d10db`

Production immediately after the first #201 attempt:

- market listings: **115**
- observations: **119**
- listings with 2+ observations: **4**
- completed sold: **0**
- deterministic #201 observation rows present: **0/8**
- all eight #201 targets: **exactly 1 observation each**

### Generic bounded v1 schema is now installed

Reviewed repository migration:

`supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`

Production ledger:

- version: `20260902165958`
- name: `market_reobservation_bounded_v1`

Production RPC:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Verified after migration:

- SECURITY INVOKER (`security_definer=false`)
- empty `search_path`
- EXECUTE: `service_role=true`
- EXECUTE: `PUBLIC=false`, `anon=false`, `authenticated=false`
- migration alone changed market data by **0**

**Do not reapply this migration.** Repository filename timestamp and Supabase ledger timestamp differ legitimately; do not manually “fix” the ledger.

## #201 first reusable bounded batch — frozen historical attempt

Observation key:

`reobs-v1:bounded-20260903-01`

Frozen cohort: eight Yahoo listings, Lead Netstore 6 + Toysanta 2:

1. `yahoo-lead-netstore-302507s186ook6`
2. `yahoo-lead-netstore-qq172606s186ppk4`
3. `yahoo-lead-netstore-qq292605s248enk8`
4. `yahoo-lead-netstore-qq152607s248pmk2`
5. `yahoo-lead-netstore-qq162601s196bdm3`
6. `yahoo-lead-netstore-qq292607s309bqk4`
7. `yahoo-toysanta-g-5l370018il-003-57693`
8. `yahoo-toysanta-g-5l3e0018i5-005-57677`

Before the approved attempt, all eight were SELECT-verified review-safe, `sold_at=null`, exact persisted provider/native/public identity, positive active price, one prior observation each, unresolved import issues 0, deterministic observation-ID collisions 0.

Deterministic IDs for this observation key:

- `yahoo-lead-netstore-302507s186ook6` -> `market-reobservation-c30f2987c464d788cd2ea36b59925d9e`
- `yahoo-lead-netstore-qq172606s186ppk4` -> `market-reobservation-a5bc53f64ebe0acca116d0bbecf2a773`
- `yahoo-lead-netstore-qq292605s248enk8` -> `market-reobservation-cfcb0697038eb171a8738dbdc83a74b4`
- `yahoo-lead-netstore-qq152607s248pmk2` -> `market-reobservation-b780d7ebbc1e4faab31d4dc4d7082aa0`
- `yahoo-lead-netstore-qq162601s196bdm3` -> `market-reobservation-c89d152cd5a121086ee25830eb079293`
- `yahoo-lead-netstore-qq292607s309bqk4` -> `market-reobservation-0cc555117d445620c8ffee06f509766e`
- `yahoo-toysanta-g-5l370018il-003-57693` -> `market-reobservation-0cdb9caa11f7e19641811eb7a076c995`
- `yahoo-toysanta-g-5l3e0018i5-005-57677` -> `market-reobservation-4a9a4f2c85485e5cf5f50098ba1e5b01`

### Superseded incorrect digest

Issue #201 originally recorded:

`9940a55824e90bf252259fb489455502b14eb4d4bf65dca92ab4ba69cd2f3b73`

That digest is **incorrect and invalid for execution**. The precomputation failed to reproduce the merged `frozenCohortEntry()` payload completely, especially the persisted identity fields included in the digest.

For the pre-sync main `0a509fe...`, the merged repository semantics recomputed the same frozen cohort/key to:

`e1f56e29178a339efdfaf38c66e127fe65db5c767e454cd4b2f9e04add4973c9`

This corrected value is **historical evidence only, not authorization**. Once #202 merges and main SHA changes, it is stale by design. Recompute the digest against the new canonical main before any new approval request.

### First one-shot attempt — safe failure before provider loop

Disposable branch:

`ops/bounded-reobs-one-shot-201-20260903`

Workflow add commit:

`ba9649cb330f3f3781d099bdab982b0b52bbfb11`

Actions:

- run: `33658579004`
- job: `100343207005`
- result: FAILURE / fail-closed
- guard step: PASS
- exact approved main verified
- branch diff at execution: exactly one workflow file
- failure: `Bounded re-observation canary-write approval is invalid.`
- failure happened inside invocation approval validation, **before provider loop**

Consequences verified independently:

- Yahoo HTTP/provider attempts: **0**
- RPC calls: **0**
- Production market-data writes: **0**
- deterministic rows present: **0/8**
- all eight targets remained one observation
- Production remained **115 / 119 / 4 / sold0**

No rerun was performed. **Never rerun `33658579004`.**

Workflow cleanup:

- workflow removed immediately from the same disposable branch
- cleanup commit: `772f687c339fd729f3e11c682649926e4ca52645`
- final file diff vs approved main: **0**
- branch push-trigger Actions run count: **1**
- branch never merged to main

The #201 human approval was exact and one-time. It was consumed by the Production migration plus this single fail-closed one-shot attempt. It cannot authorize a corrected digest, second provider attempt, RPC call, or new workflow.

## Reusable bounded re-observation contract — durable

Issue #196 / replacement PR #198 merged the generic repository prerequisite.

Repository merge:

`9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`

Frozen implementation head:

`c6372d9f3a1857a2d18302c1a4118cf685e13ece`

Validation evidence:

- PR Code Quality `33655012819`: SUCCESS
- Vercel Preview `dpl_8Pc5xkekW6iM53XNXu2p4j1y4fz3`: READY
- Foundation `33655012798`: all 11 repository migrations applied successfully, then known stale expected-8 assertion failed
- review threads 0
- #196/#197 task-specific review substitution consumed by #198 repository merge only

Durable runtime contract:

- explicit frozen cohort only, minimum 1 / maximum 10 listings
- Rakuten (`provider=rakuten_ichiba`, listing `source=rakuten`) and Yahoo (`provider/source=yahoo_shopping`)
- exact persisted provider/native/public identity; no rediscovery/provider substitution inside the lane
- exact current-main SHA + observation key + full frozen snapshots + exact prior observation counts -> SHA-256 cohort digest
- digest input includes persisted `source_url`, `raw.provider`, `raw.source_listing_id`, and `raw.public_url`; do not hand-reproduce a partial payload
- dry-run: DB SELECTs only, provider 0, RPC 0, writes 0
- future approved write mode: serial exact reads, max 3 attempts/listing, maximum 30 at batch ceiling
- provider pacing preserved: Rakuten >=1200ms, Yahoo >=1000ms
- any unsafe/not_found/throttle/provider error/identity mismatch/snapshot drift stops before RPC
- exactly one atomic RPC only after every frozen provider plan is safe
- sanitized resolver manifest persisted before RPC
- no automatic RPC retry
- deterministic observation IDs recomputed in SQL
- expected prior observation count must match current DB count and may be >1
- append exactly one observation per target; update only price/status/last_observed_at/updated_at
- never write completed `sold` or `sold_at`
- canonical marketplace identity and exact persisted DB URL/raw identity are separate guards
- listing rows, observation append path, and unresolved import-issue path are protected against relevant concurrent races
- exact target/RPC invariants stay strict; global postwrite counts use concurrency-tolerant minimum deltas
- ambiguous resolver returns only `committed | not_committed | inconsistent`, provider 0, RPC 0, writes 0, automatic retry false

## Independent P3 breadth drift is expected

Between #200 planning and #201 execution, the already-approved P3 breadth lane legitimately added two unrelated Yahoo listings via workflow `33655998914`, changing 113/117 to 115/119 while re-observed remained 4.

This was not #201 drift because all eight frozen target snapshots remained exact. It validates the generic lane's design choice: target invariants exact, global count verification concurrency-tolerant.

Re-fetch live denominator before every history-percentage calculation because breadth may continue to grow independently.

## Successful R2 v2 Production evidence — historical and terminal

R2 Yahoo-only v2 remains the first truthful repeated-history proof.

Frozen key: `reobs-v1:r2-20260902-02`.

Successful one-shot evidence:

- approved code SHA `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- cohort digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- Actions `33621881117`: SUCCESS
- Yahoo HTTP attempts 4 total, exactly 1/listing
- all four outcomes `unchanged`
- exactly one verified atomic v2 RPC
- 113->113 listings / 113->117 observations / 0->4 re-observed / completed sold 0->0
- deterministic v2 rows 4/4 present; each target exactly two observations
- workflow immediately removed; branch final file diff 0; run count exactly 1; branch never merged

R2 provider/write/workflow approvals are consumed/non-reusable. Do not rerun R2 merely to reconfirm it.

Original R2 v1 attempt remains historical fail-closed evidence: Actions `33605362604` stopped on first Rakuten `not_found`; remaining target calls 0, RPC 0, writes 0, no retry. Exact first-target attempt count is not observable; reviewed reader bounds it to 1-3.

R2 Production ledgers remain:

- `20260902073919 / r2_atomic_reobservation_canary`
- `20260902095120 / r2_yahoo_only_reobservation_canary_v2`

Do not invoke those old RPCs merely because they exist.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

Evidence chain:

- #182: 9 migrations applied before stale expected-8 failure
- #188: 10 migrations applied before stale expected-8 failure
- #197/#198: 11 migrations applied before stale expected-8 failure

This is known harness debt, not migration failure. Repairing the Production-capable workflow remains a separate approval-bound task.

## Exact next action after Issue #202 reaches main

**Read-only only until a fresh human approval is granted.**

1. Re-fetch new canonical `main`, open PRs/Issues, and live Production counts.
2. Re-SELECT all eight #201 targets and require exact frozen identity/snapshot, prior observation count 1, unresolved import issues 0, deterministic observation-ID collisions 0.
3. Re-verify generic Production function/ledger and security posture; do **not** reapply migration.
4. Compute the cohort digest by executing/reproducing the merged repository `buildMarketReobservationBoundedCohortDigest()` semantics against the **new post-sync main SHA**. Do not reuse `9940...` or `e1f56e...`.
5. If any target or main changed, treat it as a new cohort identity and stop/replan read-only.
6. If all evidence is still safe, request a **fresh exact human approval** covering only the new main SHA, new digest, frozen eight Yahoo reads (max3 each / max24 total, >=1000ms same-provider pacing), exactly one bounded RPC iff all eight plans are safe, no automatic RPC retry, SELECT-only resolver on ambiguous commit, and one new disposable branch-only push-trigger workflow if credentials require it.
7. The new workflow authorization must be explicit; the old #201 run-once authorization is consumed.
8. After any successful or otherwise material Production execution milestone, force canonical sync again before R3/R4.

## Absolute project safety rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually change F0 official auto or P3 V2 market auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict single-item matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no direct push to `main`
- no Production DB write/migration/schema/backfill/reset/cleanup without exact applicable approval
- no approval-bound provider call, workflow dispatch/change, Secrets/Variables change, paid/destructive action, or R3/R4 execution by implication
- no automatic RPC retry
- do not manually alter Supabase migration ledger timestamps
- PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary

## Approval state / hard stops

Consumed/non-reusable:

- #172 Yahoo continuation approval
- original #179 v1 provider/write token and one-shot workflow authorization
- #188 review substitution
- Yahoo-only R2 v2 migration/provider/RPC approval
- Yahoo-only R2 v2 one-shot workflow authorization
- #196/#197 independent-review substitution, consumed by byte-identical #198 repository merge
- **first #201 Production migration/provider/RPC/workflow approval tied to incorrect digest `9940...`; consumed by migration + single fail-closed run `33658579004`**

Not authorized now:

- any new Yahoo/Rakuten provider calls for #201 or generic lane
- generic bounded RPC/data write
- any new one-shot workflow creation/execution for #201
- reapplication of generic migration
- R3/R4 execution
- F0/#142 merge/dispatch
- Secrets/Variables changes
- paid/licensed activation
- destructive/irreversible actions
