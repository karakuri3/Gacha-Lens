# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — #211 history buffer restored / Issue #212 canonical sync

This is the canonical operational handoff for Gacha Lens. Re-fetch live GitHub, Vercel, Supabase, provider, and search/traffic evidence before making any current-state decision.

## Self-referential canonical-sync rule

This version is authored by Issue #212.

- If read from branch `docs/canonical-sync-post-history-buffer-212` or its open PR, finish that docs-only validation/release flow first.
- If read from `main`, Issue #212 is complete by definition; do not create another docs-only sync merely to record #212's own merge.
- After #212 reaches `main`, resume Issue #119 with a fresh **SELECT-only Data Scale reassessment**. History has a restored buffer; do not automatically execute R4 unless current Scoreboard evidence still selects depth as the next bottleneck.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open PRs/Issues, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Resume durable Issue/branch/PR work; do not duplicate completed or in-flight work.
4. Never rerun a completed/failed canary merely to refresh context.
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

## Product / business priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Decision order remains **DATA -> TRAFFIC -> CLICK -> REVENUE**. Infrastructure is useful only when it improves truthful user-facing data, traffic, click value, or monetization evidence.

## Current canonical repository checkpoint

Pre-#212 main:

`d7955b285fccd93b327ffb8d80594d400660c68c`

That main already contains:

- reusable bounded re-observation v1 repository capability and Production-installed generic function;
- #206 R3 read-only depth evidence;
- #207/#208 R4 atomic depth repository prerequisite;
- #209/#210 canonical sync after R4 prerequisite merge.

R4 repository prerequisite merge commit:

`10e097eaf11e70814a2d25bc1227e950f6b69d0f`

Its normal Git-triggered Vercel Production release reached READY. Repository release does **not** imply Supabase R4 schema/write authority.

## Latest live Production checkpoint — after #211 SUCCESS

Independent SELECT verification after Actions run `33726009433`:

- market listings: **127**
- observations: **149**
- listings with 2+ observations: **22**
- completed sold: **0**
- repeated-history coverage: **22 / 127 = 17.3228%**
- all #211 target deterministic observations present: **10 / 10**
- all #211 targets now have exactly 2 observations
- R4 function `public.apply_market_depth_r4_atomic_v1(jsonb)`: **not applied to Production by #211**
- R4 frozen candidate `yahoo-suruga-ya-601199451001`: **still not persisted by #211**

This restores a material history buffer above the Scoreboard's first 10% history threshold. A future breadth increase can change the denominator again, so the threshold is never permanent truth; always re-fetch before acting.

## #211 — second reusable bounded Production history batch SUCCESS

Exact authority:

- approved main: `d7955b285fccd93b327ffb8d80594d400660c68c`
- observation key: `reobs-v1:bounded-20260903-02`
- cohort digest: `7435ea9e78f1ebf5b27667bd0c252d48fbc6ef952ceb35d34c850c61ba7e68e3`
- Yahoo-only frozen cohort: 10 listings / 10 distinct series
- composition: Suruga 1 / Lead Netstore 7 / Toysanta 2

Execution:

- disposable branch: `ops/bounded-reobs-one-shot-211-20260903`
- workflow add commit: `b67b5ce78f36f6ff89aee9ebaa46327616ed9dc0`
- Actions run: `33726009433`
- job: `100555009635`
- conclusion: **SUCCESS**
- run attempt: 1
- artifact: `bounded-reobs-211-evidence`, ID `9881996601`
- artifact digest: `sha256:c48abfa07cfcf78b81b661b4a09e5d43399e057f8507733a9f27f12509effdbe`

Provider result:

- Yahoo exact provider attempts: **10 total / exactly 1 each**
- retries: **0**
- throttles/timeouts: **0**
- outcomes: **9 unchanged / 1 price_changed**
- price change: `yahoo-suruga-ya-601192353001` (伏黒恵) **1670 -> 1690 JPY**
- status remained `active`

Persistence result:

- resolver manifest preserved before RPC
- exactly one `apply_market_reobservation_bounded_v1(jsonb)` RPC
- `applied_count=10`
- listing delta 0
- observation delta +10
- newly re-observed delta +10
- completed sold delta 0
- Production **127/139/12/sold0 -> 127/149/22/sold0**

Cleanup:

- workflow removed immediately on same disposable branch
- cleanup commit: `4ddccbb062ed0aa54742a6f6be4bbea7232b4389`
- final branch-vs-approved-main file diff: **0**
- push-trigger run count on branch: **exactly 1**
- branch never merged to main
- no workflow_dispatch
- no migration reapplication
- no Secrets/Variables change
- no R4/F0/paid/destructive action

The #211 provider/RPC/workflow authorization is **consumed and non-reusable**. Never rerun `33726009433` by implication.

## Reusable bounded history capability — Production installed

Generic bounded re-observation v1 remains installed in Production:

- repository migration: `supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`
- Production ledger: `20260902165958 / market_reobservation_bounded_v1`
- function: `public.apply_market_reobservation_bounded_v1(jsonb)`
- SECURITY INVOKER
- empty search_path
- service_role-only EXECUTE
- PUBLIC/anon/authenticated EXECUTE revoked

Contract:

- explicit frozen cohort 1..10
- Yahoo/Rakuten exact persisted identities
- exact-main + observation-key + complete frozen snapshot/prior-count digest
- dry-run provider/RPC/write0
- max3 attempts/listing / max30 total only under fresh approved write authority
- one atomic RPC only after all targets are safe
- deterministic observation IDs recomputed in SQL
- resolver manifest preserved before RPC
- no automatic RPC retry
- append one observation + allowlisted listing snapshot update only
- never fabricate completed `sold` / `sold_at`

Do not reapply this migration.

## #201 — first reusable bounded history SUCCESS

Successful #201 retry run `33660684355` proved the generic lane with 8 Yahoo attempts / retry0 / one RPC:

- 7 unchanged / 1 price_changed
- Toysanta target 568 -> 399 JPY, active retained
- Production 115/119/4/sold0 -> 115/127/12/sold0
- deterministic rows 8/8
- final disposable branch diff0/run count1/never merged

Its approval/token/workflow authority is consumed. The earlier invalid-digest attempt `33658579004` failed before provider calls and is also terminal/consumed evidence.

## R3 #206 — completed read-only depth evidence

At the R3 planning snapshot, history was 12/115=10.4348% and fresh depth was overwhelmingly x1, so `depth_insufficient` was correctly selected then.

Approved R3 main:

`b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`

Actions:

- run `33665350076`, job `100365611263`: **SUCCESS**
- artifact `r3-depth-206-evidence`, ID `9860342840`
- planner API requests 5 / HTTP attempts 5
- retries/timeouts/rate limits/permanent failures 0
- Production writes/RPC/migration 0

Results:

- Rakuten-first Buzz Lightyear: no new strict-safe candidate
- Yahoo-first 伏黒恵: exactly one new strict-safe candidate

Frozen R3 candidate:

- variant: `gashapon-4535123846069000-伏黒恵`
- series: `gashapon-4535123846069000`
- candidate key: `1091dce22a0bf29f`
- selection fingerprint: `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`
- listing ID: `yahoo-suruga-ya-601199451001`
- provider/native: `yahoo_shopping:suruga-ya_601199451001`
- URL: `https://store.shopping.yahoo.co.jp/suruga-ya/601199451001.html`
- evidence price: **980**
- status: `active`

#206 authority is consumed; R3 success never authorized R4.

## R4 atomic depth persistence prerequisite — repository capability only

Issue #207 / PR #208 added exactly seven new files and modified no existing files:

- `lib/domain/market-depth-r4-persistence.js`
- `scripts/market-depth-r4-canary.mjs`
- `scripts/market-depth-r4-resolve.mjs`
- `supabase/migrations/20260903033000_market_depth_r4_atomic_v1.sql`
- `tests/market-depth-r4-persistence.test.mjs`
- `tests/market-depth-r4-resolve.test.mjs`
- `tests/market-depth-r4-runner.test.mjs`

Final PR head:

`e46b0c8c2e40b6f0b464cac703b982891a2d239c`

Merged repository commit:

`10e097eaf11e70814a2d25bc1227e950f6b69d0f`

Contract:

- frozen explicit batch 1..10
- exact-main + complete manifest digest
- distinct namespace `APPROVE_MARKET_DEPTH_R4_ATOMIC_V1`
- dry-run DB SELECT-only / provider0 / RPC0 / write0
- write consumes frozen R3 evidence only; no provider discovery
- exact catalog/depth/unresolved/collision guards
- deterministic listing + initial-observation identities
- one atomic insert-only RPC
- no UPDATE/DELETE/completed sold/sold_at
- SECURITY INVOKER / empty search_path / service_role-only
- pre-RPC resolver manifest mandatory
- no automatic RPC retry
- SELECT-only resolver: `committed | not_committed | inconsistent`

Validation:

- Code Quality `33670220550`: SUCCESS
- Node tests 2062/2062 PASS
- lint PASS
- diff check PASS
- exact-head Preview `dpl_2ejC77ayiEVzXBBhUA1w2Zt7K5y2`: READY
- Foundation `33670220535`: all 12 repository migrations including R4 applied successfully on disposable Supabase; run then failed only at known stale expected-8 assertion
- strengthened self-review `5093856424`: no blocking finding; explicitly not independent

The #208 one-time review substitution is consumed and grants **no R4 Production authority**.

## R1/R2 historical proof

- R1 #172: read-only exact-provider canary complete, Production writes0.
- Original R2 v1 Actions `33605362604`: failed closed on first Rakuten `not_found`, RPC0/writes0.
- Yahoo-only R2 v2 Actions `33621881117`: four Yahoo attempts, all unchanged, one atomic RPC, Production 113/113/0 -> 113/117/4, sold0.
- All R1/R2 approvals/tokens/workflows are consumed. Do not invoke installed historical RPCs merely because they exist.

## Current Data Scale interpretation after #211

History is now **17.3228%** at the current 127-listing denominator, materially above the first 10% gate.

The next step is **not another automatic history batch**. Recompute current Scoreboard inputs. Based on the most recent pre-#211 depth evidence, depth is likely to become the next bottleneck again, but current live evidence must decide.

Potential next outcomes:

1. `depth_insufficient` -> fresh SELECT-only R4 preflight/rebinding; then request a fresh R4-specific Production migration + one-RPC authorization if still safe.
2. another DATA bottleneck -> follow the current Scoreboard instead of sunk-cost logic.
3. useful Data Scale thresholds met -> move toward TRAFFIC -> CLICK -> REVENUE.

## Exact next action after #212 reaches main

**Read-only first.**

1. Re-fetch exact current main.
2. Re-fetch live Production counts, re-observation rate, fresh depth distribution, fresh coverage and source mix.
3. Re-run/re-read `docs/DATA_SCALE_SCOREBOARD.md` and select the current automatic bottleneck.
4. If depth is selected, re-verify the #206 R3 candidate against current variant/series/review/unresolved/depth/collision state.
5. Rebuild the R4 frozen manifest/digest against the then-current main and current Production snapshot.
6. Only then request a **fresh R4-specific human approval** for Production migration application + exactly one atomic RPC. Credentialed disposable workflow authority, if required, must also be explicit.
7. After any R4 Production milestone, immediately canonical-sync again before the next major phase.

## Known Foundation CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

Observed disposable DB proofs:

- #182: 9 migrations applied before stale expected-8 failure
- #188: 10 migrations applied
- #197/#198: 11 migrations applied
- #208: **12 migrations applied**, including R4

This is workflow harness debt, not migration failure. Repairing the Production-capable workflow remains a separate approval-bound task.

## Approval / execution state

Consumed and non-reusable:

- #172 Yahoo continuation authority
- original #179 R2 v1 provider/write + workflow authority
- Yahoo-only R2 v2 provider/RPC + workflow authority
- first #201 invalid-digest attempt authority
- successful #201 bounded history authority
- #196/#198 repository review substitution
- #206 R3 live-provider/workflow authority
- #208 repository review substitution
- **#211 second bounded history provider/RPC/workflow authority**

Never rerun merely to refresh evidence:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`
- `33665350076`
- **`33726009433`**

Not authorized now:

- R4 Production migration/application
- R4 RPC/data write
- another bounded history provider/RPC execution
- new provider execution under consumed approvals
- workflow/schedule changes or dispatch
- Secrets/Variables changes
- F0/#142 merge/dispatch
- paid/destructive work

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching for coverage.
- Keep completed `sold` evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- Do not infer merchant equivalence from display names.
- Do not invoke old RPCs merely because functions exist.
- Do not reapply already-installed R2/generic bounded migrations.
- No direct push to `main`.
- #137/#142 remains a separate F0 Production-impact boundary.
