# Gacha Lens Durable Decisions

Updated: 2026-09-03 JST — #218 R4 repository repair merged / Issue #224 canonical sync

The complete durable-decisions checkpoint immediately before #224 is preserved byte-for-byte at `docs/history/2026-09-03-pre-224-DECISIONS.md`. Decisions D-001 through D-102 remain authoritative unless explicitly superseded below.

## Authoritative additions

### D-103 — #218-only human review substitution is consumed and cannot cross boundaries

For PR #218 only, the user explicitly authorized replacing the otherwise-required independent Reviewer/Verifier with exact-head CI, exact-head Vercel Preview, disposable Supabase runtime proof, and strengthened Lead self-review through merge.

The substitution was bound to exact head `10864b7cf62aeb91ff7fa96d9e5277930cb06a38`, recorded in the PR, and consumed when #218 squash-merged to main `51f868b57571e0f25955ca91a1c8faff1e86c335`.

It cannot be reused for:
- another PR;
- Production migration approval;
- R4 candidate persistence;
- provider calls;
- F0/#142;
- paid/destructive work;
- any future independent-review gate.

### D-104 — Repository repair merge and Supabase Production repair remain distinct states

PR #218 is merged and Vercel Production is READY, but post-merge SELECT-only verification proves Supabase Production has **not** applied the three merged repair migrations.

Current Production remains:
- 127 listings;
- 149 observations;
- 22 re-observed listings;
- sold/completed 0;
- R4 candidate rows 0;
- deterministic R4 observation rows 0;
- installed broken R4 source-ID guard occurrences 1;
- repository repair migrations applied: false.

Therefore a Git/Vercel release is not evidence that the Production database function is repaired.

### D-105 — The Production R4 repair migration set is one fresh explicit approval boundary

The reviewed repository repair set is:
1. `20260903183500_market_observation_trigger_schema_qualification.sql`
2. `20260903183530_market_observation_service_role_contract.sql`
3. `20260903183600_market_depth_r4_postgres_regex_repair.sql`

Applying this set to Production requires a fresh explicit human approval after re-fetching current main and live Production function/ledger/data state.

If approved, apply the reviewed set exactly once through the normal migration mechanism and verify:
- migration ledger identity;
- trigger-function schema qualification;
- service_role server-only table contract without widening client privileges;
- SECURITY INVOKER / empty search_path / service_role-only EXECUTE;
- PostgreSQL-safe validator state;
- market-data delta0 from the repair itself.

Do not edit already-applied historical migration identity or manually repair ledger timestamps.

### D-106 — Production repair approval never authorizes R4 candidate persistence

Even after the Production repair is successfully applied and verified, the candidate write remains a separate later boundary.

Before a new candidate write:
1. re-fetch current main and live Scoreboard;
2. re-read target catalog/review/depth state;
3. prove unresolved issues and all identity/URL/listing/observation collisions remain zero;
4. determine whether historical R3 evidence is still valid without silently refreshing provider data;
5. rebuild the complete frozen R4 manifest/digest against current state;
6. obtain a new explicit one-candidate write approval;
7. save a durable resolution manifest before the single invocation;
8. never automatically retry; ambiguous commit state uses SELECT-only resolution.

### D-107 — #218 repository repair is the new source of truth, while #214 remains terminal failure history

The merged main now contains the reviewed trigger qualification, fresh service-role contract normalization, PostgreSQL validator repair, and disposable runtime proof. Future repository work must preserve these contracts.

#214 remains terminal evidence for its consumed authorization: the old Production function failed synchronously before inserts with PostgreSQL 2201B, with independent zero-write proof. Do not reinterpret #218 merge as retroactively making #214 successful.

## Current durable state

- canonical main: `51f868b57571e0f25955ca91a1c8faff1e86c335`
- #218 merged; Issue #217 closed
- Vercel Production for current main: READY
- final #218 exact-head Code Quality #109 / Foundation #113 / Preview: all SUCCESS/READY
- #218-only review substitution: consumed/non-reusable
- Production market state: **127 / 149 / 22 / sold0**
- Production R4 function: still original runtime-defective/quarantined version
- merged Production repair migrations: not applied
- next true gate: explicit Production repair migration-set approval
- #214 authority: consumed/non-reusable

## Approval state

Consumed/non-reusable includes all previously recorded R1/R2/#201/#206/#208/#211 approvals, #214 R4 migration/write authority, the one-time #180/#182 substitution, and the #218-only review substitution.

Not authorized now:
- Production R4 repair migration set
- current Production R4 function invocation
- R4 candidate write/retry
- provider calls under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- paid reviewer/action without approval
- destructive actions

## Hard durable constraints

- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not manually alter Supabase migration ledger identity/timestamps
- do not weaken strict market matching or identity guards for coverage
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
- repository merge and Vercel READY never imply Supabase Production authority
- direct main pushes remain prohibited

## Canonical history

Immediate pre-#224 decisions snapshot:

`docs/history/2026-09-03-pre-224-DECISIONS.md`

Do not create a recursive canonical sync merely to record #224's own docs-only merge.