# Gacha Lens Status

Updated: 2026-09-03 JST — reusable bounded re-observation repository prerequisite / Issue #199 canonical sync

This is the compact operational companion to `docs/HANDOFF.md`. Re-fetch live state before acting.

## Self-referential sync status

This file is authored by Issue #199.

- On branch `docs/canonical-sync-post-bounded-prereq-199` or its open PR, finish this docs-only exact-head validation/release flow first.
- Once this content reaches `main`, Issue #199 is complete by definition; do not create a recursive docs sync merely to mark its own merge.
- After #199 is on `main`, resume Issue #119 with read-only cohort planning for the reusable bounded lane. Generic Production migration/provider/RPC execution still requires fresh explicit approval.

## Current repository checkpoint

- pre-#199 canonical main: `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`
- #196 reusable bounded re-observation repository prerequisite: **completed**
- Draft PR #197: closed unmerged only because Draft->Ready connector mutation failed before state change
- replacement PR #198: byte-identical head/base, non-Draft, passed replacement gates and squash-merged
- #198 frozen implementation head: `c6372d9f3a1857a2d18302c1a4118cf685e13ece`
- #198 squash merge: `9c74d243b5a8f43b49dc7fa649b4c4043bb4a82c`
- Issue #196: closed completed
- #142/#137 F0: separate human approval boundary

#198 repository-gate evidence:

- PR Code Quality `33655012819`: SUCCESS
- exact-head Preview `dpl_8Pc5xkekW6iM53XNXu2p4j1y4fz3`: READY and attached/reused by #198
- Foundation `33655012798`: all 11 repository migrations applied successfully; known stale expected-8 assertion then failed
- review threads: 0
- base drift at merge: 0
- changed files: exactly 7 new bounded-lane files; existing R2 v1/v2 and workflows unchanged

The one-task #196/#197 review substitution was consumed by the byte-identical #198 repository merge. It does not authorize Production execution.

## Production checkpoint after #198 merge

Fresh connected Supabase SELECT-only verification:

- market listings: **113**
- observations: **117**
- listings with 2+ observations: **4**
- completed sold: **0**
- `public.apply_market_reobservation_bounded_v1(jsonb)`: **absent**
- Production ledger `market_reobservation_bounded_v1`: **absent**

Therefore repository merge != Production schema application.

## Reusable bounded v1 repository capability

Repository migration:

`supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql`

Future RPC name:

`public.apply_market_reobservation_bounded_v1(jsonb)`

Key properties:

- explicit 1..10 listing cohort
- Yahoo + Rakuten exact persisted identities
- exact-main/cohort digest + distinct approval namespace `APPROVE_MARKET_REOBSERVATION_BOUNDED_V1`
- prior observation count >=1 frozen and verified
- dry-run DB SELECT only; provider/RPC/write 0
- future write mode max 3 attempts/listing / max30 total
- serial provider reads with current provider pacing
- all-safe-or-no-RPC
- exactly one atomic RPC after all plans safe
- deterministic observation IDs recomputed in SQL
- pre-RPC sanitized resolver manifest mandatory
- exact target/RPC result identity-set verification
- canonical URL identity and persisted DB URL/raw identity checked separately
- listing/observation/import-issue race protections
- target invariants exact; global scoreboard deltas concurrency-tolerant minimums
- no completed `sold` / no `sold_at`
- SECURITY INVOKER, empty search_path, service_role-only EXECUTE
- no automatic RPC retry; ambiguous resolver SELECT-only

Production application of this capability is **not authorized**.

## R2 successful Production evidence

Yahoo-only R2 v2 remains terminal historical proof:

- Actions `33621881117`: SUCCESS
- Yahoo attempts: **4 total / 1 each / retries 0**
- all four outcomes `unchanged`
- exactly one atomic v2 RPC
- Production 113/113/0 -> **113/117/4** for listings/observations/re-observed
- completed sold remained **0**
- all four deterministic rows exist; each target exactly two observations
- one-shot workflow removed immediately; branch final file diff 0; run count 1; never merged

R2 execution/workflow approvals are consumed and must not be reused.

Original v1 R2 attempt remains historical fail-closed evidence:

- Actions `33605362604`
- first Rakuten target final `not_found`; exact attempt count unobservable but bounded 1-3
- remaining three target calls 0
- RPC 0; market-data writes 0; no retry

Production R2 schema state:

- v1 ledger `20260902073919` / `r2_atomic_reobservation_canary`
- v2 ledger `20260902095120` / `r2_yahoo_only_reobservation_canary_v2`
- both functions remain installed service_role-only / SECURITY INVOKER / empty search_path
- do not reapply or invoke them merely because they exist

## Data Scale interpretation

Current history coverage = **4 / 113 ~= 3.54%**.

Current Scoreboard still treats history as `history_not_enabled` below 10%. If the denominator remains 113, at least 12 re-observed listings are needed; +8 truthful first re-observations crosses that first threshold.

The reusable bounded lane was built specifically so the next history expansion is not another hardcoded canary.

## Exact next step after #199 reaches main

Read-only first:

1. re-fetch current main and Production;
2. SELECT-only shortlist 8-10 safe existing listings for a first generic bounded batch;
3. require exact identity, review-safe state, no unresolved import issue, `sold_at=null`, positive price, and frozen prior observation count;
4. prioritize provider evidence quality rather than cosmetic Yahoo/Rakuten symmetry;
5. freeze observation key, snapshots, deterministic IDs, cohort digest against current main;
6. use generic dry-run only if practical; provider/RPC/write must remain 0;
7. request a new exact human approval for Production migration + bounded provider envelope + exactly one RPC only if all plans safe;
8. workflow/credential mechanism remains a separate boundary unless explicitly included.

## Known Foundation harness debt

`.github/workflows/foundation-baseline.yml` still hardcodes the original eight migration versions.

- #182: 9 applied before expected-8 failure
- #188: 10 applied before expected-8 failure
- #197/#198: 11 applied before expected-8 failure

This is known workflow debt, not migration failure. Repair is separately approval-bound.

## Current approval state

Consumed/non-reusable:

- #172 Yahoo continuation
- original #179/v1 provider/write approval/token and one-shot workflow authorization
- #188 review substitution
- Yahoo-only R2 v2 Production execution approval and one-shot workflow authorization
- #196/#197 review substitution consumed by #198 repository merge

Not authorized now:

- generic bounded v1 Production migration/function application
- new Yahoo/Rakuten live provider reads for generic execution
- generic RPC/data write
- workflow creation/change/dispatch for generic execution
- R3/R4
- F0/#142 merge/dispatch
- Secrets/Variables changes
- paid/destructive actions

## Hard boundaries

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- do not rerun R2 without completely new task-specific approval
- do not reapply completed R2 migrations
- do not weaken strict marketplace matching for coverage
- do not mix completed sold evidence with active/sold_out asking-price evidence
- do not scrape Mercari or Amazon
- no direct push to `main`
