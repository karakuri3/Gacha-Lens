# Gacha Lens Status

Updated: 2026-09-02 JST — post-#179 first Production attempt / Issue #185 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #185.

- On branch `docs/canonical-sync-post-r2-attempt-185` or its open PR, finish the docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #185 is complete by definition; do not create a recursive docs sync merely to mark its own merge. Resume #179 only at the safe read-only redesign/reselection step described below.

## Repository / release checkpoint

- current canonical main before #185 sync: `8a63676bc11474644f8cc09c2fde43886c00c9f0`
- #172 R1 exact-provider read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180/#182 R2 atomic persistence prerequisite: completed in repository
- #183/#184 post-prerequisite canonical sync: completed
- #184 merge/main: `8a63676bc11474644f8cc09c2fde43886c00c9f0`
- #184 normal Vercel Production: `dpl_GWeSyvRhWmta2oSjjmLCxPJTqqD2` READY with `gachalens.com` / `www.gachalens.com`
- #179 R2 Production persistence issue: still open; first approved execution attempt stopped fail-closed before any market-data write
- #142/#137 F0: separate approval boundary

## Current Production market-data checkpoint

Post-failure SELECT-only verification on 2026-09-02 JST:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

The original #179 frozen four remain unchanged:

- `rakuten-auc-toysanta-10386044` — 598 / active / 1 observation
- `rakuten-realize-store-2-10575349` — 898 / active / 1 observation
- `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
- `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation

All four deterministic R2 observation IDs remain absent. R2 market-data write delta is exactly 0.

## Production R2 schema state — migration is now applied

Repository migration file:

`supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql`

The approved SQL body was applied to Supabase Production project `vxbrnvfhmzcxehuuzzum` on 2026-09-02. Supabase migration tooling recorded:

- ledger version: `20260902073919`
- migration name: `r2_atomic_reobservation_canary`

The tool-generated ledger timestamp differs from the repository filename timestamp. Treat the reviewed SQL body + migration name + execution evidence as the linkage; do not falsely conclude the migration is absent merely because version `20260902150500` is not the ledger key.

Verified function state:

- `public.apply_market_reobservation_r2_canary_v1(jsonb)`: present
- `SECURITY INVOKER` (`security_definer=false`)
- empty `search_path`
- EXECUTE: PUBLIC=false, anon=false, authenticated=false, service_role=true

The function being installed does **not** authorize another invocation.

## #179 first approved execution attempt — fail closed

Human approval covered one exact execution scope: apply the reviewed migration, allow at most 12 exact provider HTTP attempts across the frozen four, and call the atomic RPC exactly once only if all four returned valid exact `seen` evidence. A separate #179-only disposable branch workflow using existing GitHub Secrets was also explicitly authorized.

Execution evidence:

- disposable branch: `ops/r2-one-shot-179-20260902`
- workflow commit: `2a263b4b3e8c5af2deb86c8d5d21b58c72a075ba`
- Actions run: `33605362604`
- exact-main / one-file branch guard: PASS
- first listing: `rakuten-auc-toysanta-10386044`
- provider result: `not_found`
- successful HTTP response path -> exactly **1 Rakuten HTTP attempt**, no retry
- remaining Rakuten target: 0 calls
- both Yahoo targets: 0 calls
- atomic RPC calls: **0**
- R2 Production market-data writes: **0**
- automatic/manual retry: **0**

The runner stopped immediately under the all-or-nothing contract.

## One-shot workflow cleanup

The temporary workflow `.github/workflows/r2-one-shot-179.yml` was deleted from the disposable branch in commit:

`cac883d9f74af9cad051a6fd853631f8a91ebc89`

Current disposable branch tree has **0 file differences** from main. Its two branch-only commits remain as audit history. Only one Actions run exists; workflow deletion triggered no second run. Nothing from that branch was merged to `main`.

## Approval state after the attempt

The #179 migration/provider/RPC approval and its approval token are **consumed**.

Do not:

- rerun run `33605362604`
- recreate or reuse the one-shot workflow under the old authorization
- reuse the old R2 approval token
- call the remaining three providers under the old envelope
- invoke the installed R2 RPC

Any further live provider request or Production market-data mutation requires a fresh frozen design and fresh explicit human approval.

## Exact next step

After Issue #185 canonical sync reaches `main`:

1. stay read-only;
2. investigate why the first Rakuten exact identity returned `not_found` without inferring `sold`/`sold_out`;
3. reselect/redesign the tiny R2 cohort using persisted evidence only, or decide whether the cohort/provider mix should change;
4. because the installed RPC hardcodes the original four listing IDs/key, prepare a reviewed new migration/function contract if the cohort changes;
5. validate repository/Preview/CI gates;
6. only then present a **new** exact provider + Production write approval request.

Do not proceed directly to R3/R4 while R2 history remains at 0 unless a newer explicit product decision changes priority.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` applied all nine repository migrations in disposable Supabase and then failed at that stale assertion. This debt remains a separate workflow-change task.

## Hard boundaries

- no further #179 provider/RPC execution without fresh approval
- no R3/R4 Production execution by implication
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix completed sold with active/sold_out evidence, or scrape Mercari/Amazon
