# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — first successful reusable bounded history batch / Issue #204 canonical sync

This is the canonical operational handoff for Gacha Lens. Re-fetch live GitHub, Vercel, Supabase, provider, and GSC evidence before making any current-state decision.

## Self-referential canonical-sync rule

This file is authored by Issue #204.

- If read from branch `docs/canonical-sync-post-bounded-success-204` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #204 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to record #204's own merge.
- After #204 reaches `main`, resume Issue #119 with a **read-only Data Scale bottleneck reassessment**. Re-observation history has crossed the first 10% Scoreboard threshold, so do not automatically jump to R3/R4 or run another bounded write batch without new evidence and, where applicable, fresh explicit approval.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open PRs/Issues, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Resume durable Issue/branch/PR work; do not duplicate completed or in-flight work.
4. Do not rerun completed or failed canaries merely to refresh context.
5. Production DB mutation/migration/schema/backfill/reset/cleanup, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, destructive work, direct main pushes, and ineligible merges/releases require explicit applicable approval.
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

## Product purpose / business priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Near-term order: **DATA -> TRAFFIC -> CLICK -> REVENUE**.

R2 first proved truthful repeated-observation history end-to-end. The reusable generic bounded lane then expanded truthful history without creating another bespoke hardcoded canary. The first reusable batch has now crossed the Scoreboard's first 10% history threshold.

Do not keep growing history simply because the mechanism works. The next step is to re-read the Scoreboard and current Production denominator/depth/breadth evidence, then choose the next highest-leverage DATA bottleneck.

## Latest authoritative Production checkpoint

Pre-#204 canonical main:

`9859ab4d1d92043cc914dd00ea5814eff614e6f3`

Production after successful #201 reusable bounded execution:

- market listings: **115**
- observations: **127**
- listings with 2+ observations: **12**
- completed sold: **0**
- truthful history coverage at that checkpoint: **12 / 115 ~= 10.43%**

This crossed the current Scoreboard's first 10% history threshold. Re-fetch live denominator before quoting the current percentage because the already-approved P3 breadth lane may add unrelated listings.

## Generic bounded re-observation v1 — Production schema state

Repository migration:

`supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`

Production ledger:

- version: `20260902165958`
- name: `market_reobservation_bounded_v1`

Production RPC:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Verified security posture:

- SECURITY INVOKER (`security_definer=false`)
- empty `search_path`
- schema-qualified relations
- EXECUTE: `service_role=true`
- EXECUTE: `PUBLIC=false`, `anon=false`, `authenticated=false`

The migration was applied once during the first #201 attempt and was **not reapplied** for the successful retry. Do not reapply it. Repository filename timestamp and Supabase ledger timestamp legitimately differ; do not manually alter the ledger.

## #201 reusable bounded history batch — successful terminal evidence

Observation key:

`reobs-v1:bounded-20260903-01`

Approved successful-run main:

`9859ab4d1d92043cc914dd00ea5814eff614e6f3`

Approved cohort digest:

`1142a10b4c8818562b27f9222a388be073934ca83a33932c2dfca65a5d4782bf`

Frozen Yahoo cohort:

1. `yahoo-lead-netstore-302507s186ook6`
2. `yahoo-lead-netstore-qq172606s186ppk4`
3. `yahoo-lead-netstore-qq292605s248enk8`
4. `yahoo-lead-netstore-qq152607s248pmk2`
5. `yahoo-lead-netstore-qq162601s196bdm3`
6. `yahoo-lead-netstore-qq292607s309bqk4`
7. `yahoo-toysanta-g-5l370018il-003-57693`
8. `yahoo-toysanta-g-5l3e0018i5-005-57677`

Deterministic observation IDs:

- `yahoo-lead-netstore-302507s186ook6` -> `market-reobservation-c30f2987c464d788cd2ea36b59925d9e`
- `yahoo-lead-netstore-qq172606s186ppk4` -> `market-reobservation-a5bc53f64ebe0acca116d0bbecf2a773`
- `yahoo-lead-netstore-qq292605s248enk8` -> `market-reobservation-cfcb0697038eb171a8738dbdc83a74b4`
- `yahoo-lead-netstore-qq152607s248pmk2` -> `market-reobservation-b780d7ebbc1e4faab31d4dc4d7082aa0`
- `yahoo-lead-netstore-qq162601s196bdm3` -> `market-reobservation-c89d152cd5a121086ee25830eb079293`
- `yahoo-lead-netstore-qq292607s309bqk4` -> `market-reobservation-0cc555117d445620c8ffee06f509766e`
- `yahoo-toysanta-g-5l370018il-003-57693` -> `market-reobservation-0cdb9caa11f7e19641811eb7a076c995`
- `yahoo-toysanta-g-5l3e0018i5-005-57677` -> `market-reobservation-4a9a4f2c85485e5cf5f50098ba1e5b01`

### Successful one-shot execution

Disposable branch:

`ops/bounded-reobs-one-shot-201-retry-20260903`

Workflow add commit:

`dbc5c00d5e15959b40d11f4c3953972094842c84`

Actions evidence:

- run: `33660684355`
- job: `100350188660`
- result: **SUCCESS**
- exact approved main / one-file branch guard: PASS
- provider: Yahoo Shopping only
- provider attempts: **8 total**
- attempts per listing: **exactly 1 each**
- retries: **0**
- rate-limited reads: **0**
- timeouts: **0**
- outcomes: **7 `unchanged`, 1 `price_changed`**
- sanitized resolver manifest preserved before RPC: true
- RPC calls: **exactly 1**
- RPC verified: true
- RPC applied_count: **8**
- listing delta: 0
- observation delta: **+8**
- newly re-observed delta: **+8**
- completed sold delta: 0

The one price change was truthful provider evidence:

- listing: `yahoo-toysanta-g-5l370018il-003-57693`
- price: **568 -> 399**
- status: `active` -> `active`

Independent post-run Supabase SELECT verified:

- deterministic new observations: **8/8 present**
- every frozen target: **exactly 2 observations**
- all new observations source: `yahoo_shopping`
- Production: **115 listings / 127 observations / 12 re-observed / sold0**

### One-shot cleanup

Artifact:

- name: `bounded-reobs-201-retry-evidence`
- artifact ID: `9858557931`

Workflow cleanup:

- cleanup commit: `c4a058f5cda1ad770bd5340e9650217484a6028e`
- workflow removed immediately after evidence capture
- final disposable branch file diff vs approved main: **0**
- branch push-trigger run count: **exactly 1**
- branch never merged to main
- no `workflow_dispatch`
- no Secrets/Variables changes
- no existing Production workflow changes
- no paid/destructive/F0/R3/R4 actions

The successful retry approval/token/workflow authority is **consumed and non-reusable**. Do not rerun `33660684355`, do not reuse its token, and do not recreate its workflow by implication.

## #201 first attempt — historical fail-closed evidence

The first #201 authorization used the same observation key but an incorrectly precomputed digest:

`9940a55824e90bf252259fb489455502b14eb4d4bf65dca92ab4ba69cd2f3b73`

That digest omitted persisted identity fields included by merged `frozenCohortEntry()` semantics and was invalid.

First disposable run:

- Actions `33658579004`
- job `100343207005`
- exact-main/one-file guard PASS
- failure: `Bounded re-observation canary-write approval is invalid.`
- failure occurred **before provider loop**
- Yahoo/provider attempts 0
- RPC 0
- market-data writes 0
- deterministic rows 0/8 at that time
- all eight targets still one observation at that time
- workflow removed; cleanup commit `772f687c339fd729f3e11c682649926e4ca52645`
- branch final file diff 0; run count 1; branch never merged

The first approval was consumed and cannot authorize any later action.

A repository-equivalent digest for the pre-#202 main was later computed as `e1f56e29178a339efdfaf38c66e127fe65db5c767e454cd4b2f9e04add4973c9`; it was historical evidence only and became stale when main changed. Never reuse either `9940...` or `e1f56e...`.

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
- #196/#197 task-specific independent-review substitution consumed by #198 repository merge only

Durable contract:

- explicit frozen cohort only, minimum 1 / maximum 10 listings
- Yahoo and Rakuten exact persisted identities
- exact current-main SHA + observation key + full frozen snapshots + exact prior observation counts -> SHA-256 cohort digest
- digest includes persisted `source_url`, `raw.provider`, `raw.source_listing_id`, and `raw.public_url`; never hand-reproduce a partial payload
- dry-run: DB SELECTs only, provider 0, RPC 0, writes 0
- future approved write mode: serial exact reads, max 3 attempts/listing, absolute max 30 at batch ceiling
- provider pacing: Yahoo >=1000ms, Rakuten >=1200ms
- any unsafe/not_found/throttle/provider error/identity mismatch/snapshot drift stops before RPC
- exactly one atomic RPC only after every target plan is safe
- sanitized resolver manifest persisted before RPC
- no automatic RPC retry
- deterministic observation IDs recomputed in SQL
- exact prior observation count may be >1 but must match current DB state
- append one observation per target; listing update allowlist only price/status/last_observed_at/updated_at
- never fabricate completed `sold` or write `sold_at`
- canonical provider identity and exact persisted DB URL/raw identity are separate guards
- listing/observation/import-issue race paths are protected
- target/RPC invariants exact; global count checks concurrency-tolerant minimum deltas
- ambiguous resolver is SELECT-only and returns only `committed | not_committed | inconsistent`

Successful #201 proves the reusable contract can safely compound truthful history and persist real price changes while preserving exact identity and one-RPC atomicity.

## R2 historical evidence — terminal

Yahoo-only R2 v2 remains the first successful repeated-history proof:

- key `reobs-v1:r2-20260902-02`
- Actions `33621881117`: SUCCESS
- Yahoo attempts 4 total / exactly 1 each / retries 0
- all four outcomes `unchanged`
- exactly one atomic v2 RPC
- Production 113/113/0 -> 113/117/4 for listings/observations/re-observed
- completed sold stayed 0
- deterministic rows 4/4; each target exactly two observations
- workflow removed immediately; branch final diff 0; run count 1; never merged

Original R2 v1 attempt `33605362604` stopped on first Rakuten `not_found`; remaining target calls 0, RPC 0, writes 0, no retry. Exact first-target attempt count is not retained; reviewed reader bounds it to 1-3.

R2 Production ledgers:

- `20260902073919 / r2_atomic_reobservation_canary`
- `20260902095120 / r2_yahoo_only_reobservation_canary_v2`

R2 provider/write/workflow approvals are consumed. Do not rerun R2 or invoke old R2 RPCs merely because functions exist.

## Independent P3 breadth growth

An already-approved P3 breadth run `33655998914` previously increased market breadth from 113 listings / 117 observations to 115 / 119 while re-observed remained 4. That was legitimate unrelated growth and did not invalidate the frozen #201 cohort because exact target invariants remained unchanged.

This is why generic bounded postwrite verification treats target state exactly but global counters as concurrency-tolerant minimum deltas.

## Known Foundation CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

Evidence chain:

- #182: 9 migrations applied before stale expected-8 failure
- #188: 10 migrations applied before stale expected-8 failure
- #197/#198: 11 migrations applied before stale expected-8 failure

This is known harness debt, not migration failure. Repairing this Production-capable workflow is a separate approval-bound task.

## F0 separate Production boundary

Issue #137 / PR #142 remains a separate F0 Production-impact approval boundary. Do not merge or dispatch it by implication from Data Scale work.

## Exact next action after Issue #204 reaches main

Stay read-only first.

1. Re-fetch current main, Production market counts, recent P3 runs, and the current Data Scale Scoreboard inputs.
2. Recompute truthful breadth/history/depth status with the live denominator. Confirm whether the first history threshold remains passed.
3. Identify the **single highest-leverage remaining DATA bottleneck** now that repeated-history coverage has reached the first threshold.
4. Compare at least: more history compounding, R3 depth read-only, breadth expansion through existing lawful lanes, and any source-quality/provenance gap exposed by the Scoreboard.
5. Prefer read-only diagnosis and repository-only prerequisites before requesting another Production/provider approval.
6. Do not execute R3/R4 merely because they are next in the historical rollout plan; they remain separately approval-gated.
7. Do not run another generic bounded write batch merely because the first succeeded. Any future provider/RPC execution needs a new frozen cohort/key/main/digest and fresh exact approval.
8. Keep DATA -> TRAFFIC -> CLICK -> REVENUE as the business ordering; once Data Scale reaches the defined useful threshold, move attention to traffic/affiliate evidence rather than endlessly optimizing infrastructure.

## Absolute project safety rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually change F0 official auto or P3 V2 market auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict single-item matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out asking-price evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no direct push to `main`
- no Production DB write/migration/schema/backfill/reset/cleanup without exact applicable approval
- no approval-bound provider call, workflow dispatch/change, Secrets/Variables change, paid/destructive action, or R3/R4 execution by implication
- no automatic RPC retry
- do not manually alter Supabase migration ledgers

## Consumed / non-reusable approvals and runs

- #172 Yahoo continuation approval
- original #179 R2 v1 provider/write token + one-shot workflow authorization
- Yahoo-only R2 v2 Production/provider/RPC + one-shot workflow authorization
- #188 review substitution
- #196/#197 review substitution consumed by byte-identical #198 repository merge
- first #201 migration/execution/workflow approval tied to invalid `9940...` digest
- successful #201 retry provider/RPC/workflow approval tied to main `9859ab4d...` + digest `1142a10b...`

Never rerun:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`

Not authorized by this canonical sync:

- another generic bounded provider/RPC execution
- generic migration reapplication
- R3/R4 execution
- F0/#142 merge or dispatch
- workflow/schedule changes or dispatch
- Secrets/Variables changes
- paid/destructive actions
