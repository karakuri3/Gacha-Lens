# Gacha Lens Status

Updated: 2026-09-03 JST — first successful reusable bounded history batch / Issue #204 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #204.

- On branch `docs/canonical-sync-post-bounded-success-204` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #204 is complete by definition; do not create a recursive docs sync merely to record its own merge.
- After #204 is on `main`, resume Issue #119 with read-only Data Scale bottleneck reassessment. Do not automatically execute R3/R4 or another history write batch.

## Current repository checkpoint

Pre-#204 canonical main:

`9859ab4d1d92043cc914dd00ea5814eff614e6f3`

Relevant completed work:

- #196 reusable bounded re-observation repository prerequisite: complete
- Draft #197 closed unmerged only because Draft->Ready connector mutation failed
- byte-identical replacement #198 merged as `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`
- #199/#200 post-prerequisite canonical sync: complete
- #202/#203 post-first-attempt canonical sync: complete; main became `9859ab4d1d92043cc914dd00ea5814eff614e6f3`
- #201 successful reusable bounded batch: complete Production objective
- #142/#137 F0: separate human approval boundary

## Authoritative Production checkpoint

After successful #201 retry:

- market listings: **115**
- observations: **127**
- listings with 2+ observations: **12**
- completed sold: **0**
- history coverage at that checkpoint: **12 / 115 ~= 10.43%**

This crosses the first 10% history threshold in the current Data Scale Scoreboard. Re-fetch live denominator before any current percentage claim.

## Generic bounded v1 Production schema

Repository migration:

`supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`

Production ledger:

`20260902165958 / market_reobservation_bounded_v1`

Function:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Verified security:

- SECURITY INVOKER
- empty search_path
- service_role EXECUTE true
- PUBLIC/anon/authenticated EXECUTE false

The migration is already installed. It was **not reapplied** for the successful retry. Do not reapply it.

## #201 successful reusable bounded batch

Frozen identity:

- approved main: `9859ab4d1d92043cc914dd00ea5814eff614e6f3`
- observation key: `reobs-v1:bounded-20260903-01`
- cohort digest: `1142a10b4c8818562b27f9222a388be073934ca83a33932c2dfca65a5d4782bf`
- cohort: Yahoo 8, Lead Netstore 6 + Toysanta 2

Preflight immediately before execution:

- main exact: PASS
- targets 8/8
- frozen review-safe snapshots: PASS
- prior observation count: 1 each
- unresolved import issues: 0
- deterministic observation-ID collisions: 0
- Production before: 115 / 119 / 4 / sold0

One-shot evidence:

- branch `ops/bounded-reobs-one-shot-201-retry-20260903`
- workflow add commit `dbc5c00d5e15959b40d11f4c3953972094842c84`
- Actions run `33660684355`
- job `100350188660`
- guard: exact approved main + one-file branch diff PASS
- provider attempts: **8 total / 1 each**
- retry count: **0**
- rate limited: 0
- timed out: 0
- outcomes: **7 unchanged / 1 price_changed**
- resolution manifest preserved before RPC: true
- exactly one bounded RPC: verified
- RPC applied_count: 8
- exact lane delta: listings 0 / observations +8 / re-observed +8 / sold 0

Truthful price change:

- `yahoo-toysanta-g-5l370018il-003-57693`
- **568 -> 399**
- status remained active

Independent post-run DB verification:

- deterministic new rows: **8/8**
- all eight targets: exactly **2 observations**
- Production: **115 / 127 / 12 / sold0**

Cleanup:

- Artifact `bounded-reobs-201-retry-evidence`, ID `9858557931`
- workflow cleanup commit `c4a058f5cda1ad770bd5340e9650217484a6028e`
- final disposable branch file diff vs approved main: 0
- push-trigger run count: exactly 1
- branch never merged

The successful retry approval/token/workflow authority is consumed. Never rerun `33660684355`.

## #201 first attempt — historical fail-closed evidence

First digest `9940a55824e90bf252259fb489455502b14eb4d4bf65dca92ab4ba69cd2f3b73` was incorrectly precomputed because persisted identity fields in merged `frozenCohortEntry()` were omitted.

First Actions run `33658579004`:

- guard PASS
- failed at approval validation before provider loop
- Yahoo/provider attempts 0
- RPC 0
- market-data writes 0
- no rerun
- workflow removed; cleanup commit `772f687c339fd729f3e11c682649926e4ca52645`
- final branch diff 0; run count 1; never merged

The repository-equivalent pre-#202 digest `e1f56e29178a339efdfaf38c66e127fe65db5c767e454cd4b2f9e04add4973c9` is also stale historical evidence only.

## Reusable bounded v1 durable capability

- batch size 1..10
- Yahoo + Rakuten exact persisted identities
- exact-main SHA + observation key + complete frozen snapshots + exact prior counts -> digest
- persisted source/raw identity fields are part of the digest
- dry-run provider/RPC/write 0
- future approved write mode max3 attempts/listing / max30 total
- Yahoo pacing >=1000ms; Rakuten >=1200ms
- all-safe-or-no-RPC
- exactly one atomic RPC after all targets safe
- pre-RPC sanitized resolver manifest mandatory
- no automatic RPC retry
- deterministic observation IDs recomputed in SQL
- append one observation per target; listing update allowlist only
- no completed `sold` / no `sold_at`
- ambiguous resolver SELECT-only

Successful #201 proves this generic lane can safely persist both unchanged observations and a real price change.

## R2 historical evidence

Yahoo-only R2 v2:

- Actions `33621881117`: SUCCESS
- Yahoo attempts 4 total / 1 each / retries 0
- all unchanged
- exactly one v2 RPC
- Production 113/113/0 -> 113/117/4
- sold stayed 0
- workflow removed; final diff0/run count1/never merged

Original R2 v1 `33605362604` stopped fail-closed on first Rakuten not_found; remaining target calls 0, RPC0, writes0.

R2 ledgers:

- `20260902073919 / r2_atomic_reobservation_canary`
- `20260902095120 / r2_yahoo_only_reobservation_canary_v2`

R2 approvals are consumed/non-reusable.

## Data Scale interpretation

At the verified post-#201 checkpoint, truthful repeated-history coverage is **10.43%** and has crossed the first Scoreboard history threshold.

Therefore the next task is **not automatically another history write**. Re-read the Scoreboard and compare remaining breadth/depth/source-quality gaps. Select the single highest-leverage remaining DATA bottleneck before requesting more Production/provider authority.

An already-approved P3 breadth run `33655998914` previously increased breadth from 113/117 to 115/119 while re-observed stayed 4. Independent breadth growth is expected and can change the denominator.

## Exact next step after #204 reaches main

Read-only first:

1. re-fetch main and live Production counts;
2. re-read current Data Scale Scoreboard inputs;
3. confirm the history threshold remains passed with the live denominator;
4. compare remaining bottlenecks: lawful breadth, R3 depth read-only, further history compounding, source/provenance quality;
5. choose one next DATA experiment by expected user/revenue value, not infrastructure neatness;
6. if Data Scale is now sufficient for the defined threshold, shift effort toward TRAFFIC -> CLICK -> REVENUE rather than endless data plumbing;
7. any new provider/RPC/Production execution remains fresh-approval-only.

## Known Foundation harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

- #182: 9 migrations applied before stale expected-8 failure
- #188: 10 migrations applied before stale expected-8 failure
- #197/#198: 11 migrations applied before stale expected-8 failure

This is known workflow debt, not migration failure. Repair remains separately approval-bound.

## Approval state

Consumed/non-reusable:

- #172 Yahoo continuation
- original #179 R2 v1 provider/write + workflow approval
- Yahoo-only R2 v2 provider/RPC + workflow approval
- #188 review substitution
- #196/#197 review substitution consumed by #198 merge
- first #201 approval tied to invalid `9940...` digest
- successful #201 retry approval tied to main `9859ab4d...` + digest `1142a10b...`

Never rerun:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`

Not authorized now:

- another generic bounded provider/RPC execution
- generic migration reapplication
- R3/R4
- F0/#142 merge/dispatch
- workflow/schedule changes/dispatch
- Secrets/Variables changes
- paid/destructive actions

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not weaken strict market matching for coverage
- do not mix completed sold evidence with active/sold_out asking-price evidence
- do not scrape Mercari or Amazon
- no direct push to `main`
