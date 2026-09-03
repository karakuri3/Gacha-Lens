# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — PR #218 R4 repository repair merged / Issue #224 canonical sync

This is the current operational handoff. The complete checkpoint immediately before #224 is preserved byte-for-byte at `docs/history/2026-09-03-pre-224-HANDOFF.md`; that snapshot links to earlier pre-#222 and pre-#215 history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, recent Issues/PRs/Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Do not repeat completed or failed R1/R2/R3/R4/history canaries merely to refresh context.
4. Production DB mutation/migration/schema/backfill/reset/cleanup, approval-bound provider execution, workflow dispatch/change, Secrets/Variables changes, paid/destructive actions, direct main pushes, and ineligible merges/releases require applicable explicit approval.
5. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Canonical main after #218 merge: `51f868b57571e0f25955ca91a1c8faff1e86c335`
- PR #218: **MERGED** by squash; Issue #217: **CLOSED completed**
- Vercel Production for `51f868b...`: `dpl_6Gdzgr85kAi6CNCwbnoKKfP5b4sn` — **READY**
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`
- Incidental unused branch `tmp-should-not-create` remains unrelated and harmless; do not delete automatically without an applicable cleanup policy/approval.

## PR #218 final repository evidence

Final reviewed/substituted exact head before merge:
- `10864b7cf62aeb91ff7fa96d9e5277930cb06a38`
- base main at final gate: `4e566880502e7d601803f94000087d1c77cea021`
- diff: exactly 5 R4 repair/test files, +483 / -0

Final exact-head gates:
- PR Code Quality #109: **SUCCESS**
- Foundation baseline #113: **SUCCESS end-to-end**
- exact-head Vercel Preview `dpl_5WncNPgN6VbwF8LnwhpMQ9ZupAkZ`: **READY**
- GitHub unresolved review threads: 0
- Vercel unresolved toolbar threads: 0
- main drift at merge gate: 0

Foundation #113 proved on a fresh disposable Supabase:
- fixed Supabase CLI 2.109.1
- all 15 repository migrations apply successfully
- real `service_role` invocation of repaired R4 function succeeds
- exact listing/observation/depth assertions succeed
- runtime proof fixtures roll back with zero residue
- invalid length and disallowed-character source IDs fail closed as ordinary candidate validation
- original eight Foundation migration prefix remains exact
- final catalog, FK rollback smoke, Foundation static tests, data-source tests, lint, build and cleanup all succeed

## #218-only review substitution — consumed and non-reusable

The user explicitly authorized **for PR #218 only** replacing the otherwise-required independent Reviewer/Verifier with:
- exact-head CI,
- exact-head Vercel Preview,
- disposable Supabase runtime proof,
- strengthened Lead self-review,
through merge.

That authority was recorded on #218 and consumed by the squash merge to main `51f868b...`. It must never be reused for another PR, Production migration, R4 write, or unrelated review gate.

## Repository repair now on main

Merged main contains three new repair migrations plus focused tests:

1. `20260903183500_market_observation_trigger_schema_qualification.sql`
   - rewrites exactly one installed trigger-function relation reference from `market_listing_observations` to `public.market_listing_observations`;
   - does not recreate the trigger;
   - reasserts SECURITY INVOKER and empty `search_path`.
2. `20260903183530_market_observation_service_role_contract.sql`
   - grants only `service_role` SELECT/INSERT/UPDATE/DELETE on `public.market_listing_observations` for fresh-chain parity;
   - does not grant anon/authenticated/PUBLIC.
3. `20260903183600_market_depth_r4_postgres_regex_repair.sql`
   - leaves the already-applied historical R4 migration immutable;
   - replaces the unsupported `{1,300}` PostgreSQL regex bound with explicit length 1..300 plus `^[A-Za-z0-9:._-]+$`;
   - reasserts SECURITY INVOKER, empty search_path, PUBLIC/anon/authenticated EXECUTE revoke and service_role EXECUTE;
   - contains the transactional service-role runtime proof with rollback/zero-residue checks.

Repository merge does **not** apply these migrations to Supabase Production.

## Current Production checkpoint — SELECT-only after #218 merge

Latest post-merge read-only verification:
- market listings: **127**
- observations: **149**
- re-observed listings: **22**
- repeated-history rate: **17.3228%**
- completed/sold: **0**
- R4 candidate `yahoo-suruga-ya-601199451001`: **0 rows**
- deterministic observation `market-depth-r4-924833906c89effa6b6e67c9b76409dc`: **0 rows**
- installed Production R4 broken guard occurrences: **1**
- repository repair migrations applied in Production ledger: **false**

Therefore Production still runs the original runtime-defective/quarantined R4 function. The repository is repaired; Supabase Production is not.

## #214 remains terminal fail-closed evidence

The historical R4 migration was applied once under #214, then the single authorized candidate write failed synchronously before inserts with PostgreSQL `2201B invalid regular expression: invalid repetition count(s)`. Independent SELECT proved zero target writes and non-ambiguous failure.

#214 authority is consumed/non-reusable. Never retry #214 or invoke the currently installed defective Production R4 function before the reviewed repair reaches Production under a new approval.

## Current true gate — Production repair migration approval

The next major action is **not authorized yet**.

Before any Production repair:
1. Re-fetch current main and Production function/ledger/data state.
2. Confirm exact merged repair identities:
   - `20260903183500_market_observation_trigger_schema_qualification.sql`
   - `20260903183530_market_observation_service_role_contract.sql`
   - `20260903183600_market_depth_r4_postgres_regex_repair.sql`
3. Request fresh explicit human approval for the **Production R4 repair migration set only**.
4. If approved, apply exactly once through the reviewed migration mechanism.
5. Verify ledger/security/trigger qualification/validator state and market-data delta0.
6. Force canonical sync after that Production repair milestone.

A Production repair approval does **not** authorize candidate persistence.

## Separate later R4 candidate boundary

Only after Production repair is applied and verified:
1. re-fetch current main and live Scoreboard;
2. re-read target variant/series/depth/issues/collisions;
3. confirm historical R3 evidence remains valid or stop without silently refreshing provider data;
4. rebuild the complete R4 manifest/digest against current state;
5. request a **separate fresh exact one-candidate R4 write approval**;
6. save durable resolution manifest before write;
7. invoke exactly once if approved; no automatic retry; ambiguous commit -> SELECT-only resolver.

## Approval / execution state

Consumed/non-reusable includes all previously recorded R1/R2/#201/#206/#208/#211 approvals, #214 R4 migration/write authority, the one-time #180/#182 substitution, and the new **#218-only review substitution**.

Not authorized now:
- current Production R4 function invocation
- Production R4 repair migration set
- R4 candidate persistence/retry
- provider calls under consumed authority
- another history write by implication
- workflow dispatch/change
- Secrets/Variables changes
- F0/#142
- paid reviewer/action without approval
- destructive work

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching/identity guards for coverage.
- Keep completed sold evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- Do not infer merchant equivalence from display names.
- Do not invoke historical RPCs merely because functions exist.
- No direct push to `main`.
- #137/#142 remains a separate F0 Production-impact boundary.

## Canonical history

Immediate pre-#224 checkpoint:
- `docs/history/2026-09-03-pre-224-HANDOFF.md`

Do not create a recursive canonical sync merely to record #224's own docs-only merge.