# Gacha Lens — Supabase Hardening Isolated Validation — 2026-09-04

## Outcome

Company-roadmap Stage 5 for Gacha Lens is **isolated-validation complete at the technical-evidence level**. This document records recommendations only and does **not** authorize Production execution.

Hard boundary maintained throughout:
- Production Supabase DDL/DML: **0**
- main merges: **0**
- Production deploys: **0**
- DNS / `gachalens.com` changes: **0**
- Vercel cancellation / Gacha Cloudflare Production changes: **0**
- Production secrets consumed/displayed by isolated CI: **0**
- paid Supabase development branches: **0**

Supabase hosted Branching was not created because the inspected organization cost was `$0.01344/hour`. The organization is on the Free plan. GitHub-hosted ephemeral runners + disposable local Supabase were sufficient for all rehearsals.

## Canonical identity

- Repository: `karakuri3/Gacha-Lens`
- Stage-5 main bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase: `ihcudkfspzuixsqsvoku` — never use as Production
- Stage-5 canonical Draft: PR #241 / `codex/supabase-hardening-isolated-gacha-20260904`
- Production remained unchanged during the lane.

## Final exact isolated evidence

| Draft | Candidate | Exact head | Isolated / Quality evidence |
| --- | --- | --- | --- |
| #241 | 13 server-only table grant normalization | `cf57582404023853738b19ba18c45a05fe56687e` | isolated `33855152896` SUCCESS; Code Quality `33855152742` SUCCESS |
| #242 | `pg_net` drop/recreate relocation | `5c5c4b063eacf7d9a852fda275cb565a8637b8d6` | isolated `33855189033` SUCCESS; Code Quality `33855189058` SUCCESS |
| #243 | unused `pg_graphql` disable | `2c787dc6a482feb978fab6b506f2a45d05fbe175` | isolated `33857636302` SUCCESS; Code Quality `33857636272` SUCCESS |
| #244 | explicit `server-only` boundary for ingestion service-role store | `3f96b259b162dab3657738b7415159733658c51e` | Code Quality `33854491517` SUCCESS |
| #245 | `market_listings(series_id)` index rehearsal | `c0c93f4af23d6a8cb476348ee7a5f4e4b11fc457` | isolated `33855753155` SUCCESS; Code Quality `33855753047` SUCCESS |
| #246 | future-object default-privilege hardening | `784f3740bd9adbf3894265749250eb555627d355` | isolated `33859987774` SUCCESS; Code Quality `33859987765` SUCCESS |

All six Gacha PRs remain **Draft / open / unmerged**. Review-thread count was rechecked as **0** across #241-#246.

## Final Production read-only evidence

### 1. Current server-only table grant drift

The following 13 Production tables are RLS-enabled with zero policies but currently have broad `anon` and `authenticated` table privileges:

- `community_reports`
- `forecast_snapshots`
- `import_issues`
- `ingestion_runs`
- `market_listing_observations`
- `market_listings`
- `outbound_clicks`
- `restock_events`
- `series`
- `source_weights`
- `stock_reports`
- `variants`
- `x_reactions`

This creates unnecessary API/GraphQL discoverability even though RLS/no-policy prevents browser rows. Current application data paths are server-side. The Foundation migration already expresses service-role-only intent for the original core set.

Four separate tables intentionally expose public reads and are excluded from blanket remediation:
- `series_lineup`
- `series_price_history`
- `series_restock_info`
- `series_stock_reports`

### 2. Deferred `forecast_snapshots`

`forecast_snapshots` exists in Production but is intentionally absent from the canonical fresh migration chain. Its Production shape was re-verified read-only and synthesized only inside disposable CI. Stage 5 does not authorize adding it to the canonical migration chain.

### 3. `pg_graphql`

Production has `pg_graphql` installed, while repository runtime search found no GraphQL client path and Production database search found no Gacha application-owned function dependency on `graphql.*`.

Draft #243 successfully rehearsed a plain non-CASCADE `DROP EXTENSION pg_graphql`, preserved representative anon+RLS and service-role application behavior, recreated the extension as rollback, dropped it again, then passed Foundation/data-source/lint/build regressions against disposable Supabase.

### 4. `pg_net`

Production read-only evidence:
- `pg_net` version `0.20.4`
- extension namespace recorded as `public`
- `extrelocatable = false`
- `net.http_request_queue = 0`
- recent `net._http_response = 0`
- `cron.job = 0`
- Gacha application-owned `net.*` database-function dependencies = 0 at inspection time

Draft #242 proved drop/recreate under `extensions`, rollback to the public placement, reverse, and reapply on disposable Supabase. No HTTP request was issued.

### 5. Service-role boundary

The canonical service-role client already imports `server-only`. `lib/data/ingestion-run-store.js` also reads the service-role key and was the remaining module without an explicit marker. Draft #244 adds only the marker + regression test; current consumer remains Node-only.

Existing sensitive writer RPCs were read-only checked and already deny PUBLIC/anon/authenticated while allowing service-role execution. `sync_market_observation_links()` is a trigger-returning, non-SECURITY-DEFINER trigger helper with pinned empty search_path; it is not treated as an authenticated RPC endpoint candidate.

### 6. Default privileges / future drift

Read-only Production inspection showed role `postgres`, schema `public` currently defaults new:
- tables broadly to `anon`, `authenticated`, `service_role`
- functions directly to those API roles
- sequences broadly to those API roles

PostgreSQL also has a hard-wired function default including `PUBLIC EXECUTE` when no object ACL overrides it.

Draft #246 proved two distinct scopes:

**Candidate A — schema-scoped future-object hardening**
- revoke automatic public-table CRUD defaults from `anon`, `authenticated`, `service_role`
- revoke direct public-function EXECUTE defaults from those API roles
- revoke public-sequence USAGE/SELECT defaults from those API roles
- existing intentional-public ACLs remain unchanged
- explicit service-role and intentional-public grants continue to work
- rollback restores the observed Production-style defaults

**Candidate B — global PUBLIC function default revoke**
- removing hard-wired PUBLIC EXECUTE requires role-global default-privilege change
- isolated proof showed that this affects future postgres-owned functions outside `public` as well, including `extensions`
- therefore it has a materially larger blast radius and is not bundled with Candidate A

Sensitive future functions must continue to use explicit per-function `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + explicit intended grants rather than relying on Candidate A alone.

### 7. Performance

Final advisor snapshot still reports six unindexed FKs:
- `community_reports.series_id`
- `forecast_snapshots.variant_id`
- `market_listings.series_id`
- `restock_events.series_id`
- `stock_reports.series_id`
- `x_reactions.series_id`

Five target tables are currently empty/nearly empty. `market_listings` has only about 141 rows.

The `market_listings.series_id` path is real and hot by call count. Final read-only `pg_stat_statements` evidence showed the dominant path at approximately:
- calls: **219,852**
- total execution: **52,841.92 ms**
- mean execution: **0.2404 ms**

Draft #245 proved that `market_listings_series_id_idx` is selected at a synthetic 100,000-row scale and that FK behavior survives create/drop/reapply. However current Production latency/scale does not justify immediate DDL solely to silence the advisor.

Unused-index advisor output remains informational only and does not authorize drops.

### 8. Egress

Issue #219 / shared Supabase Egress remains a separate reliability/cost lane. Stage-5 grant/extension/index hardening is not evidence that billed Egress has recovered.

## Final classification

| Item | Classification | Decision |
| --- | --- | --- |
| Revoke `anon` / `authenticated` privileges from the 13 server-only tables | **Production適用推奨** | Directly matches the server-only architecture; #241 reproduce/revoke/regression/rollback/reapply all PASS. |
| Blanket revoke from the 4 intentional-public `series_*` tables | **不要** | Would break the intentional public-read contract. |
| Add RLS policies to the 13 server-only tables merely to silence `RLS enabled/no policy` | **不要** | RLS + zero policy is the intended browser deny-all state once direct grants are removed. |
| #244 explicit `server-only` marker for `ingestion-run-store` | **Production適用推奨** | Low-risk code-only defense-in-depth; locks remaining service-role-key module to server context. |
| Disable unused `pg_graphql` | **Production適用推奨** | No app/DB dependency found; non-CASCADE drop + rollback + full application regressions PASS. |
| Simple `ALTER EXTENSION pg_net SET SCHEMA` | **不要** | Production reports `extrelocatable=false`; this is not a valid plan. |
| Drop/recreate `pg_net` under `extensions` | **保留** | Technically proven, but current usage/queue/cron/dependency evidence shows low urgency versus extension-recreation risk. |
| Schema-scoped future-object default hardening for `postgres/public` (Candidate A) | **Production適用推奨** | Prevents recurrence of broad direct Data API grants while leaving current objects unchanged; rollback proven. |
| Global future-function `PUBLIC EXECUTE` default revoke (Candidate B) | **保留** | Correctly removes implicit PUBLIC execution but affects future postgres-owned functions in every schema, including `extensions`; wider blast radius needs separate architecture decision. |
| Explicit per-function PUBLIC/API-role revoke for sensitive future functions | **Production適用推奨（migration standard）** | Required because Candidate A alone does not remove hard-wired PUBLIC EXECUTE. |
| `market_listings(series_id)` index | **保留** | Future-scale value proven, but current ~141-row table averages ~0.2404 ms on the dominant path. Re-evaluate when real latency/CPU/scale evidence changes. |
| Other five advisor FK indexes | **保留** | Current target tables are empty/nearly empty; no workload justification yet. |
| Drop advisor-unused indexes | **保留** | Zero-use counters alone are insufficient evidence. |
| Treat Stage-5 hardening as the Egress fix | **不要** | Egress is a separate P0 observation/mitigation lane. |

## Rollback contracts

### #244 service-role code boundary
Forward: add `import "server-only";` + regression test. Rollback: revert that code-only change. No database state is involved.

### #241 13-table grants
Forward: revoke browser/API-role privileges only from the 13 target server-only tables while preserving service-role access and intentional-public tables.

Emergency rollback: restore the exact pre-change `anon` / `authenticated` table privileges only on those 13 targets. Do not touch the four intentional-public tables. Reapply is the explicit targeted revoke.

### #246 Candidate A defaults
Forward: schema-scoped revoke of future `postgres/public` automatic table/function/sequence grants from API roles. Existing objects do not change.

Rollback: restore the observed Production-style schema defaults for those API roles. New objects created while the hardened defaults were active must be reviewed explicitly; changing defaults does not retroactively change existing objects.

Candidate B is not part of this forward/rollback set.

### #243 `pg_graphql`
Forward: after a fresh dependency preflight, plain `DROP EXTENSION pg_graphql` with **no CASCADE**. Any dependency failure is a stop condition.

Rollback: recreate `pg_graphql` using the same extension contract proven in #243, then verify API/application behavior. Re-run current advisors/dependency checks after either direction.

### `pg_net` hold candidate
If later approved, fresh queue/response/cron/dependency preflight is mandatory before drop/recreate. Reverse is recreate the prior public placement. A non-empty queue, active cron use, or new dependency cancels the change.

### Index hold candidates
Future index work needs current query-plan/latency/CPU evidence plus explicit create/drop rollback. No index DDL is authorized by Stage 5.

## Proposed Production application order — requires new approvals

Cross-company sequence after separate Production approvals:
1. Beach: apply the bounded `rebuild_profile_stats_v1` correctness fix and immediately postflight it.
2. Gacha: deploy #244 service-role server-only defense before narrowing database/API grants.
3. Gacha: apply #241 targeted 13-table browser/API-role grant normalization.
4. Re-run current application regressions + Supabase advisors.
5. Gacha: apply #246 Candidate A future-object defaults to prevent recurrence, while retaining explicit per-function PUBLIC/API-role revokes as the migration standard.
6. Gacha: after a fresh no-dependency preflight, disable unused `pg_graphql` via the non-CASCADE procedure proven in #243.
7. Re-run application regression + advisors again.
8. Keep `pg_net`, global PUBLIC function default revoke, FK indexes, and unused-index cleanup on HOLD until their specific new evidence gates are met.

Do not bundle these into one large migration. Each item has its own approval, rollback, and postflight boundary.

## Final completion / resume rule

Before Stage 5 is declared fully closed, the final canonical-docs head on Draft PR #241 must itself pass exact-head `Supabase Hardening Isolated` and PR Code Quality. That final run proves the checkpoint branch remains reproducible after documentation synchronization.

On a future thread:
1. read this file, `HANDOFF.md`, `STATUS.md`, `DECISIONS.md`, `TODO.md`;
2. re-fetch current main and all relevant PR heads before any action;
3. treat every Production recommendation above as **not authorized until a fresh explicit Production approval is obtained**;
4. keep Cloudflare runtime migration, Egress #219, and Beach R5-03C separate from this lane.
