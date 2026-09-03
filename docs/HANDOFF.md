# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — R4 repository prerequisite merged / Issue #209 canonical sync

This is the canonical operational handoff for Gacha Lens. Re-fetch live GitHub, Vercel, Supabase, provider, and GSC evidence before making any current-state decision.

## Self-referential canonical-sync rule

This file is authored by Issue #209.

- If read from branch `docs/canonical-sync-post-r4-prereq-209` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #209 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to record #209's own merge.
- After #209 reaches `main`, resume Issue #119 with a **fresh read-only Data Scale Scoreboard/bottleneck reassessment**. Do not automatically execute R4 merely because its repository prerequisite is now merged.

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

## Product / business priority

Customer promise: **「欲しいガチャを、見つけて、比べて、逃さない」**

Current umbrella: Issue #119 Data Scale.

Decision order remains **DATA -> TRAFFIC -> CLICK -> REVENUE**. Infrastructure is useful only when it improves truthful user-facing data, traffic, click value, or monetization evidence.

## Current canonical repository checkpoint

R4 repository prerequisite PR #208 was squash-merged to `main` as:

`10e097eaf11e70814a2d25bc1227e950f6b69d0f`

Issue #207 auto-closed.

Normal Git-triggered Vercel Production release:

- deployment: `dpl_J3RwK5mbkfuyCPENVQFXEpCAwNgK`
- Git SHA: `10e097eaf11e70814a2d25bc1227e950f6b69d0f`
- target: Production
- state: **READY**
- aliases include `gachalens.com`
- no manual deploy/promotion was used

A Vercel release is not a Supabase migration. The R4 Production function remained absent after this merge.

## Latest live Production checkpoint

Fresh SELECT-only evidence after #208 merge:

- market listings: **127**
- observations: **139**
- listings with 2+ observations: **12**
- completed sold: **0**
- repeated-history coverage: **12 / 127 ~= 9.45%**
- R4 function `public.apply_market_depth_r4_atomic_v1(jsonb)`: **absent**
- R4 candidate listing `yahoo-suruga-ya-601199451001`: **absent**
- target 伏黒恵 fresh safe depth still exactly one existing listing: `yahoo-suruga-ya-601192353001`

The earlier post-#201 checkpoint was 115 listings / 127 observations / 12 re-observed / sold0 = 10.43%. Independent breadth later grew the denominator to 127 while re-observed stayed 12, so the first 10% history threshold is no longer currently met.

A recent scheduled `Gacha Market P3 Bounded Seed V2 Automatic` run `33715651335` completed successfully on the prior main and is consistent with independent breadth growth, but do not attribute the entire +12 listing delta to that one run without inspecting its exact write evidence.

## R3 #206 — completed read-only depth evidence

Issue #206 first re-read the Scoreboard when Production was 115 listings / 127 observations / 12 re-observed. At that checkpoint history was 10.4348% and the reviewed Scoreboard advanced to `depth_insufficient` because 104/105 fresh covered variants had only one fresh listing.

Approved R3 exact main:

`b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`

Disposable branch:

`ops/r3-depth-one-shot-206-20260903`

Actions:

- run: `33665350076`
- job: `100365611263`
- conclusion: **SUCCESS**
- run_attempt: 1
- artifact: `r3-depth-206-evidence`, ID `9860342840`
- artifact digest: `sha256:a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`
- planner API requests: **5**
- HTTP attempts: **5**
- retries/timeouts/rate limits/permanent failures: **0**
- Production writes/RPC/migration: **0**

R3 targets:

1. Rakuten-first `tarts-y903861-バズ・ライトイヤー`
   - 3 requests / 3 HTTP attempts
   - one raw candidate, rejected as existing identity
   - strict-safe new accepted: 0
2. Yahoo-first `gashapon-4535123846069000-伏黒恵`
   - 2 requests / 2 HTTP attempts
   - 5 raw candidates
   - strict-safe new accepted: **1**

Frozen strict-safe R3 candidate:

- variant: `gashapon-4535123846069000-伏黒恵`
- series: `gashapon-4535123846069000`
- candidate key: `1091dce22a0bf29f`
- selection fingerprint: `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`
- listing ID: `yahoo-suruga-ya-601199451001`
- provider/native: `yahoo_shopping:suruga-ya_601199451001`
- URL: `https://store.shopping.yahoo.co.jp/suruga-ya/601199451001.html`
- title: `中古トレーディングフィギュア 伏黒恵 「るかっぷ ミニチュアコレクション 呪術廻戦」`
- price: **980**
- status: `active`

R3 workflow was removed immediately; cleanup commit `4815827a911737eacb758845cf8d671c629a874e`; final disposable-branch file diff vs approved main 0; branch never merged; push-trigger run count exactly 1; no `workflow_dispatch`.

The #206 provider/workflow approval is consumed and non-reusable. Never rerun `33665350076` by implication.

## R4 atomic depth persistence prerequisite — repository capability only

Issue #207 / PR #208 added exactly seven new files and modified no existing files:

- `lib/domain/market-depth-r4-persistence.js`
- `scripts/market-depth-r4-canary.mjs`
- `scripts/market-depth-r4-resolve.mjs`
- `supabase/migrations/20260903033000_market_depth_r4_atomic_v1.sql`
- `tests/market-depth-r4-persistence.test.mjs`
- `tests/market-depth-r4-resolve.test.mjs`
- `tests/market-depth-r4-runner.test.mjs`

Final exact PR head:

`e46b0c8c2e40b6f0b464cac703b982891a2d239c`

Repository contract:

- explicit frozen batch only, minimum 1 / maximum 10 candidates
- exact main SHA + complete frozen manifest -> SHA-256 batch digest
- distinct approval namespace `APPROVE_MARKET_DEPTH_R4_ATOMIC_V1`
- dry-run performs DB SELECT only: provider0 / RPC0 / write0
- write mode performs no provider discovery; it consumes previously frozen R3 evidence only
- exact variant/series/review-safe/fresh-depth/unresolved-issue/collision preconditions
- deterministic listing and initial-observation identities
- one PostgreSQL RPC `apply_market_depth_r4_atomic_v1(jsonb)`
- entire batch validated before inserts
- listing + first observation inserted atomically in one function transaction
- insert-only; no UPDATE / DELETE / completed `sold` / `sold_at`
- `SECURITY INVOKER`, empty `search_path`, schema-qualified relations
- EXECUTE revoked from PUBLIC/anon/authenticated; service_role only
- durable sanitized resolver manifest required before RPC
- exactly one RPC max; no automatic write retry
- ambiguous resolver is SELECT-only and returns `committed | not_committed | inconsistent`
- R3 evidence timestamp is preserved as observation/listing evidence time
- R1/R2/history/P2/P3 lanes remain untouched

Validation:

- Code Quality `33670220550`, job `100381685756`: **SUCCESS**
- Node tests: **2062 / 2062 PASS**
- lint PASS
- diff whitespace PASS
- exact-head Vercel Preview `dpl_2ejC77ayiEVzXBBhUA1w2Zt7K5y2`: **READY**
- GitHub inline review threads: 0
- Vercel unresolved feedback: 0
- strengthened self-review: review `5093856424`, no blocking finding; explicitly not independent
- Foundation disposable Supabase run `33670220535` successfully applied all **12** repository migrations including `20260903033000_market_depth_r4_atomic_v1.sql` and finished DB reset; the run then failed only because the known harness assertion still expects the original eight versions

The R4 migration was **not** applied to Production by #208.

## #208 review substitution — exact, one-time, consumed

The user explicitly approved a one-time substitution for PR #208 only: exact-head CI + Vercel Preview + disposable Supabase migration-apply proof + strengthened self-review in place of unavailable independent Reviewer/Verifier.

The substitution was recorded on PR #208, used only to mark Ready and squash merge the exact reviewed head, and is now **consumed**.

It did **not** authorize:

- R4 Production migration application
- R4 RPC/data write
- provider execution
- workflow dispatch/change
- Secrets/Variables changes
- F0, paid, destructive, or other Production work

## Reusable history lane — durable earlier proof

Generic bounded re-observation v1 remains installed in Production:

- repository migration: `supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`
- Production ledger: `20260902165958 / market_reobservation_bounded_v1`
- function: `public.apply_market_reobservation_bounded_v1(jsonb)`
- SECURITY INVOKER / empty search_path / service_role-only

Successful #201 run `33660684355` added eight truthful observations in one atomic RPC and moved Production 115/119/4 -> 115/127/12, sold0. One Yahoo price changed truthfully 568 -> 399. Its approval/token/workflow authority is consumed; never rerun it merely to restore the percentage.

Yahoo-only R2 v2 `33621881117` remains the first successful repeated-history proof. Original R2 v1 `33605362604` failed closed on first Rakuten `not_found`. All R1/R2 approvals are consumed.

## Current Data Scale interpretation

The R3 decision was correct for its 115-listing snapshot: history had crossed 10% and depth was overwhelmingly x1.

The live denominator later changed. At the latest checkpoint repeated-history coverage is **9.45%**, below the same first threshold. Therefore prior `depth_insufficient` status must not be treated as permanently authoritative.

After #209 reaches `main`, re-run/re-read the Scoreboard using current live counts and current depth/breadth/source metrics. Then choose the single highest-leverage DATA move. Possible outcomes include:

- another bounded history-compounding batch if history is again the reviewed P0 bottleneck;
- R4 persistence of the already-frozen strict-safe depth candidate if depth remains the highest-leverage bottleneck after the fresh reassessment;
- lawful breadth/source work if source gap dominates under the reviewed contract;
- moving toward TRAFFIC -> CLICK -> REVENUE if useful Data Scale thresholds are met.

Do not execute R4 based on sunk-cost logic.

## Exact next action after Issue #209 reaches main

**Read-only first.**

1. Re-fetch exact current `main`.
2. Re-fetch live Production listings/observations/re-observed/sold counts and current depth distribution.
3. Re-run/re-read `docs/DATA_SCALE_SCOREBOARD.md` inputs and determine the current automatic bottleneck.
4. Inspect recent approved P3 breadth activity only as needed to explain denominator growth; do not assume one run explains all growth without evidence.
5. If R4 is still highest leverage, perform a fresh SELECT-only R4 preflight/rebinding against the then-current main and Production state.
6. Only then build the exact frozen manifest/digest and request a **fresh R4-specific human approval** for Production migration + one atomic RPC. Any credentialed disposable workflow would require its own explicit authorization if needed.
7. If history has become the higher-priority bottleneck, do not apply R4 yet; design the next bounded history experiment and request its own fresh authority.

## Known Foundation CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

Observed disposable DB proofs:

- #182: 9 migrations applied before stale expected-8 failure
- #188: 10 migrations applied before stale expected-8 failure
- #197/#198: 11 migrations applied before stale expected-8 failure
- #208: **12 migrations applied**, including R4, before stale expected-8 failure

This is workflow harness debt, not migration failure. Repairing the Production-capable workflow is a separate approval-bound task.

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

Never rerun merely to refresh evidence:

- `33605362604`
- `33621881117`
- `33658579004`
- `33660684355`
- `33665350076`

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
