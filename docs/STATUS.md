# Gacha Lens Status

Updated: **2026-09-04 JST — company-roadmap Stage-5 Supabase hardening isolated validation finalized on Draft branches; Production mutations 0.**

The full pre-Stage-5 status is preserved at `docs/history/2026-09-03-pre-233-STATUS.md`. Fresh GitHub / Supabase / deployment evidence wins over this file.

## Company roadmap Stage 5 — final validation state

Canonical evidence: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.

Repository / Production bind:
- main bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- Stage-5 Gacha Drafts: #241-#246, all open/draft/unmerged
- Stage-5 Production Supabase DDL/DML: **0**
- Stage-5 Production deploy: **0**
- paid Supabase branch: **0**
- DNS / Cloudflare / Vercel Production changes by Stage 5: **0**

All Gacha isolated candidate branches reached successful exact technical evidence before final canonical sync:
- #241 grants: isolated `33855152896` + Code Quality `33855152742` SUCCESS
- #242 pg_net: isolated `33855189033` + Code Quality `33855189058` SUCCESS
- #243 pg_graphql: isolated `33857636302` + Code Quality `33857636272` SUCCESS
- #244 service-role boundary: Code Quality `33854491517` SUCCESS
- #245 index: isolated `33855753155` + Code Quality `33855753047` SUCCESS
- #246 default privileges: isolated `33859987774` + Code Quality `33859987765` SUCCESS

Review threads on #241-#246: 0 at final audit.

## Final classifications

### Production適用推奨
- #241: targeted revoke of `anon` / `authenticated` privileges from 13 server-only tables
- #244: explicit `server-only` marker for the ingestion service-role store
- #246 Candidate A: schema-scoped future-object default hardening for `postgres/public`
- migration standard: explicit per-function PUBLIC/API-role revoke + intended grant for sensitive functions
- #243: disable unused `pg_graphql` using plain non-CASCADE drop after fresh dependency preflight
- Beach separate repo: `rebuild_profile_stats_v1` constraint-target correctness fix

### 保留
- #242 `pg_net` relocation: isolated forward/rollback/reverse/reapply PASS, but current queue/recent-response/cron/app-dependency evidence is zero and the change requires extension recreation
- #246 Candidate B global PUBLIC function default revoke: future postgres-owned functions in every schema are affected, including `extensions`
- #245 `market_listings(series_id)` index: future-scale benefit proven; current Production has ~141 rows and dominant path mean is ~0.2404 ms across ~219,852 calls
- other five unindexed FK candidates
- all advisor-unused index drops
- Beach leaked-password protection: organization is Free; paid-plan dependency means no automatic enable/upgrade

### 不要
- blanket revoke from intentional-public `series_lineup`, `series_price_history`, `series_restock_info`, `series_stock_reports`
- add RLS policies to server-only zero-policy tables only to silence advisor output
- simple `ALTER EXTENSION pg_net SET SCHEMA` (`extrelocatable=false`)
- mechanical Gacha default-ACL remediation on Beach
- treating Stage-5 hardening as the Egress #219 fix

## Final advisor state — read-only 2026-09-04

Gacha security categories remain the known set:
- 13 server-only tables: RLS enabled / no policy INFO
- GraphQL table visibility driven by broad table SELECT grants, including four intentional-public tables
- `pg_net` installed in public schema warning

Gacha performance categories remain:
- six unindexed FK notices
- unused-index INFO notices

No new unrelated security/performance category appeared in the final advisor refresh.

## Current P0 outside Stage 5 — Egress #219

The shared Supabase Egress reliability/cost issue remains a separate lane. Pre-Stage-5 authenticated billing evidence showed uncached Egress materially above the Free allocation with Fair Use risk. P0-A sitemap mitigation is released, but billed-byte recovery remains an observation gate.

Stage 5 does not close #219 and must not be cited as proof of Egress recovery.

## Beach cross-repo status

Beach Draft #216 final docs-sync head `95d092551893207ebeaf9e34c3ed44a2c6c5e6a3` passed isolated run `33859304627`: database rehearsal, authenticated runtime/idempotency, anon denial, old-defect rollback reproduction, reapply, Unit, Lint, Build, cleanup all SUCCESS.

The normal Beach Quality Gate continued to fail/cancel at `npm audit` because the npm advisory endpoint returned HTTP 503/network timeout. The repository gate was not weakened; source quality was proven separately in the isolated workflow. Beach Production remained unchanged.

## Stage-5 close gate

Only one internal validation step remains after this docs synchronization: require the final canonical-docs head on PR #241 to pass exact-head `Supabase Hardening Isolated` + PR Code Quality and confirm main bind has not drifted. No merge or Production application is part of that close gate.
