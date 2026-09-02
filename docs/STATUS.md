# Gacha Lens Status

Updated: 2026-09-02 JST — post-R2 v2 Production migration / Issue #191 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #191.

- On branch `codex/post-r2-v2-migration-sync-191` or its open PR, finish that docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #191 is complete by definition; do not create a recursive docs sync merely to mark its own merge.
- After #191 is on `main`, resume #179 only at the exact disposable-workflow approval boundary below. Do not reapply the v2 Production migration, make live Yahoo calls, invoke the v2 RPC, or create/push the workflow without the applicable authority.

## Repository / release checkpoint

- current canonical main before #191 sync: `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 original R2 atomic persistence prerequisite: completed
- #183/#184 post-prerequisite canonical sync: completed
- #179 first approved original R2 attempt: fail-closed on first Rakuten `not_found`; RPC 0; market-data writes 0; approval consumed
- #185/#186 post-attempt canonical sync: completed
- #187/#188 Yahoo-only R2 v2 repository prerequisite: completed and merged
- #189/#190 post-#188 canonical sync: completed
- #190 squash merge/current approved main: `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- #190 normal Git-triggered Production `dpl_65egbLB3KUCntXStsECrp6ztrdCi`: READY with `gachalens.com` / `www.gachalens.com`
- #179 fresh v2 preflight and exact migration/provider/RPC approval: completed
- #179 approved v2 Production migration application: completed; provider/RPC execution remains paused
- #142/#137 F0: separate approval boundary

PR #188 final evidence remains durable:

- final head `53d7de690a7b5aacba65f69d30b6c70249182b3d`
- squash merge `f3da6c82952dd44bf343d2c1717cd62920ace116`
- PR Code Quality `33613902680`: SUCCESS
- Vercel Preview `dpl_26iNtrQRcAN3ntTZHgxsiAAutV28`: READY
- Foundation `33613902714`: all 10 migrations applied on disposable Supabase, then only the known stale expected-8 assertion failed
- normal Production `dpl_8qZotT9SYvG6zEQkmsaz9pY6Z2ms`: READY

The #188-only review substitution ended with #188 and grants no later review, Production, or workflow authority.

## Fresh Production checkpoint

Fresh SELECT-only verification at `2026-09-02T10:04:55Z`:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

The frozen Yahoo-only v2 four remain active, exact, review-safe, and exactly one observation each:

1. `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
2. `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation
3. `yahoo-lead-netstore-qq222607s309ptk2` — 898 / active / 1 observation
4. `yahoo-toysanta-g-5l960018a9-002-57393` — 458 / active / 1 observation

For every target: exact persisted identity holds, `matched_variant_id=variant_id`, positive price, `sold_at=null`, unresolved import issues 0, and deterministic v2 observation-ID collisions 0. No truthful repeated-history row exists yet.

## Production schema state

Original v1 R2 function remains installed from the prior approved attempt:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- SECURITY INVOKER, empty `search_path`, service_role-only EXECUTE

Yahoo-only v2 repository migration:

`supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql`

Current Production state after the exact approved v2 migration application:

- ledger version/name: `20260902095120` / `r2_yahoo_only_reobservation_canary_v2`
- `public.apply_market_reobservation_r2_canary_v2(jsonb)`: present
- SECURITY INVOKER (`security_definer=false`)
- empty `search_path`
- PUBLIC/anon/authenticated EXECUTE denied
- service_role EXECUTE allowed
- v2 migration application: complete; do not repeat
- v2 live Yahoo provider calls: **0**
- v2 RPC calls: **0**
- v2 market-data writes: **0**

## Frozen Yahoo-only R2 v2 contract

Observation key: `reobs-v1:r2-20260902-02`.

Reviewed deterministic IDs:

- `yahoo-lead-netstore-302507s186ook3` -> `market-reobservation-8a75ea4bf9142e03626b21494b70177c`
- `yahoo-selen-shope-5500000224314` -> `market-reobservation-790961862647eeaeccf27f8115a688c8`
- `yahoo-lead-netstore-qq222607s309ptk2` -> `market-reobservation-fcc0c3f5e4bace6f637bd808c44485a1`
- `yahoo-toysanta-g-5l960018a9-002-57393` -> `market-reobservation-e1ac79e10392067e6deb89991ed4ac53`

Execution stays exactly four Yahoo reads, serial >=1000ms, max 3 attempts/listing and max 12 total. Any non-valid exact `seen` fails closed before RPC. Only if all four are safe may exactly one atomic RPC produce expected deltas +0 listings / +4 observations / +4 re-observed / +0 completed sold. No automatic RPC retry is allowed.

## Approval state

The original #179/v1 approval/token and the #188 review authorization are consumed and non-reusable.

The human approved the v2 migration/provider/RPC scope bound to:

- main `dc25eb16b7e057397fe3bf9527f5467ac54b281a`
- digest `441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- token `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:dc25eb16b7e057397fe3bf9527f5467ac54b281a:441957a6649817acff82d5b07eb0c6e9701fa4473662ef8544a7a9fa61614a24`
- max 12 exact Yahoo attempts and exactly one RPC only if all four are safe

The migration portion is complete. The provider/RPC portion has not run because the reviewed runner requires a new Production-capable execution workflow, which that approval did not authorize.

## Exact next step after #191 reaches main

Request one separate exact human approval for the smallest safe execution mechanism:

1. create a disposable branch from exact approved main `dc25eb16b7e057397fe3bf9527f5467ac54b281a`;
2. add exactly one branch-only push-trigger workflow invoking only `scripts/market-reobservation-r2-v2-canary.mjs` with the exact SHA/token and existing repository Secrets;
3. preserve the exact-main + one-file-delta guard, read-only repository permissions, reviewed attempt limits, sanitized artifact, and no merge to `main`;
4. allow exactly one automatic push-triggered run; do not use `workflow_dispatch`;
5. immediately remove the workflow file from the same disposable branch after evidence capture, leaving only inert audit history.

Stop before creating or pushing that workflow until this exact workflow-change/automatic-run/cleanup authority exists. Do not jump to R3/R4 while truthful repeated history remains zero.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Runs `33600534418` and `33613902714` applied all then-current migrations before failing only at that stale assertion. Repair remains a separate Production-capable workflow-change task.

## Hard boundaries

- do not reapply the completed v2 Production migration
- no v2 one-shot workflow creation/push/run/cleanup without the separate exact workflow authority
- no v2 provider/RPC execution outside the approved exact SHA/token/cohort/envelope
- no reuse of original #179/v1 approval or token
- no R3/R4 Production execution by implication
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix completed sold with active/sold_out evidence, or scrape Mercari/Amazon
