# Infrastructure / Security Audit Findings — 2026-09-03

## Fixed now

- Vercel docs-only builds are skipped.
- Skip logic compares against `VERCEL_GIT_PREVIOUS_SHA` instead of only `HEAD^`, preventing a multi-commit push from hiding earlier code changes.
- Remote pushes should be batched at reviewable validation checkpoints to avoid AI-driven build churn.
- Alternative-host migration must run in parallel before any `gachalens.com` DNS cutover.

## Verified findings requiring staged Production work

### Supabase GraphQL discovery surface
Repository search found no GraphQL client usage. Supabase advisors report many public tables discoverable through pg_graphql grants. Before changing Production grants or disabling GraphQL, verify the complete runtime/API contract and rehearse on an isolated environment. Do not revoke access blindly because some public data may intentionally be served through Supabase REST/RLS.

### pg_net extension placement
Supabase reports `pg_net` installed in the `public` schema. Treat this as a hardening opportunity, not an emergency. Rehearse any extension move before Production because extension ownership/schema changes can affect database functions or scheduled behavior.

### Missing foreign-key indexes
Supabase performance advisor reports uncovered FKs on `community_reports.series_id`, `forecast_snapshots.variant_id`, `market_listings.series_id`, `restock_events.series_id`, `stock_reports.series_id`, and `x_reactions.series_id`. Add only after confirming query plans/workload and migration cost. Do not remove currently unused indexes solely from advisor output.

## Production-change rule

Security/performance advisor output is evidence, not an instruction to mutate Production immediately. Any DDL/grant/extension change requires dependency inspection, migration rehearsal, exact validation, and rollback planning.
