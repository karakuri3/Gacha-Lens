# Gacha Lens Status

Updated: 2026-09-03 JST — #211 history buffer restored / Issue #212 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This version is authored by Issue #212.

- On branch `docs/canonical-sync-post-history-buffer-212` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #212 is complete by definition; do not create a recursive docs sync merely to record its own merge.
- After #212 reaches main, resume Issue #119 with a fresh read-only Data Scale Scoreboard reassessment. R4 remains a separate Production approval boundary.

## Current repository checkpoint

Pre-#212 main:

`d7955b285fccd93b327ffb8d80594d400660c68c`

Completed relevant work:

- #196/#198 reusable bounded re-observation repository prerequisite
- #201 first reusable bounded history Production success
- #206 R3 read-only depth SUCCESS
- #207/#208 R4 atomic depth repository prerequisite merged
- #209/#210 canonical sync after R4 prerequisite
- #211 second bounded history Production SUCCESS
- #212 current mandatory canonical sync
- #142/#137 F0 remains separate human/Production-impact boundary

## Latest live Production checkpoint

Independent SELECT postflight after #211:

- market listings: **127**
- observations: **149**
- re-observed listings: **22**
- repeated-history rate: **17.3228%**
- completed sold: **0**
- all #211 deterministic observation rows: **10 / 10 present**
- all #211 targets: exactly **2 observations each**
- R4 function applied to Production by #211: **false**
- R4 frozen candidate persisted by #211: **false**

History is now materially above the first 10% Scoreboard threshold. This is current truth only; future breadth growth can change the denominator.

## #211 Production execution — SUCCESS

Identity:

- main `d7955b285fccd93b327ffb8d80594d400660c68c`
- key `reobs-v1:bounded-20260903-02`
- digest `7435ea9e78f1ebf5b27667bd0c252d48fbc6ef952ceb35d34c850c61ba7e68e3`
- Yahoo-only cohort size 10 / 10 distinct series

Actions:

- branch `ops/bounded-reobs-one-shot-211-20260903`
- add commit `b67b5ce78f36f6ff89aee9ebaa46327616ed9dc0`
- run `33726009433`
- job `100555009635`
- conclusion **SUCCESS**
- artifact `bounded-reobs-211-evidence`, ID `9881996601`
- artifact digest `sha256:c48abfa07cfcf78b81b661b4a09e5d43399e057f8507733a9f27f12509effdbe`

Provider/RPC:

- exact Yahoo attempts 10 total / 1 each
- retries0 / throttles0 / timeouts0
- outcomes: 9 unchanged / 1 price_changed
- 伏黒恵 `yahoo-suruga-ya-601192353001`: 1670 -> 1690 JPY, active retained
- resolver manifest preserved before RPC
- exactly one bounded RPC
- applied_count10 / observation +10 / newly-reobserved +10 / listing delta0 / sold delta0

Cleanup:

- workflow removed immediately
- cleanup commit `4ddccbb062ed0aa54742a6f6be4bbea7232b4389`
- final file diff vs approved main 0
- branch run count exactly1
- never merged
- no workflow_dispatch / migration reapply / Secrets/Variables / R4 / F0 / paid/destructive action

#211 authority is consumed and non-reusable.

## Reusable bounded history capability

Production generic v1 remains installed:

- migration `20260902213000_market_reobservation_bounded_v1.sql`
- ledger `20260902165958 / market_reobservation_bounded_v1`
- function `apply_market_reobservation_bounded_v1(jsonb)`
- SECURITY INVOKER / empty search_path / service_role-only

Do not reapply the migration. Any future provider/RPC use needs a fresh exact cohort/main/digest approval.

## R3 #206 — completed read-only depth evidence

Run `33665350076` succeeded with 5 planner requests / 5 HTTP attempts / retry0 / Production writes0.

Results:

- Buzz Lightyear Rakuten-first: no new strict-safe candidate
- 伏黒恵 Yahoo-first: one new strict-safe candidate

Frozen candidate:

- listing `yahoo-suruga-ya-601199451001`
- provider/native `yahoo_shopping:suruga-ya_601199451001`
- variant `gashapon-4535123846069000-伏黒恵`
- series `gashapon-4535123846069000`
- evidence price 980
- candidate key `1091dce22a0bf29f`
- fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`

#206 provider/workflow authority is consumed. R3 success does not authorize R4.

## R4 repository prerequisite — complete, Production not authorized

PR #208 merged repository capability as `10e097eaf11e70814a2d25bc1227e950f6b69d0f`.

Contract:

- frozen explicit 1..10 batch
- exact-main + manifest digest
- dry-run SELECT-only/provider0/RPC0/write0
- no provider discovery during write
- exact catalog/depth/unresolved/collision guards
- deterministic listing + first observation
- one atomic insert-only RPC
- no UPDATE/DELETE/completed sold/sold_at
- SECURITY INVOKER / empty search_path / service_role-only
- pre-RPC resolver manifest
- no automatic RPC retry
- SELECT-only resolver

Validation:

- Code Quality `33670220550`: SUCCESS
- tests 2062/2062 PASS
- Preview `dpl_2ejC77ayiEVzXBBhUA1w2Zt7K5y2`: READY
- Foundation `33670220535`: all 12 migrations applied successfully on disposable DB before known stale expected-8 assertion

The one-time #208 review substitution is consumed. It did not authorize Production migration/RPC.

## Historical history proof

- R2 v1 `33605362604`: fail-closed on first Rakuten not_found, RPC0/writes0.
- R2 v2 `33621881117`: four Yahoo unchanged checks + one atomic RPC, 113/113/0 -> 113/117/4.
- #201 `33660684355`: eight Yahoo checks + one RPC, 115/119/4 -> 115/127/12.
- #211 `33726009433`: ten Yahoo checks + one RPC, 127/139/12 -> 127/149/22.

All associated approvals are consumed.

## Data Scale interpretation NOW

History is currently **22/127 = 17.3228%**, so `history_not_enabled` should no longer be assumed to be the current bottleneck.

The next move must be selected by fresh live Scoreboard evidence. Based on the most recent depth evidence, `depth_insufficient` is likely to return, but verify before acting.

## Exact next step after #212 reaches main

Read-only first:

1. re-fetch current main;
2. re-fetch live listings/observations/re-observed/sold;
3. re-fetch fresh depth distribution, coverage and source mix;
4. re-run/re-read the Data Scale Scoreboard;
5. if depth is selected, rebind the #206 R3 candidate to current main/current Production state and compute a fresh R4 digest;
6. request new R4-specific Production migration + one-RPC authority only after preflight passes;
7. if another bottleneck is selected, follow it instead;
8. after any Production milestone, immediately canonical-sync before continuing.

## Known Foundation harness debt

`.github/workflows/foundation-baseline.yml` still expects the original eight migration versions. Disposable DB has successfully applied 9, 10, 11 and 12 migrations in later proofs; the red state after application is stale harness debt, not migration failure.

Repair remains a separate Production-capable workflow-change approval boundary.

## Approval state

Consumed/non-reusable:

- #172 Yahoo continuation
- original #179 R2 v1 authority
- Yahoo-only R2 v2 authority
- first #201 invalid-digest authority
- successful #201 bounded history authority
- #196/#198 review substitution
- #206 R3 provider/workflow authority
- #208 review substitution
- **#211 bounded history authority**

Never rerun merely to refresh evidence:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`
- `33665350076`
- `33726009433`

Not authorized now:

- R4 Production migration/application
- R4 RPC/data write
- more bounded history provider/RPC execution
- provider execution under old approvals
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
