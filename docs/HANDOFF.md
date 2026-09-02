# Gacha Lens Canonical Handoff

Updated: 2026-09-02 JST — post-#179 first Production attempt / Issue #185 canonical sync

This is the canonical operational handoff for resuming Gacha Lens. Prefer newer verified GitHub/Vercel/Supabase/provider evidence over dated values here.

## Self-referential canonical-sync rule

This file is authored by Issue #185.

- If read from branch `docs/canonical-sync-post-r2-attempt-185` or its open PR, finish that docs-only exact-head validation/release flow first.
- If read from `main`, Issue #185 is complete by definition because this content reached `main`. Do not create another docs-only sync merely to mark #185 complete. Resume #179 only at the safe read-only redesign/reselection step below.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch `main`, open PRs/Issues, recent Actions, Vercel and live Production evidence needed before acting.
3. Resume durable Issue/branch/PR work; do not duplicate it.
4. Do not repeat completed or failed Production canaries merely to refresh context.
5. Production DB mutation/migration/schema work, approval-bound live provider execution, workflow/schedule changes or dispatch, Secrets/Variables changes, paid actions, contractual commitments, destructive work, direct main pushes and ineligible merges/releases require explicit approval.
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

The immediate DATA bottleneck remains truthful repeated-observation history. Production still has zero listings with 2+ observations.

## Absolute project safety rules

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not casually change F0 official auto or P3 V2 market auto
- Kitan auto remains off; Qualia auto remains unapproved
- never weaken the strict single-item matcher merely for coverage
- completed `sold` evidence stays separate from active/sold_out listing evidence
- do not scrape Mercari or Amazon
- no paid/licensed source activation without explicit approval
- no direct push to `main`
- no Production DB write/migration/schema/backfill/reset/cleanup without exact applicable approval
- no approval-bound provider call, workflow dispatch/change, Secrets/Variables change or destructive action by implication

PR #142 / Issue #137 remains a separate F0 Production-impact approval boundary.

## Current repository / release checkpoint

Canonical main before Issue #185 sync:

`8a63676bc11474644f8cc09c2fde43886c00c9f0`

That is PR #184's squash merge.

Completed milestones:

- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP exact-read repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 R2 atomic persistence prerequisite: completed in repository
- #183/#184 post-prerequisite canonical sync: completed
- #184 exact-head CI/Preview/self-review passed under a #184-only human substitution
- #184 normal Git-triggered Production deployment `dpl_GWeSyvRhWmta2oSjjmLCxPJTqqD2`: READY with canonical aliases including `gachalens.com` and `www.gachalens.com`

The #184 review substitution ended with #184 and grants no authority for later work.

## R1 durable result

R1 #172 established that exact-provider reads can fail closed without changing Production:

- Rakuten frozen 3: all `not_found`
- Yahoo final frozen 3 after parser repair: two `unchanged`, one `not_found`
- Production DB writes: 0
- false completed `sold`: 0
- Yahoo continuation approval consumed exactly 9/9 and is exhausted

Do not reuse #172 Yahoo approval.

## Yahoo JSONP durable contract

PR #176 permanently repaired Yahoo exact `itemLookup` compatibility. Only these raw-byte-0 forms are accepted:

1. fixed internal callback immediately at byte 0; or
2. exact literal `/* */` at byte 0 immediately followed by that fixed callback.

Leading whitespace/BOM, alternate comments, wrong callbacks, bare JSON and malformed wrappers fail closed.

## R2 repository prerequisite

Issue #180 / PR #182 added the deliberately narrow R2 path.

Repository migration file:

`supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`

Core contract:

- exactly four frozen known listings, 2 Rakuten + 2 Yahoo
- shared logical observation key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- exact current-main/cohort approval binding
- exact provider reads only; no keyword rediscovery/provider substitution
- max 3 attempts/listing; max 12 HTTP attempts total
- same-provider pacing: Rakuten >=1200ms, Yahoo >=1000ms
- any unsafe/not_found/throttled/provider-error/identity-mismatch result stops before RPC
- one PostgreSQL transaction only if all four plans are valid exact `seen`
- four observation inserts + four listing updates limited to `price/status/last_observed_at/updated_at`
- no completed `sold` / `sold_at`
- no automatic RPC retry
- ambiguous commit resolver is SELECT-only and never authorizes automatic retry
- RPC `SECURITY INVOKER`, empty search_path, service_role-only EXECUTE

PR #182 exact-head Code Quality `33600534520` and Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK` passed. Disposable Supabase run `33600534418` applied all nine repository migrations before the stale fixed-eight migration assertion failed.

## Frozen original #179 cohort

The original four remain unchanged in Production after the first execution attempt:

| Listing | Current | Last observed | Observation count | Deterministic R2 observation ID |
| --- | --- | --- | ---: | --- |
| `rakuten-auc-toysanta-10386044` | 598 / active | `2026-08-31T05:41:52.543Z` | 1 | `market-reobservation-05cd92e65bb9dbc29b6cb4c2b05f9724` |
| `rakuten-realize-store-2-10575349` | 898 / active | `2026-08-31T05:41:52.543Z` | 1 | `market-reobservation-277ddad06f32358e9fc13ed597608a93` |
| `yahoo-lead-netstore-302507s186ook3` | 698 / active | `2026-08-16T08:50:42.683Z` | 1 | `market-reobservation-ee52021350491f4496916654e2f74703` |
| `yahoo-selen-shope-5500000224314` | 1500 / active | `2026-08-31T05:41:52.543Z` | 1 | `market-reobservation-371537fad7dfb98834b92754610e6f08` |

All four deterministic R2 observation IDs are still absent.

## Production market-data baseline after failed R2 attempt

Fresh SELECT-only verification after Actions run `33605362604`:

- market listings: **113**
- market listing observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**
- each original #179 target still has exactly one observation
- R2 market-data write delta: **0**

No truthful history row was created by the attempt.

## Production R2 schema state changed under approved migration

The repository migration is now applied to Supabase Production.

Important ledger distinction:

- repository filename timestamp: `20260902150500`
- Supabase tooling recorded migration ledger version: `20260902073919`
- migration name: `r2_atomic_reobservation_canary`

The SQL body applied was the reviewed repository migration content. Supabase's connector/tool generated the ledger timestamp used for this application. Do not use the absence of ledger version `20260902150500` as evidence that the function is absent.

Verified Production function state:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- `security_definer=false` -> SECURITY INVOKER
- empty search_path
- PUBLIC execute=false
- anon execute=false
- authenticated execute=false
- service_role execute=true

Installing the function does not authorize invoking it again.

## #179 first approved Production attempt

The human explicitly approved one exact scope:

1. apply the reviewed R2 migration to Production;
2. allow fresh exact provider reads for the original frozen four, max 3 attempts/listing and max 12 HTTP attempts total;
3. only if all four were valid exact `seen`, allow exactly one atomic RPC write with expected deltas +0 listings / +4 observations / +4 re-observed / +0 completed sold.

A second explicit #179-only authorization allowed a disposable branch-only GitHub Actions workflow using existing repository Secrets, with no merge to `main`, and cleanup after execution.

Execution evidence:

- one-shot branch: `ops/r2-one-shot-179-20260902`
- workflow add commit: `2a263b4b3e8c5af2deb86c8d5d21b58c72a075ba`
- Actions run: `33605362604`
- exact approved main / branch-one-file guard: PASS
- first target `rakuten-auc-toysanta-10386044`: `not_found`
- it came from a successful HTTP response path, therefore exactly one Rakuten HTTP attempt was consumed and no retry occurred
- second Rakuten target: 0 provider calls
- both Yahoo targets: 0 provider calls
- atomic RPC calls: 0
- Production R2 market-data writes: 0
- run was not retried

This is a successful **safety outcome** but an unsuccessful **history-growth outcome**.

Do not infer `sold` or `sold_out` from this `not_found`.

## One-shot execution cleanup

The temporary workflow `.github/workflows/r2-one-shot-179.yml` was removed from the disposable branch in commit:

`cac883d9f74af9cad051a6fd853631f8a91ebc89`

Post-cleanup evidence:

- branch is two commits ahead of main only as audit history
- branch tree has **0 file differences** from main
- only one Actions run exists for that branch
- workflow deletion caused no second run
- no one-shot workflow commit was merged to main

The branch itself remains inert audit history unless a separately authorized cleanup deletes it.

## Approval state after the attempt

The #179 execution approval, provider envelope, one-shot workflow authorization and approval token are consumed for execution purposes.

Do **not**:

- rerun Actions run `33605362604`
- recreate/reuse the one-shot workflow under the old authorization
- reuse `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:8a63676bc11474644f8cc09c2fde43886c00c9f0:baa79db92e6302c2809559a796d47433a69a303d1b5a46c76979c3aab6492105`
- call the remaining three original targets under the old envelope
- invoke the installed R2 RPC
- treat the applied migration as standing write authority

Any further live provider call or Production market-data mutation requires a fresh exact human approval after a new frozen plan is reviewed.

## Exact next action after Issue #185 reaches main

Stay **read-only** and redesign R2 before asking for another Production execution.

1. Re-fetch current main and #179.
2. Investigate why the first Rakuten exact persisted identity returns `not_found` using repository/Production/history evidence only; do not make a live provider call yet.
3. Re-select a tiny truthful cohort or revise the provider mix based on durable evidence. Do not weaken the matcher or infer lifecycle from absence.
4. The currently installed RPC hardcodes the original four listing IDs and key. If the cohort changes, create a reviewed **new migration/function contract** rather than silently reusing the old frozen RPC.
5. Validate new code/schema prerequisite through tests, CI, Preview and review.
6. Run a fresh SELECT-only Production preflight.
7. Present a new exact human approval request covering the new provider envelope and any required Production migration/function/write.
8. Stop before any new provider request or Production mutation until that new approval exists.

Do not jump automatically to R3/R4 while R2 repeated history is still zero unless a newer explicit product decision changes priority.

## Known workflow debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` proves all nine repository migrations applied in disposable Supabase before that stale assertion failed. Repair remains a separate approval-bound workflow task.
