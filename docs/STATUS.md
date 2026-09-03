# Gacha Lens Status

Updated: 2026-09-03 JST — R4 repository prerequisite merged / Issue #209 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #209.

- On branch `docs/canonical-sync-post-r4-prereq-209` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #209 is complete by definition; do not create a recursive docs sync merely to record its own merge.
- After #209 is on `main`, resume Issue #119 with a fresh **read-only Data Scale Scoreboard/bottleneck reassessment**. R4 Production execution is not automatically next.

## Current repository checkpoint

Current pre-#209 main:

`10e097eaf11e70814a2d25bc1227e950f6b69d0f`

Relevant completed work:

- #196/#198 reusable bounded re-observation repository prerequisite: complete
- #201 first reusable bounded history batch: successful Production objective
- #204/#205 post-history canonical sync: complete
- #206 R3 read-only depth canary: complete SUCCESS, Production writes0
- #207 / PR #208 R4 atomic depth repository prerequisite: merged
- #209 post-R4-prerequisite canonical sync: current phase gate
- #142/#137 F0: separate human approval boundary

## Latest live Production checkpoint

Fresh SELECT-only evidence after #208 merge:

- market listings: **127**
- observations: **139**
- listings with 2+ observations: **12**
- completed sold: **0**
- repeated-history coverage: **12 / 127 ~= 9.45%**
- R4 function present: **false**
- R4 candidate listing `yahoo-suruga-ya-601199451001` present: **false**
- 伏黒恵 fresh safe listing IDs: exactly [`yahoo-suruga-ya-601192353001`]

The earlier post-#201 checkpoint was 115 / 127 / 12 / sold0 and history coverage 10.43%. Independent breadth growth increased the denominator without increasing re-observed count, so the first 10% history threshold is currently below threshold again.

A recent scheduled P3 V2 automatic run `33715651335` completed successfully on prior main and is consistent with approved independent breadth growth. Do not claim it alone caused the full +12 delta without exact run evidence.

## #206 R3 read-only depth — complete SUCCESS

Scoreboard at R3 planning time:

- listings 115
- observations 127
- re-observed 12 / 115 = 10.4348%
- fresh covered variants 105
- depth x1: 104 variants
- depth x2: 1
- depth x3+: 0
- current reviewed bottleneck then: `depth_insufficient`

Execution:

- exact approved main: `b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`
- branch: `ops/r3-depth-one-shot-206-20260903`
- Actions run `33665350076`, job `100365611263`: **SUCCESS**
- artifact `r3-depth-206-evidence`, ID `9860342840`
- artifact digest `sha256:a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`
- planner requests 5 / HTTP attempts 5
- retries0 / timeout0 / rate-limit0 / permanent failures0
- provider fallback false / affiliate enrichment false
- Production writes0 / RPC0 / migration0

Results:

- Buzz Lightyear Rakuten-first: 3 requests, new safe candidates0; one duplicate/existing candidate
- 伏黒恵 Yahoo-first: 2 requests, raw5, one new strict-safe accepted

Frozen safe candidate:

- variant `gashapon-4535123846069000-伏黒恵`
- series `gashapon-4535123846069000`
- listing `yahoo-suruga-ya-601199451001`
- provider/native `yahoo_shopping:suruga-ya_601199451001`
- URL `https://store.shopping.yahoo.co.jp/suruga-ya/601199451001.html`
- price 980
- status active
- candidate key `1091dce22a0bf29f`
- selection fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`

Cleanup commit `4815827a911737eacb758845cf8d671c629a874e`; final disposable branch diff0/run count1/never merged/no workflow_dispatch.

#206 live-provider/workflow approval is consumed. Never rerun `33665350076` by implication.

## #207 / #208 R4 repository prerequisite — complete

PR final exact head:

`e46b0c8c2e40b6f0b464cac703b982891a2d239c`

Merged main:

`10e097eaf11e70814a2d25bc1227e950f6b69d0f`

Diff:

- exactly 7 added files
- existing files modified: 0
- deletions: 0

Contract:

- frozen explicit batch 1..10
- exact-main + manifest digest and unique approval namespace
- dry-run DB SELECT-only / provider0 / RPC0 / write0
- write consumes frozen evidence only; no provider discovery
- exact catalog/depth/unresolved/collision guards
- deterministic listing/observation identities
- one atomic insert-only RPC
- no UPDATE/DELETE/sold/sold_at
- SECURITY INVOKER / empty search_path / service_role-only
- resolver manifest required pre-RPC
- no automatic RPC retry
- SELECT-only resolver `committed | not_committed | inconsistent`

Validation:

- Code Quality `33670220550`: SUCCESS
- 2062/2062 tests PASS
- lint PASS
- diff check PASS
- exact-head Preview `dpl_2ejC77ayiEVzXBBhUA1w2Zt7K5y2`: READY
- Foundation `33670220535`: all 12 migrations including R4 applied on disposable Supabase, DB reset completed, then known stale expected-8 migration-order assertion failed
- self-review `5093856424`: no blocking finding; not independent
- inline threads0 / Vercel unresolved feedback0

One-time #208 independent-review substitution was granted by the user only for exact-head repository merge, recorded in PR, consumed, and grants no Production R4 authority.

## #208 normal Production release

Vercel:

- deployment `dpl_J3RwK5mbkfuyCPENVQFXEpCAwNgK`
- exact SHA `10e097eaf11e70814a2d25bc1227e950f6b69d0f`
- target Production
- **READY**
- source Git
- aliases include `gachalens.com`
- no manual deployment/promotion

Supabase after that release still has no R4 function and no R4 candidate listing. Repository release and DB schema state remain separate.

## Reusable bounded history Production capability

Generic bounded v1 is already installed:

- repository migration `20260902213000_market_reobservation_bounded_v1.sql`
- ledger `20260902165958 / market_reobservation_bounded_v1`
- function `apply_market_reobservation_bounded_v1(jsonb)`
- SECURITY INVOKER / empty search_path / service_role-only

Successful run `33660684355` added +8 observations/re-observed via exactly one RPC; 7 unchanged + 1 truthful price change 568 -> 399; Production became 115/127/12/sold0. Its approval/token/workflow authorization is consumed.

## Data Scale interpretation NOW

R3 was selected correctly for its then-current state because history was 10.43% and depth was overwhelmingly x1.

Current live state is different: 12/127 ~=9.45% re-observed coverage. Therefore the first history threshold can no longer be treated as passed. The reviewed Scoreboard must be recomputed before choosing the next Production move.

Do not execute R4 merely because the prerequisite is ready and one safe R3 candidate exists.

## Exact next step after #209 reaches main

Read-only first:

1. re-fetch exact current main;
2. re-fetch live Production counts plus current depth distribution and source coverage inputs;
3. re-run/re-read the Data Scale Scoreboard;
4. determine whether current P0 bottleneck is history, depth, source gap, or another reviewed condition;
5. if depth/R4 remains highest leverage, fresh-rebind the R4 manifest/preflight to current main/DB state and then request new exact human approval;
6. if history is higher leverage, design a new bounded history batch instead and request separate fresh authority;
7. if useful Data Scale thresholds are met, shift toward TRAFFIC -> CLICK -> REVENUE.

## Known Foundation harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

- #182: 9 migrations successfully applied before stale expected-8 failure
- #188: 10 applied
- #197/#198: 11 applied
- #208: **12 applied**, including R4

Repair remains a separate Production-capable workflow-change approval boundary.

## Approval state

Consumed/non-reusable:

- #172 Yahoo continuation
- original #179 R2 v1 provider/write + workflow authority
- Yahoo-only R2 v2 provider/RPC + workflow authority
- first #201 invalid-digest authority
- successful #201 bounded history authority
- #196/#198 review substitution
- #206 R3 provider/workflow authority
- #208 review substitution

Never rerun merely to refresh evidence:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`
- `33665350076`

Not authorized now:

- R4 Production migration or RPC/data write
- more bounded history provider/RPC execution
- new provider execution under old approvals
- workflow/schedule changes or dispatch
- Secrets/Variables changes
- F0/#142
- paid/destructive actions

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually repair migration ledger timestamps
- do not weaken strict market matching for coverage
- do not mix completed sold evidence with active/sold_out asking-price evidence
- do not scrape Mercari or Amazon
- do not invoke installed historical RPCs merely because they exist
- no direct push to `main`
