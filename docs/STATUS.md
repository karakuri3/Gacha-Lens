# Gacha Lens Status

Updated: 2026-09-03 JST — first reusable bounded Production migration + fail-closed execution attempt / Issue #202 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #202.

- On branch `docs/canonical-sync-post-bounded-attempt-202` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #202 is complete by definition; do not create a recursive docs sync merely to mark its own merge.
- After #202 is on `main`, resume #201 with SELECT-only post-sync revalidation and digest recomputation. No provider/RPC/new one-shot workflow without fresh exact approval.

## Current repository checkpoint

Pre-#202 canonical main:

`0a509fe5813216b529b6192e41fb0875b28d10db`

Relevant completed repository work:

- #196 reusable bounded re-observation prerequisite: completed
- Draft #197 closed unmerged only due Draft->Ready connector defect
- byte-identical replacement #198 squash-merged as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`
- implementation head `c6372d9f3a1857a2d18302c1a4118cf685e13ece`
- #199/#200 post-prerequisite canonical sync completed
- #200 canonical main became `0a509fe5813216b529b6192e41fb0875b28d10db`
- #142/#137 F0 remains a separate human approval boundary

#198 validation evidence:

- Code Quality `33655012819`: SUCCESS
- Preview `dpl_8Pc5xkekW6iM53XNXu2p4j1y4fz3`: READY
- Foundation `33655012798`: all 11 migrations applied, then known stale expected-8 assertion failed
- task-specific #196/#197 review substitution consumed by #198 merge only

## Authoritative Production checkpoint

Immediately after the first #201 attempt:

- market listings: **115**
- observations: **119**
- listings with 2+ observations: **4**
- completed sold: **0**
- #201 deterministic rows present: **0/8**
- all eight #201 targets remain **1 observation each**

### Generic bounded v1 schema — installed

Production migration ledger:

`20260902165958 / market_reobservation_bounded_v1`

Function:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Verified:

- SECURITY INVOKER
- empty search_path
- service_role EXECUTE true
- PUBLIC/anon/authenticated EXECUTE false
- migration alone changed market data by 0

**Do not reapply this migration.**

## #201 first generic execution attempt — fail-closed before provider loop

Observation key:

`reobs-v1:bounded-20260903-01`

Frozen cohort: Yahoo 8, Lead Netstore 6 + Toysanta 2.

Original Issue/body digest:

`9940a55824e90bf252259fb489455502b14eb4d4bf65dca92ab4ba69cd2f3b73`

Status: **incorrect / invalid for execution**.

Cause: the precomputation did not fully reproduce the merged `frozenCohortEntry()` digest payload, including persisted identity fields.

Pre-sync corrected digest evidence for main `0a509fe...`:

`e1f56e29178a339efdfaf38c66e127fe65db5c767e454cd4b2f9e04add4973c9`

This value is evidence only and becomes stale when #202 changes main SHA.

Disposable execution evidence:

- branch `ops/bounded-reobs-one-shot-201-20260903`
- workflow add commit `ba9649cb330f3f3781d099bdab982b0b52bbfb11`
- Actions run `33658579004`
- job `100343207005`
- exact-main / one-file branch guard: PASS
- failure: `Bounded re-observation canary-write approval is invalid.`
- failure occurred in invocation validation before provider loop

Verified outcome:

- Yahoo/provider attempts: **0**
- RPC calls: **0**
- market-data writes: **0**
- deterministic rows: **0/8**
- targets remain one observation each
- no rerun

Cleanup:

- workflow removed immediately
- cleanup commit `772f687c339fd729f3e11c682649926e4ca52645`
- final file diff vs approved main: **0**
- push-trigger run count: **1**
- branch never merged

The first #201 approval was exact/one-time and is **consumed**. It cannot authorize a second run, corrected digest, provider calls, RPC, or new workflow.

## Reusable bounded v1 capability

Durable contract:

- explicit batch 1..10
- Yahoo + Rakuten exact persisted identities
- exact current-main SHA + observation key + **complete frozen cohort payload** + prior observation counts -> digest
- persisted identity fields are part of digest; do not partially reproduce the payload
- dry-run DB SELECT only; provider/RPC/write 0
- future approved write mode max3 attempts/listing / max30 total
- Yahoo pacing >=1000ms, Rakuten >=1200ms
- every target safe before exactly one atomic RPC
- pre-RPC sanitized resolver manifest mandatory
- no automatic RPC retry
- deterministic observation IDs recomputed in SQL
- exact target invariants, concurrency-tolerant global minimum deltas
- no completed `sold` / no `sold_at`
- ambiguous commit resolution SELECT-only

## Current Data Scale interpretation

The truthful repeated-history numerator is still **4**.

An existing approved P3 breadth run `33655998914` legitimately increased Production breadth from 113/117 to 115/119 without changing repeated history. Therefore the denominator is not assumed stable; re-fetch counts before using a history percentage.

At the last verified 115-listing denominator, an all-safe +8 batch would move 4 -> 12 re-observed, or **12/115 = 10.43%**, past the first Scoreboard history threshold. That projection is not execution authority.

## Exact next step after #202 reaches main

Read-only only:

1. Re-fetch new canonical main and live Production counts.
2. Re-SELECT all eight #201 targets; require exact frozen identity/snapshot, prior count 1, unresolved issues 0, deterministic ID collisions 0.
3. Re-verify generic function/ledger/security; do not reapply migration.
4. Recompute the exact cohort digest against the **new post-sync main** using merged repository semantics. Do not reuse `9940...` or `e1f56e...`.
5. If any main/cohort/snapshot field drifted, stop and replan the cohort read-only.
6. Only if all safe, request a fresh exact human approval for the new main/digest, eight Yahoo exact reads (max3 each / max24 total, >=1000ms pacing), one bounded RPC iff all eight safe, no RPC retry, SELECT-only resolver on ambiguous state, and a new disposable branch-only push-trigger one-shot workflow if credentials require it.
7. Old run-once authorization is consumed; any new workflow needs fresh explicit authority.

## Successful R2 Production evidence — historical

Yahoo-only R2 v2 remains the first successful history proof:

- Actions `33621881117`: SUCCESS
- Yahoo attempts 4 total / 1 each
- all `unchanged`
- exactly one atomic RPC
- 113/113/0 -> 113/117/4 for listings/observations/re-observed
- completed sold stayed 0
- deterministic rows 4/4; each target exactly two observations
- workflow removed; final branch file diff 0; run count 1; never merged

Original v1 R2 attempt `33605362604` stopped on first Rakuten `not_found`; remaining calls 0, RPC 0, writes 0, no retry.

R2 ledgers:

- `20260902073919 / r2_atomic_reobservation_canary`
- `20260902095120 / r2_yahoo_only_reobservation_canary_v2`

R2 approvals are consumed/non-reusable.

## Known Foundation harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

- #182: 9 applied before expected-8 failure
- #188: 10 applied before expected-8 failure
- #197/#198: 11 applied before expected-8 failure

This is known workflow debt, not migration failure. Repair remains separately approval-bound.

## Current approval state

Consumed/non-reusable:

- #172 Yahoo continuation
- original #179/v1 provider/write approval/token and one-shot workflow authorization
- #188 review substitution
- Yahoo-only R2 v2 Production execution + workflow authorization
- #196/#197 review substitution consumed by #198 repository merge
- **first #201 exact Production/workflow approval tied to invalid `9940...` digest; consumed by migration + run `33658579004`**

Not authorized now:

- new #201 Yahoo/provider reads
- bounded RPC/data write
- any new #201 one-shot workflow
- generic migration reapplication
- R3/R4
- F0/#142 merge/dispatch
- Secrets/Variables changes
- paid/destructive actions

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never rerun `33658579004`
- do not rerun completed R2 canaries without completely new task-specific approval
- do not reapply completed R2 or generic bounded migrations
- do not weaken strict marketplace matching for coverage
- do not mix completed sold evidence with active/sold_out asking-price evidence
- do not scrape Mercari or Amazon
- no direct push to `main`
- no automatic RPC retry
