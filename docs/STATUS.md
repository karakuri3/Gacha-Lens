# Gacha Lens Status

Updated: 2026-09-02 JST — post-#188 Yahoo-only R2 v2 prerequisite / Issue #189 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #189.

- On branch `docs/canonical-sync-post-r2-v2-189` or its open PR, finish the docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #189 is complete by definition; do not create a recursive docs sync merely to mark its own merge.
- After #189 is on `main`, resume #179 only at a fresh SELECT-only v2 preflight. Do not apply the v2 Production migration/function, make live Yahoo calls, or invoke the v2 RPC without a new exact human approval.

## Repository / release checkpoint

- current canonical main before #189 sync: `f3da6c82952dd44bf343d2c1717cd62920ace116`
- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 original R2 atomic persistence prerequisite: completed
- #183/#184 post-prerequisite canonical sync: completed
- #179 first approved original R2 Production attempt: fail-closed on first Rakuten `not_found`; RPC 0; market-data writes 0; approval consumed
- #185/#186 post-attempt canonical sync: completed
- #187/#188 Yahoo-only R2 v2 repository prerequisite: completed and merged
- #188 final PR head: `53d7de690a7b5aacba65f69d30b6c70249182b3d`
- #188 squash merge/current main: `f3da6c82952dd44bf343d2c1717cd62920ace116`
- #188 exact-head PR Code Quality `33613902680`: SUCCESS
- #188 exact-head Vercel Preview `dpl_26iNtrQRcAN3ntTZHgxsiAAutV28`: READY
- #188 disposable Supabase Foundation `33613902714`: all 10 migrations applied successfully; run then failed only at the known stale expected-8 migration-order assertion
- #188 normal Git-triggered Production deployment `dpl_8qZotT9SYvG6zEQkmsaz9pY6Z2ms`: READY with `gachalens.com` / `www.gachalens.com`
- #187: closed completed
- #142/#137 F0: separate approval boundary

## #188 review substitution

For PR #188 only, the human explicitly authorized replacing independent Reviewer + Verifier with:

- exact-head CI
- exact-head Vercel Preview
- disposable Supabase migration-apply proof
- strengthened Lead/self-review

That exception ended with #188 and is non-transferable. It grants no Production migration/provider/RPC authority.

## Current Production market-data checkpoint

Fresh SELECT-only verification immediately before #188 merge:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

The Yahoo-only v2 frozen four are all still active, review-safe, and exactly one observation each:

1. `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
2. `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation
3. `yahoo-lead-netstore-qq222607s309ptk2` — 898 / active / 1 observation
4. `yahoo-toysanta-g-5l960018a9-002-57393` — 458 / active / 1 observation

No truthful repeated-history row exists yet.

## Production schema state

Original v1 R2 function remains installed from the previously approved #179 migration:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- SECURITY INVOKER
- empty search_path
- service_role-only EXECUTE

Yahoo-only v2 repository migration:

`supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`

Current Production state at the #188 merge boundary:

- `public.apply_market_reobservation_r2_canary_v2(jsonb)`: **absent**
- v2 Production migration/function application: **not performed**
- v2 live Yahoo provider calls: **0**
- v2 RPC calls: **0**
- v2 Production writes: **0**

Repository/Vercel release does not imply Supabase Production schema application.

## Frozen Yahoo-only R2 v2 contract

Observation key:

`reobs-v1:r2-20260902-02`

Reviewed deterministic v2 observation IDs:

- `yahoo-lead-netstore-302507s186ook3` -> `market-reobservation-8a75ea4bf9142e03626b21494b70177c`
- `yahoo-selen-shope-5500000224314` -> `market-reobservation-790961862647eeaeccf27f8115a688c8`
- `yahoo-lead-netstore-qq222607s309ptk2` -> `market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1`
- `yahoo-toysanta-g-5l960018a9-002-57393` -> `market-reobservation-e1ac79e10392067e6deb89991ed4ac53`

Durable execution design:

- distinct V2 approval namespace and cohort digest; old v1 token cannot authorize v2
- exactly four frozen Yahoo Shopping exact reads; no rediscovery/provider substitution
- serial same-provider pacing >=1000ms
- max 3 attempts/listing / max 12 total
- any non-valid exact `seen` fails closed before RPC
- exactly one PostgreSQL transaction only if all four are safe
- expected deltas: +0 listings / +4 observations / +4 re-observed / +0 completed sold
- one-prior-observation, deterministic-ID, identity/snapshot/import-issue, positive-price, active/sold_out and protected-field guards
- no completed `sold` or `sold_at`
- SECURITY INVOKER, empty search_path, service_role-only EXECUTE
- no automatic RPC retry
- ambiguous resolver is SELECT-only and always leaves `write_retry_authorized=false`

## Approval state

The original #179/v1 execution approval and token remain consumed. Never reuse them.

The #188 merge/review authorization is also consumed and did not authorize Production execution.

A new exact human approval is required before any of the following v2 actions:

1. apply `20260902180000_r2_yahoo_only_reobservation_canary_v2.sql` to Supabase Production;
2. make the frozen Yahoo live provider requests, bounded to max 12 HTTP attempts total;
3. if and only if all four produce valid exact `seen`, invoke the v2 atomic RPC exactly once.

## Exact next step after #189 reaches main

Stay read-only:

1. re-fetch current main, #179 and live Production state;
2. run a fresh SELECT-only v2 preflight for the exact four frozen Yahoo rows;
3. reverify each has exactly one observation, no unresolved import issue, no deterministic-ID collision, exact identity/snapshot and review-safe state;
4. reverify the v2 Production function/migration is still absent;
5. refresh current Supabase function/security guidance if needed;
6. compute/freeze the exact current-main + v2 cohort digest and exact V2 approval token;
7. present one fresh human approval request covering Production v2 migration application + max-12 exact Yahoo provider envelope + exactly-one RPC only-if-all-four-seen;
8. stop before any migration/provider/RPC mutation until that approval is explicit.

Do not jump to R3/R4 while truthful repeated history remains zero unless a newer explicit product decision changes priority.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions.

For #188 final head, run `33613902714` proved the disposable Supabase stack successfully applied all **10** repository migrations, including both R2 migrations. It then failed only because the assertion expected eight versions while ten were present. This remains a separate workflow-change task and is not a v2 migration failure.

## Hard boundaries

- no v2 Production migration/provider/RPC execution without fresh exact approval
- no reuse of original #179/v1 approval or token
- no R3/R4 Production execution by implication
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix completed sold with active/sold_out evidence, or scrape Mercari/Amazon
