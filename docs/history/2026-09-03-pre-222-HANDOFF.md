# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — #214 R4 fail-closed Production attempt / Issue #215 canonical sync

This file is the current operational handoff. The complete pre-#215 handoff is preserved byte-for-byte at `docs/history/2026-09-03-pre-215-HANDOFF.md`.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, open Issues/PRs, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Resume durable Issue/branch/PR work; do not duplicate completed or failed canaries merely to refresh context.
4. Production DB mutation/migration/schema/backfill/reset/cleanup, approval-bound provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid/destructive actions, direct main pushes, and ineligible merges/releases require explicit applicable approval.
5. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major implementation/execution phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Canonical main at #214 attempt: `7b7b04f68d693dc2f50248adf3a4ecafd99bc472`
- Production: `https://gachalens.com`
- Vercel Production deployment for that main: `dpl_CANqH8RetfJRhCDeJd6CeHj1bGpc` — READY
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`

## Authoritative Production checkpoint after #214

The #214 Production attempt is **fail-closed terminal evidence for that authorization**.

Before the attempt:
- market listings: **127**
- observations: **149**
- re-observed listings: **22**
- repeated-history rate: **22/127 = 17.3228%**
- completed sold: **0**
- fresh <30d covered variants: **117**
- fresh depth: **116 x1 / 1 x2 / 0 x3+**
- current Scoreboard P0: **`depth_insufficient`**

#214 exact frozen R4 identity:
- main `7b7b04f68d693dc2f50248adf3a4ecafd99bc472`
- observation key `depth-r4-v1:20260903-01`
- batch digest `adae640b856f8de560195430a86f6ee618953b5646dd3833226b7815ce4bb81b`
- target variant `gashapon-4535123846069000-伏黒恵`
- candidate listing `yahoo-suruga-ya-601199451001`
- candidate key `1091dce22a0bf29f`
- fingerprint `56e8f3798cbf366f3b2936ad2034600c27ed36bb5f33ff7c9a6f522a86748198`
- evidence price/status `980 / active`
- deterministic observation `market-depth-r4-924833906c89effa6b6e67c9b76409dc`

Immediate prewrite drift gate PASSed:
- exact main unchanged
- variant/series exact, `review_required=false`, `variant_type=normal`
- fresh safe depth exactly 1 with existing set [`yahoo-suruga-ya-601192353001`]
- unresolved target catalog issues 0
- candidate listing/public URL/provider-native collisions 0
- deterministic observation collision 0

## R4 migration state

The reviewed repository migration `supabase/migrations/20260903033000_market_depth_r4_atomic_v1.sql` was applied once to Production under #214 authority.

Production ledger:
- `20260903091535 / market_depth_r4_atomic_v1`

Installed function:
- `public.apply_market_depth_r4_atomic_v1(jsonb)`
- SECURITY INVOKER (`security_definer=false`)
- empty `search_path`
- PUBLIC execute: false
- anon execute: false
- authenticated execute: false
- service_role execute: true

Migration application itself changed no market data: Production remained **127 listings / 149 observations / sold0** and the candidate rows remained absent.

## #214 write attempt — FAIL-CLOSED

A durable resolution manifest was recorded on Issue #214 before the only authorized write call.

The authorized function invocation was made **exactly once** as service_role and failed synchronously before any inserts with:

`ERROR 2201B: invalid regular expression: invalid repetition count(s)`

Root cause:
- SQL contains `^[A-Za-z0-9:._-]{1,300}$` for `source_listing_id` validation.
- PostgreSQL regular-expression repetition bounds do not accept 300, so evaluation fails before the write loop can begin.
- Repository/static/disposable migration-apply tests proved the function can be created, but they did not execute this validation branch and therefore missed the runtime defect.

No RPC/function retry was made. #214 authority is consumed and non-reusable.

Independent post-failure SELECT at `2026-09-03T09:17:15Z` proved:
- market listings: **127**
- observations: **149**
- completed sold: **0**
- target fresh depth: **1**
- candidate listing: **absent**
- deterministic observation: **absent**
- R4 function: installed
- R4 ledger: `20260903091535`

The commit state is **not ambiguous**. The SQL error was synchronous and post-failure rows prove zero target writes.

## Critical R4 safety state

**DO NOT invoke the currently installed R4 function again.**

Required sequence before any new Production R4 write:
1. Finish Issue #215 canonical sync.
2. Create a repository-only repair for the invalid SQL validator.
3. Replace the `{1,300}` SQL repetition with equivalent safe validation, e.g. explicit `length(...) between 1 and 300` plus a character-only regex that has no unsupported repetition bound.
4. Add a disposable-DB runtime test that actually invokes the R4 function, not merely applies the migration.
5. Run exact-head tests/lint/Preview/disposable Supabase proof and applicable review gates.
6. Merge the repository repair only when eligible.
7. Production repair migration is a **new explicit approval boundary**.
8. After Production repair is approved/applied, re-fetch main and target state, rebuild/fresh-bind the exact R4 manifest/digest, and request a **new one-candidate R4 write approval**.
9. No automatic retry of the consumed #214 call.

## R3 source evidence retained

Issue #206 R3 read-only canary remains the immutable source evidence for the candidate:
- run `33665350076`, job `100365611263`, SUCCESS
- artifact `9860342840`
- artifact digest `sha256:a0fe9011e7b0102f8464835385746b0437fdebff74791e6db9d294d015df5e8a`
- source main `b38f62ef81b8ec3a9cdf02395d4bdd678dadee31`
- generated_at `2026-09-02T18:08:53.303Z`
- planner requests5 / HTTP attempts5 / retry0 / Production writes0

The #206 provider/workflow authority is consumed. R4 repair must not rediscover or substitute a candidate under old authority.

## History capability

Generic bounded history remains healthy and installed:
- `apply_market_reobservation_bounded_v1(jsonb)`
- ledger `20260902165958 / market_reobservation_bounded_v1`
- SECURITY INVOKER / empty search_path / service_role-only
- successful #211 run `33726009433` restored Production to 127 listings / 149 observations / 22 re-observed / sold0
- #211 authority is consumed/non-reusable

Do not run more history automatically merely because R4 failed; current history rate remains 17.3228% unless live data later changes it.

## Approval / execution state

Consumed/non-reusable include:
- all R1/R2 execution approvals
- first and successful #201 bounded-history approvals
- #206 R3 provider/workflow approval
- #208 review substitution
- #211 history provider/RPC/workflow approval
- **#214 R4 migration + one-write approval**

Not authorized now:
- any invocation of `apply_market_depth_r4_atomic_v1`
- Production R4 repair migration
- new R4 candidate persistence
- new provider calls
- another history write
- workflow/schedule creation/change/dispatch
- Secrets/Variables changes
- F0/#142
- paid/destructive work

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching for coverage.
- Keep completed sold evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- Do not infer merchant equivalence from display names.
- Do not invoke historical RPCs merely because functions exist.
- No direct push to `main`.
- #137/#142 remains a separate F0 Production-impact boundary.

## Full prior canonical snapshot

The complete handoff that existed immediately before #215 is preserved verbatim at:

`docs/history/2026-09-03-pre-215-HANDOFF.md`

Use it when older run IDs, historical decisions, prior approval text, or detailed R1/R2/#201/#206/#208 evidence is needed.