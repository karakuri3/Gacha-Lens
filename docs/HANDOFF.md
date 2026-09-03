# Gacha Lens Canonical Handoff

Updated: 2026-09-03 JST — Production R4 repair migration applied and verified / Issue #226 canonical sync

This is the current operational handoff. The complete checkpoint immediately before #226 is preserved byte-for-byte at `docs/history/2026-09-03-pre-226-HANDOFF.md`; that snapshot links to pre-#224, pre-#222 and older history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/PRODUCTION_HISTORY_DEPTH_ROLLOUT_PLAN.md`, `docs/DATA_SCALE_SCOREBOARD.md`, `docs/DATA_SOURCE_CAPABILITY_MATRIX.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, recent Issues/PRs/Actions, Vercel, and only the live Production evidence needed for the next decision.
3. Do not repeat completed/failed R1/R2/R3/R4/history canaries merely to refresh context.
4. Production data writes, new migrations/schema/backfills, provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, direct main pushes, and ineligible merges/releases require applicable explicit approval.
5. After each major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Repository / services

- Repository: `karakuri3/Gacha-Lens`
- Runtime main used for the Production repair: `b41382d3f8470edc68133a27d50892c016ea095f`
- PR #218: **MERGED**; Issue #217: **CLOSED**
- PR #225 / Issue #224: docs-only post-merge canonical sync complete before this Production repair
- Production: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Old inactive Supabase: `ihcudkfspzuixsqsvoku` — never confuse with Production
- Preferred local path: `C:\dev\Gacha-Lens`

## Production R4 repair — COMPLETE

Fresh human authorization allowed only the three reviewed Production repair migrations. No candidate persistence was authorized.

Applied through Supabase migration mechanism, in reviewed order:
1. `20260903111455 market_observation_trigger_schema_qualification`
   - repository source: `20260903183500_market_observation_trigger_schema_qualification.sql`
2. `20260903111513 market_observation_service_role_contract`
   - repository source: `20260903183530_market_observation_service_role_contract.sql`
3. `20260903111600 market_depth_r4_postgres_regex_repair`
   - repository source: `20260903183600_market_depth_r4_postgres_regex_repair.sql`

Post-application verification:
- market listings: **127 -> 127**
- observations: **149 -> 149**
- re-observed listings: **22 -> 22**
- completed/sold: **0 -> 0**
- R4 target candidate rows: **0**
- deterministic R4 observation rows: **0**
- runtime-proof series/variant/listing/observation residue: **0**
- broken `{1,300}` source-ID guard occurrences: **1 -> 0**
- explicit source-ID length `1..300` guard: **present**
- PostgreSQL-safe `^[A-Za-z0-9:._-]+$` allowlist: **present**
- unqualified trigger relation occurrences: **1 -> 0**
- qualified `public.market_listing_observations` trigger relation: **present**
- R4 function: **SECURITY INVOKER**
- R4 function `search_path`: **empty**
- R4 EXECUTE: PUBLIC=false / anon=false / authenticated=false / service_role=true
- `service_role` CRUD on `public.market_listing_observations`: **true**

The third migration executed the real R4 success path under `service_role` inside its reviewed PL/pgSQL exception subtransaction, asserted result/depth behavior, rolled all fixture writes back, and also proved invalid length and invalid character failures. Independent post-migration SELECT confirmed zero residue and market-data delta0.

## Supabase advisor note

Security and performance advisors were run after the DDL change. No new R4 callable-surface defect was found. Existing project-wide advisory debt remains, including RLS-enabled/no-policy INFO notices and GraphQL schema visibility warnings caused by existing `anon`/`authenticated` SELECT grants, plus performance notices such as unindexed foreign keys / unused indexes.

Those were **not changed** under this repair-only authorization. Treat any access-model cleanup as a separate reviewed security task. Current Supabase guidance distinguishes table grants from RLS and now increasingly requires explicit grants for Data API exposure; do not change existing client access casually.

## Consumed approval

The Production R4 repair migration authorization is **consumed/non-reusable**. It authorized only this migration set and its verification.

It did **not** authorize:
- R4 candidate persistence or retry;
- provider refresh;
- another history write;
- workflow dispatch/change;
- Secrets/Variables changes;
- F0/#142;
- unrelated Production security/access changes.

## Current true gate — fresh R4 candidate rebind

Production function repair is complete. The next phase is read-only preparation for a possible single R4 candidate write:
1. re-fetch exact current main;
2. recompute current Data Scale Scoreboard;
3. re-read target variant/series/review/depth state;
4. re-read current listing IDs and collision state;
5. prove unresolved target issues0 and deterministic observation collision0;
6. determine whether historical R3 evidence remains valid; do not silently refresh provider data;
7. rebuild a complete frozen R4 manifest/digest against current Production;
8. save durable resolution evidence;
9. request a **fresh exact one-candidate Production write approval**.

No candidate write is authorized now. If later approved, invoke exactly once. Never automatically retry; ambiguous commit state must be resolved SELECT-only.

## Historical boundaries

- #214 remains terminal fail-closed evidence for the old defective function and its consumed authority.
- #218 repository repair and its one-time Reviewer/Verifier substitution are consumed/non-reusable.
- Production repair now supersedes the previous quarantine state, but does not retroactively make #214 successful.

## Hard no-regression boundaries

- NEVER touch `supabase/.temp/cli-latest`.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- No automatic RPC retry.
- Do not manually repair Supabase migration ledger timestamps.
- Do not weaken strict market matching/identity guards for coverage.
- Keep completed sold evidence separate from active/sold_out asking-price evidence.
- Do not scrape Mercari or Amazon.
- Do not infer merchant equivalence from display names.
- No direct push to `main`.
- #137/#142 remains a separate F0 Production-impact boundary.

## Canonical history

Immediate pre-#226 checkpoint:
- `docs/history/2026-09-03-pre-226-HANDOFF.md`

Do not create a recursive canonical sync merely to record #226's own docs-only merge.