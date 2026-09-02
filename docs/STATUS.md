# Gacha Lens Status

Updated: 2026-09-02 JST — post-R2 atomic prerequisite / #183 canonical-sync target

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #183 / PR #184.

- On open PR #184 / branch `docs/canonical-sync-post-r2-prereq-183`, finish its exact-head gates and merge/release flow first.
- On `main`, #183/#184 is complete by definition; proceed directly to the fresh SELECT-only #179 pre-execution gate. Do not create another docs-only PR merely to mark #184 complete.

## Repository / release checkpoint

- pre-sync main: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #172 R1: completed; Production DB writes 0
- #173/#176 Yahoo repair: completed and Production READY
- #177/#178 canonical sync: completed
- #180 R2 atomic persistence prerequisite: completed
- #182 final head: `7f9486d68c8923a57d70555dcd14b81516cdad06`
- #182 merge/main: `d80450626fd30768bb8f0af68340f0d2aea00bbb`
- #182 Production: `dpl_8oacYiC3Nia5RJbicgNxnr3TL3eW` READY
- #179 R2 Production execution canary: open and exact human approval-bound
- #142/#137 F0: separate approval boundary

## #182 prerequisite contract in repository

- exactly 4 frozen known listings, 2 Rakuten + 2 Yahoo
- shared key `reobs-v1:r2-20260902-01`
- deterministic observation IDs
- one PostgreSQL transaction for 4 observation inserts + 4 allowlisted listing snapshot updates
- exact identity/snapshot/one-prior-observation/import-issue checks
- only positive integer price and `active` / `sold_out`
- no completed `sold` / `sold_at`
- service-role-only RPC execution
- exact current-main/cohort approval binding
- dry-run provider/RPC/write count = 0
- max 3 attempts/listing / max 12 HTTP attempts total
- any unsafe provider result stops before RPC
- exactly one atomic RPC write call; no automatic write retry
- ambiguous commit resolver is SELECT-only and never auto-retries

#182 evidence:

- PR Code Quality `33600534520`: PASS
- Preview `dpl_6G9LxzpEZtgeQZ7JKV8BYBR9jeLK`: READY
- disposable Supabase `33600534418`: all 9 migrations applied before stale fixed 8-version assertion failed

## Fresh Production checkpoint

SELECT-only snapshot on 2026-09-02 JST:

- market listings: **113**
- observations: **113**
- listings with 2+ observations: **0**
- completed `status=sold`: **0**
- `status=sold_out`: **0**

Frozen #179 cohort remains:

- `rakuten-auc-toysanta-10386044` — 598 / active / 1 observation
- `rakuten-realize-store-2-10575349` — 898 / active / 1 observation
- `yahoo-lead-netstore-302507s186ook3` — 698 / active / 1 observation
- `yahoo-selen-shope-5500000224314` — 1500 / active / 1 observation

All four remain single/review-safe, matched variant identity, `sold_at=null`, complete provider/native/public identity, unresolved import issues 0.

## Critical Production schema state

- repository contains migration `20260902150500_r2_atomic_reobservation_canary.sql`
- Production migration ledger version `20260902150500`: **absent**
- Production `public.apply_market_reobservation_r2_canary_v1(jsonb)`: **absent**

#182 did not apply the R2 database function to Production.

## #184-specific review substitution

The human explicitly authorized **PR #184 only** to replace independent Reviewer + Verifier with:

- exact-head PR Code Quality
- exact-head Vercel Preview
- strengthened full-diff/canonical-consistency self-review

If those exact-head gates pass and the remaining Auto-Merge / Standing Production Release gates pass, #184 may merge and its normal Git-triggered Vercel Production deployment may proceed.

This exception does not apply to #179 Production migration/provider/write approval or any future PR.

## R2 #179 remains unapproved

Successful R2 target delta, only after fresh exact human approval and four valid exact provider reads:

- market listings +0
- observations +4
- re-observed listings +4
- completed `sold` +0
- deletes 0
- protected identity/provenance changes 0
- exactly 4 listing snapshot updates limited to price/status/last_observed_at/updated_at

The final #179 approval request must cover:

1. Production application of reviewed migration `20260902150500_r2_atomic_reobservation_canary.sql`;
2. fresh exact provider reads for the frozen four, max 3 attempts/listing and max 12 total;
3. only if all four are valid exact `seen`, exactly one atomic RPC write with the delta above.

Any unsafe provider result means Production data writes remain 0.

## Known CI harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the former eight migration versions. Run `33600534418` applied all nine migrations and then failed at that stale assertion. Workflow repair is separate and approval-bound.

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

- **On PR #184 branch:** re-run exact-head CI/Preview and strengthened self-review on the head containing this authorization record; merge only if Auto-Merge / Standing Production Release gates pass; verify normal Production READY.
- **On `main`:** re-fetch main/#179 and run a fresh SELECT-only R2 preflight; then present the exact combined #179 approval request and stop for explicit human approval.
