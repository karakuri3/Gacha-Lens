# Supabase Hardening Isolated Validation — 2026-09-04

## Scope and hard boundary

This document is the canonical checkpoint for company-roadmap Stage 5: **Supabase hardening isolated validation**.

This lane is intentionally separate from the Gacha Lens Cloudflare Workers runtime migration.

Forbidden in this lane:
- Production Supabase DDL/DML;
- merge to `main`;
- Production deploy;
- DNS / `gachalens.com` changes;
- Vercel cancellation;
- Gacha Cloudflare Production configuration changes;
- secret display;
- paid Supabase branch creation without explicit approval.

As of this checkpoint, all forbidden-action counts are **0**.

## Environment decision

Supabase Development Branching is not free for this organization at the inspected price (`$0.01344/hour`). No remote development branch was created.

The approved isolated substitute is a GitHub-hosted ephemeral runner with a disposable local Supabase stack, exact PR-head checkout, no Production credentials, no GitHub Secrets, and guaranteed local cleanup.

## Production read-only evidence

### Server-only table / GraphQL grant drift

The following 13 Production tables are RLS-enabled with zero policies but have broad `anon` / `authenticated` table grants and are therefore discoverable through the Supabase API/GraphQL permission surface:

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

Current application data paths are server-side and use the `server-only` service-role client. Repository search found no application GraphQL client usage.

Four separate Production tables have intentional public read policies and must NOT be swept into a blanket revoke:

- `series_lineup`
- `series_price_history`
- `series_restock_info`
- `series_stock_reports`

The public-schema default ACL grants new tables/functions broadly to Supabase API roles. Do not globally rewrite default privileges in this lane; normalize server-only objects explicitly instead.

### Deferred Production object

`forecast_snapshots` exists in Production but is intentionally absent from the canonical fresh migration chain. Its Production shape was re-verified read-only and matches the legacy source description:

- `id uuid primary key default gen_random_uuid()`
- `variant_id text not null -> variants(id) on delete cascade`
- integer columns `total`, `complete`, `ace`, `compatibility`, `limited`, `preorder`, `x`
- `breakdown jsonb not null default '{}'`
- `calculated_at timestamptz not null default now()`
- RLS enabled, zero policy

Isolated rehearsal may synthesize only this deferred object in the disposable database. It must not be added to the canonical migration chain by implication.

### `pg_net`

Production read-only inspection:
- version `0.20.4`;
- extension namespace recorded as `public`;
- `extrelocatable = false`;
- `net.http_request_queue = 0` at inspection time;
- recent `net._http_response = 0` at inspection time;
- `cron.job = 0`;
- no application-owned database function was found referencing `net.*`.

A simple `ALTER EXTENSION pg_net SET SCHEMA ...` is therefore not the selected candidate. Supabase documentation/troubleshooting describes drop/recreate under `extensions` as the path to test when dependencies permit it.

### Performance advisor

Unindexed FKs currently reported:
- `community_reports.series_id`
- `forecast_snapshots.variant_id`
- `market_listings.series_id`
- `restock_events.series_id`
- `stock_reports.series_id`
- `x_reactions.series_id`

Production scale at inspection time:
- `community_reports`: ~0 rows
- `forecast_snapshots`: ~0 rows
- `market_listings`: ~141 rows, ~384 KiB total relation size
- `restock_events`: ~0 rows
- `stock_reports`: ~0 rows
- `x_reactions`: ~0 rows

`market_listings.series_id` currently plans as a sequential scan for a representative equality predicate. Existing workload analysis ranks that path materially above `community_reports.series_id` and `forecast_snapshots.variant_id`, but current Production scale is still tiny. Do not add all six indexes mechanically.

Unused-index advisor output is informational only and does not authorize drops.

### Egress

Supabase Egress issue #219 is a separate reliability/cost lane. The prior sitemap mitigation is live, and the true gate is read-only post-release Egress observation. No hardening item in this document may be described as having solved Egress without billing/traffic evidence.

## Isolated workstreams

### Draft PR #241 — server-only grants / GraphQL visibility boundary

Branch: `codex/supabase-hardening-isolated-gacha-20260904`

Goal:
1. fresh disposable Supabase + all repository migrations;
2. synthesize only the deferred `forecast_snapshots` Production shape locally;
3. reproduce broad Production-like API grants on the 13 server-only targets;
4. apply the isolated revoke candidate;
5. verify `anon` / `authenticated` table privileges are removed;
6. verify `service_role` CRUD remains;
7. statically and dynamically protect intentional-public tables;
8. run service-role CRUD in a transaction with zero residue;
9. restore Production-like grants as rollback rehearsal;
10. reapply hardening and re-verify.

Run #1 proved exact checkout, isolation contract, local stack startup, and complete fresh `db reset`, then correctly stopped because `forecast_snapshots` is deferred from the fresh chain.

The branch now contains the verified disposable-only `forecast_snapshots` fixture. Exact-head run #2 is the current gate.

### Draft PR #242 — `pg_net` relocation rehearsal

Branch: `codex/supabase-pg-net-isolated-20260904`

Goal:
1. reproduce Production-like `pg_net` public/non-relocatable placement locally;
2. transactionally drop/recreate under `extensions`;
3. verify required `net.http_get` / `net.http_post` catalog functions;
4. rollback and prove original placement restoration;
5. apply relocation in disposable DB;
6. prove no queued HTTP request and no application-owned `net.*` function dependency;
7. rehearse reverse procedure back to `public`;
8. reapply desired isolated state.

No HTTP request is intentionally issued.

## Current classification — pending final exact-head evidence

| Item | Current classification | Reason |
| --- | --- | --- |
| Revoke `anon` / `authenticated` privileges from the 13 server-only Gacha tables | **Production適用推奨候補** | Matches current server-only application boundary and removes unintended GraphQL/API discovery; final isolated run pending. |
| Revoke public access from the 4 intentional-public policy tables | **不要** | Would contradict current public-data contract. |
| Add RLS policies to the 13 server-only tables merely to silence `rls_enabled_no_policy` | **不要** | RLS + zero policy is the intended deny-all browser boundary once direct grants are removed. |
| Globally change `public` default ACL | **保留** | Could break future intentional public objects; explicit object grants are safer. |
| Change the service-role application boundary | **不要** | Current `server-only` boundary is intentional and should be preserved. |
| Simple `ALTER EXTENSION pg_net SET SCHEMA` | **不要** | Production reports `extrelocatable=false`. |
| Drop/recreate `pg_net` under `extensions` | **保留** | Dedicated isolated PR #242 must prove relocation + rollback first. |
| Add all six advisor FK indexes | **保留** | Current tables are tiny/empty and workload value differs by FK. |
| `market_listings(series_id)` index | **保留（優先評価）** | Actual query path exists, but current table is tiny; benchmark/growth threshold evidence should precede Production DDL. |
| Drop advisor-reported unused indexes | **保留** | Advisor zero-use counters alone are insufficient evidence. |
| Treat hardening as Egress fix | **不要** | Egress is a separate P0 observation lane. |

## Rollback contracts

### Server-only grant hardening
Emergency rollback is explicit per-table restoration of the pre-change grants for exactly the affected target set. Intentional-public tables are not part of either forward or reverse set. Reapply is the explicit revoke candidate.

### `pg_net`
If isolated proof succeeds, forward procedure is drop extension + remove leftover `net` schema if necessary + recreate `pg_net` under `extensions`. Reverse procedure recreates the original public extension placement. Production execution would require a fresh dependency/queue/cron preflight and backup/recovery gate; isolated success alone does not authorize Production.

### Index additions
A future index addition must have a matching explicit `DROP INDEX` rollback, lock/build strategy, and query-plan evidence. No index DDL is authorized by this checkpoint.

## Proposed Production order after isolated validation

1. Beach independent `rebuild_profile_stats_v1` runtime bug fix, once its own isolated regression/rollback is green.
2. Gacha 13-table server-only grant normalization, if #241 is fully green.
3. Re-run Supabase security advisors and application regression after grant normalization.
4. Auth leaked-password protection for Beach as a separate Auth control-plane change, with its own approval/verification.
5. `pg_net` relocation only if #242 proves forward + rollback and a fresh Production dependency preflight remains clean.
6. Performance indexes one-by-one only when workload/scale evidence crosses a useful threshold.
7. Unused-index cleanup last, and only with sustained usage evidence.

## Resume point

On a new thread, start here:
1. fetch exact current heads and CI for Gacha Draft PR #241 and #242;
2. never merge either PR under this validation task;
3. if #241 fails, inspect the isolated rehearsal job only and repair the Draft branch;
4. if #242 fails, inspect whether failure proves a dependency/extension constraint; do not weaken the test to force green;
5. fetch Beach Draft PR #216 separately for the profile-stats candidate;
6. update this document with final run IDs, exact SHAs, final classifications, and Production rollback gates.
