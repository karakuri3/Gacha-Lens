# Gacha Lens Status

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #183 / PR #184.

- If read from open PR #184 / branch `docs/canonical-sync-post-r2-prereq-183`, #184 is still the current docs-only merge gate.
- If read from `main`, #183/#184 is complete by definition; the next step is the fresh SELECT-only #179 pre-execution gate. Do not create another docs-only PR merely to mark #184 complete.

## Repository / release checkpoint

- repo: `karakuri3/Gacha-Lens`
- pre-sync main: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #172 R1 read-only canary: completed; Production DB writes 0
- #173/#176 Yahoo exact JSONP repair: completed and Production READY
- #177/#178 post-Yahoo canonical sync: completed
- #180 R2 atomic persistence prerequisite: completed
- #182 final head: `7f9486d68c8923a57d70555dcd14b81516cdad06`
- #182 merge/main: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #182 Production deployment: `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` — READY with canonical aliases
- #179 R2 Production execution canary: open and exact human approval-bound
- #142/#137 F0 repair: separate human/Production-impact boundary

For #180/#182 only, the human allowed exact-head CI + Vercel Preview + disposable-Supabase migration proof + strengthened self-review to replace independent Reviewer/Verifier. That exception is finished and non-transferable.

## #182 prerequisite contract now in repository

The R2 path is deliberately narrow:

- exactly four frozen known listings, 2 Rakuten + 2 Yahoo
- shared key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- one PostgreSQL transaction for 4 observation inserts + 4 allowlisted listing snapshot updates
- exact identity/snapshot/one-prior-observation/import-issue checks
- only positive integer price and `active` / `sold_out`
- no completed `sold` / `sold_at`
- service-role-only RPC execution
- exact current-main/cohort approval binding
- dry-run provider/RPC/write count = 0
- max 3 attempts/listing / max 12 HTTP attempts total in canary-write
- any unsafe provider result stops before RPC
- exactly one atomic RPC write call; no automatic write retry
- ambiguous commit resolver is SELECT-only and never auto-retries

Exact-head #182 evidence:

- PR Code Quality `33600534520`: PASS
- Vercel Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase Foundation `33600534418`: all 9 migrations applied successfully before the stale fixed 8-version assertion failed

## Fresh Production data checkpoint

SELECT-only snapshot on 2026-09-02 JST after #182 merge:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

Frozen #179 cohort:

- `rakuten-auc-toysanta-10386044` — 598 / active / 1 observation
- `rakuten-realize-store-2-10575349` — 898 / active / 1 observation
- `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
- `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation

All four remain single/review-safe marketplace rows with matched variant identity, `sold_at=null`, complete provider/native/public identity, and unresolved import issues 0.

## Critical Production schema state

- repository contains migration `20260902150500_r2_atomic_reobservation_canary.sql`
- Production migration ledger version `20260902150500`: **absent**
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)`: **absent**

Therefore #182 merge/release did **not** apply the R2 database function to Production.

## R2 #179 remains unapproved

Successful R2 target delta, only after fresh exact human approval and four valid exact provider reads:

- market listings: +0
- observations: +4
- re-observed listings: +4
- completed `sold`: +0
- deletes: 0
- protected identity/provenance changes: 0
- exactly 4 listing snapshot updates limited to price/status/last_observed_at/updated_at

The final #179 approval request must cover all three actions together:

1. Production application of reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql`;
2. fresh exact provider reads for the frozen four, max 3 attempts/listing and absolute max 12 HTTP attempts;
3. only if all four are valid exact `seen`, exactly one atomic RPC write with the delta above.

Any not_found/throttle/provider_error/identity mismatch/malformed/invalid-price/invalid-availability result means Production data writes remain 0.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` applied all nine migrations and then failed at that stale assertion.

- not an R2 disposable-migration failure
- do not silently repair inside #184/#179
- workflow repair is a separate approval-bound task

## Hard boundaries

- no R2 Production migration/function application without fresh exact #179 approval
- no R2 live provider calls without fresh exact #179 approval
- no R2 Production data write without fresh exact #179 approval
- no further Yahoo calls under exhausted #172 approval
- do not merge #142 or dispatch F0 without separate approval
- do not change Production-capable workflows/schedules or dispatch them without applicable approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not weaken matcher, mix sold/current evidence, or scrape Mercari/Amazon

## Exact next step

- **If read from PR #184 branch:** finish #184 exact-head CI/Preview + normal independent Reviewer/Verifier, then merge only if Auto-Merge / Standing Production Release gates pass.
- **If read from `main`:** re-fetch main/#179 and run a fresh SELECT-only R2 preflight; verify the same four rows, deterministic IDs, migration/function state and global baseline; then present the exact combined #179 approval request and stop for explicit human approval.
