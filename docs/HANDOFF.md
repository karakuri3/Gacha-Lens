# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — Foundation CI repair #221 complete / R4 repository repair #218 technically green / Issue #222 canonical sync

This file is the current operational handoff. The complete checkpoint that existed immediately before #222 is preserved byte-for-byte at `docs/history/2026-09-03-pre-222-HANDOFF.md`. Older pre-#215 history remains reachable from that snapshot.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, PR #218, Issue #217, recent Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Do not duplicate completed/failed R1/R2/R3/R4/history canaries merely to refresh context.
4. Production DB mutation/migration/schema/backfill/reset/cleanup, approval-bound provider execution, workflow dispatch, Secrets/Variables changes, paid/destructive actions, direct main pushes, and ineligible merges/releases require applicable approval.
5. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Canonical main after #221: `26a0db02fc842484d5a5cd55703deffdf3f8ba55`
- #221 `CI: allow later migrations after reviewed Foundation prefix`: **MERGED** squash to that main; Issue #220 closed.
- Vercel Production for `26a0db0...`: `dpl_GhJQEfAMv6nQvWz6WztDQiS1ARDL` — **READY**
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production.
- Preferred local path: `C:\dev\Gacha-Lens`
- Incidental unused branch `tmp-should-not-create` was created during connector routing. It points at the then-current main, is not part of any task, and has no Production effect. Do not delete it automatically unless a separate cleanup policy/approval permits branch cleanup.

## Current Production checkpoint — SELECT-only 2026-09-03

Latest read-only verification after #218 repository validation:
- market listings: **127**
- observations: **149**
- re-observed listings: **22**
- repeated-history rate: **22/127 = 17.3228%**
- completed/sold: **0**
- R4 candidate `yahoo-suruga-ya-601199451001`: **absent**
- R4 deterministic observation `market-depth-r4-924833906c89effa6b6e67c9b76409dc`: **absent**
- installed R4 broken source-ID guard occurrences: **exactly 1**
- installed R4 function remains SECURITY INVOKER with empty `search_path`

Therefore no repository/CI work performed after #214 changed Production market data or repaired the Production R4 function.

## #214 remains terminal fail-closed evidence

The reviewed historical migration `20260903033000_market_depth_r4_atomic_v1.sql` was applied once to Production under #214 authority. The one authorized R4 write invocation then failed synchronously before inserts with PostgreSQL `2201B invalid regular expression: invalid repetition count(s)` because SQL used `^[A-Za-z0-9:._-]{1,300}$`.

Post-failure SELECT proved zero target writes and a non-ambiguous failure. #214 authority is consumed/non-reusable. **Never retry #214 or invoke the currently installed defective Production R4 function.**

Full #214 identities/evidence remain in `docs/history/2026-09-03-pre-222-HANDOFF.md` and its referenced pre-#215 snapshot.

## Foundation CI repair — #220 / #221 complete

PR #218 exposed a pre-existing CI-governance defect after its migrations began succeeding: `.github/workflows/foundation-baseline.yml` required the complete migration list to equal the original eight July Foundation migrations.

#221 repaired only that CI contract:
- the original eight reviewed versions remain an exact immutable prefix;
- later reviewed migrations are allowed after that prefix;
- fixed Supabase CLI `2.109.1`, disposable local stack, `db reset --local --no-seed`, guaranteed cleanup, and no-linked/no-push rails remain unchanged;
- focused workflow-contract tests were added.

#221 exact-head Code Quality, Foundation baseline, Preview, lint and build all passed; normal Vercel Production release is READY.

## PR #218 — repository R4 runtime repair

Open Draft PR: **#218 `P0 Data Scale: repair R4 Postgres validator runtime path`**
- closes Issue #217 when merged
- branch: `fix/r4-postgres-validator-runtime-proof-217`
- exact verified head after non-destructive main merge: `80d1f5c59e73ee4ab59024ce7e3232713a4d2523`
- base main: `26a0db02fc842484d5a5cd55703deffdf3f8ba55`
- PR diff remains exactly **5 R4 repair/test files**, 483 additions, 0 deletions

Repository repair contents:
1. `20260903183500_market_observation_trigger_schema_qualification.sql`
   - reads installed `sync_market_observation_links()` definition;
   - requires the historical `update market_listing_observations` reference exactly once;
   - rewrites only that reference to `update public.market_listing_observations`;
   - does not drop/recreate the trigger;
   - reasserts SECURITY INVOKER and empty `search_path`.
2. `20260903183530_market_observation_service_role_contract.sql`
   - restores `service_role` CRUD on `public.market_listing_observations` in a fresh migration chain;
   - Production already has this server-side privilege contract;
   - does **not** grant anon/authenticated/PUBLIC.
3. `20260903183600_market_depth_r4_postgres_regex_repair.sql`
   - leaves already-applied historical migration immutable;
   - requires the defective guard exactly once in the installed function definition;
   - replaces it with explicit length `1..300` plus PostgreSQL-safe `^[A-Za-z0-9:._-]+$` allowlist;
   - reasserts SECURITY INVOKER, empty `search_path`, PUBLIC/anon/authenticated EXECUTE revoke, service_role EXECUTE grant;
   - contains a real controlled service-role function invocation proof inside a rollback subtransaction;
   - asserts exact insert/result/depth behavior and zero residue;
   - proves 301-character and disallowed-character IDs fail as normal `market_depth_r4_invalid_candidate` rather than regex-runtime errors.
4. Focused static tests lock the trigger, validator, security surface, runtime proof, and service-role grant contract.

## #218 exact-head verification — ALL TECHNICAL GATES GREEN

For head `80d1f5c...`:
- PR Code Quality run #107: **SUCCESS**
- Vercel Preview `dpl_3YT76geWyqSbVkFy5uapePMXpFsh`: **READY**
- Foundation baseline run #112: **SUCCESS end-to-end**
  - fixed CLI: success
  - disposable Supabase start: success
  - `db reset --local --no-seed`: success
  - all 15 migrations, including real service-role R4 runtime proof: success
  - original eight Foundation migration prefix: success
  - final catalog assertions: success
  - transactional FK/rollback smoke: success
  - Foundation static tests: success
  - data-source tests: success
  - lint: success
  - build: success
  - disposable cleanup: success
- full five-file Lead self-review found no new blocking technical defect
- unresolved GitHub review threads: 0 at this checkpoint

No Production DB mutation, provider call, workflow dispatch, Secrets/Variables change, or R4 write retry occurred during this verification.

## Current true gate — independent review

#218 remains **Draft intentionally**. It changes callable schema/write-path migration logic, so green CI is not sufficient by itself under the repository review contract.

Required next sequence:
1. Re-fetch #218 exact head/main and ensure no new drift.
2. Obtain an **independent Reviewer + Verifier if available**.
3. If no independent reviewer is available, stop and obtain a **fresh #218-specific human substitution**. Do not reuse the one-time #208 or #180/#182 substitutions.
4. Repair any blocking finding and rerun exact-head gates.
5. Merge only the reviewed exact head when the applicable merge/release policy passes.
6. Repository merge does **not** repair Supabase Production.

A potential independent reviewer is Vercel Agent Code Review, but current Vercel Agent usage can be billed on demand. It was **not invoked** because paid operations require explicit approval. Do not silently trigger `@vercel` review if it would incur paid usage.

## After #218 merge — still separate Production boundaries

Even after repository merge:
1. fresh SELECT-only Production inspection;
2. exact reviewed repair migration identity;
3. **fresh explicit approval for Production repair migration**;
4. apply repair once only if approved and verify security/runtime/data-delta0;
5. re-fetch current main/Production target state and rebuild the R4 manifest/digest;
6. **separate fresh exact one-candidate R4 write approval**;
7. save durable resolution manifest before any write;
8. invoke exactly once if approved; no automatic retry; ambiguity -> SELECT-only resolver.

Production repair migration approval never implies candidate persistence approval.

## Approval / execution state

Consumed/non-reusable include:
- all R1/R2 execution approvals
- first and successful #201 bounded-history approvals
- #206 R3 provider/workflow approval
- #208 review substitution
- #211 history provider/RPC/workflow approval
- #214 R4 migration + one-write approval
- one-time #180/#182 review substitution (unrelated; never reuse for #218)

Not authorized now:
- current Production R4 function invocation
- Production R4 repair migration
- R4 candidate persistence/retry
- new provider calls
- another history write
- workflow dispatch
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

Immediate pre-#222 checkpoint:
- `docs/history/2026-09-03-pre-222-HANDOFF.md`

That snapshot retains links to the complete pre-#215 history for older run IDs, approvals, R1/R2/#201/#206/#208 details, and the full #214 failure record.

Do not create a recursive canonical sync merely to record #222's own docs-only merge.