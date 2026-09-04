# Gacha Lens Durable Decisions

Updated: **2026-09-04 JST — company-roadmap Stage-5 Supabase hardening isolated validation finalized.**

Durable decisions D-001 through D-123 are preserved in `docs/history/2026-09-03-pre-233-DECISIONS.md` and remain authoritative unless explicitly superseded below.

## Stage-5 durable decisions

### D-124 — Stage-5 Supabase hardening is isolated-only and cannot borrow Production authority

Stage 5 may use read-only Production inspection plus disposable local Supabase CI. It may not mutate Production, merge to main, deploy Production, change DNS/Cloudflare/Vercel Production configuration, display secrets, or create paid Supabase resources without explicit applicable approval.

Cloudflare runtime migration, Egress #219, Beach R5-03C, and other release lanes remain separate.

### D-125 — Paid Supabase Development Branching is unnecessary for current hardening proof

The organization is on the Free plan and branch cost was inspected at `$0.01344/hour`. No hosted development branch was created. Disposable GitHub-hosted local Supabase proved sufficient for rehearsal, regression, rollback, and reapply.

### D-126 — Current server-only table grants are a real drift and should be normalized explicitly

Production read-only evidence found 13 RLS-enabled/zero-policy server-only tables with broad `anon` / `authenticated` privileges. Four separate `series_*` tables intentionally expose public reads.

Therefore:
- targeted revoke on the 13 server-only tables is **Production適用推奨**;
- blanket revoke from the four intentional-public tables is **不要**;
- adding RLS policies only to silence the zero-policy advisor is **不要**;
- current service-role access must remain explicit and regression-tested.

Draft #241 proved reproduce -> revoke -> service-role regression -> rollback -> reapply successfully.

### D-127 — `forecast_snapshots` Production drift is test-fixture evidence, not migration authorization

`forecast_snapshots` exists in Production but is intentionally absent from the canonical fresh migration chain. Its Production shape may be synthesized inside disposable CI only. Stage 5 does not authorize adding it to the canonical migration chain.

### D-128 — `pg_net` is a drop/recreate candidate, not a simple relocation

Production has `pg_net` 0.20.4 in public with `extrelocatable=false`. Simple `ALTER EXTENSION ... SET SCHEMA` is rejected.

Draft #242 successfully proved drop/recreate under `extensions`, rollback to public, reverse, and reapply. Despite technical success, Production relocation is **保留** because queue/recent-response/cron/application dependency evidence was zero and extension recreation carries more risk than current benefit.

A future approval requires a fresh queue/cron/dependency preflight; any new usage cancels the plan.

### D-129 — Unused `pg_graphql` should be disabled after a fresh dependency preflight

Repository runtime search and Production DB search found no Gacha GraphQL dependency. Draft #243 successfully used plain non-CASCADE `DROP EXTENSION pg_graphql`, preserved representative RLS/Data API/service-role behavior, rehearsed recreate rollback, reapplied the drop, and passed Foundation/data-source/lint/build regressions.

Therefore disabling `pg_graphql` is **Production適用推奨**, but only as an independent approval-bound change with a fresh dependency preflight. `CASCADE` remains prohibited for this procedure.

### D-130 — Service-role-bearing modules must be explicitly server-only

The canonical service-role client already uses `server-only`. `lib/data/ingestion-run-store.js` was the remaining service-role-key reader without the explicit marker; its consumer is Node-only.

Draft #244 adds the marker and regression test without changing DB behavior. This defense-in-depth change is **Production適用推奨** and should precede narrowing database/API grants.

### D-131 — `market_listings(series_id)` is a proven future-scale index, not a current Production necessity

Draft #245 proved the index is selected at synthetic 100,000-row scale, preserves FK behavior, and can be dropped/reapplied.

Final Production read-only evidence showed approximately 141 rows and a dominant series-id path of ~219,852 calls with ~0.2404 ms mean execution and ~52.8 seconds cumulative execution across the current stats window.

Therefore the index is **保留**. Re-evaluate when real Production row count, latency, DB CPU, or query-plan evidence materially changes. Do not add the other advisor FK indexes mechanically.

### D-132 — Advisor-unused indexes are not drop authorization

Zero-use counters alone are insufficient because stats windows reset and indexes may protect infrequent constraints/query paths. All current unused-index removals remain **保留** until sustained workload and dependency evidence supports a specific drop with rollback.

### D-133 — Default privileges must be split into schema-scoped API-role defaults and global PUBLIC function defaults

Read-only Production evidence shows `postgres/public` future objects are broadly granted to `anon`, `authenticated`, and `service_role`. PostgreSQL also has a hard-wired function default containing `PUBLIC EXECUTE` when no object ACL overrides it.

Draft #246 proved:

**Candidate A — schema-scoped future-object hardening**
- removes automatic table CRUD, direct function EXECUTE, and sequence USAGE/SELECT defaults for API roles in schema `public`;
- does not change existing objects;
- preserves explicit service-role/public allowlists;
- rollback restores the current Production-style defaults.

Candidate A is **Production適用推奨** because it prevents recurrence of direct broad Data API grants.

**Candidate B — global future-function PUBLIC default revoke**
- correctly removes implicit PUBLIC EXECUTE;
- also affects future postgres-owned functions in every schema, demonstrated with `extensions`.

Candidate B is **保留** because of its wider all-schema blast radius.

Sensitive functions must continue to use explicit per-function `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` plus intended grants. Candidate A alone does not make future functions private from PUBLIC.

### D-134 — Gacha and Beach privilege remediation must remain project-specific

Beach Production does not have the same postgres public-table default-grant shape as Gacha. Never mechanically copy Gacha default-ACL SQL into Beach.

Beach `session_permissions` zero-policy behavior and authenticated SECURITY DEFINER RPC allowlist are intentional reviewed contracts; blanket policy/RPC changes are rejected.

### D-135 — Beach leaked-password protection is a paid-plan-dependent hold, not an automatic Production action

Final advisor refresh reports leaked-password protection disabled. The shared Supabase organization is currently Free, and the feature is plan-dependent. Security value is acknowledged, but no paid upgrade or Auth setting change is authorized by Stage 5.

Classification: **保留（有償依存）** until a separate plan/cost/business decision and explicit Production Auth authorization.

## Final durable classification summary

Production適用推奨:
- #241 targeted 13-table grant normalization
- #244 explicit server-only service-role boundary
- #246 Candidate A schema-scoped future-object defaults
- explicit sensitive-function PUBLIC/API-role revokes as migration standard
- #243 unused pg_graphql disable
- Beach separate repo profile-stats constraint-target correctness fix

保留:
- #242 pg_net relocation
- #246 Candidate B global PUBLIC function default revoke
- #245 market-listings series index
- remaining FK indexes
- unused-index removals
- Beach leaked-password protection paid-plan dependency

不要:
- blanket revoke from intentional-public series tables
- RLS policies added only to silence server-only zero-policy info
- simple pg_net SET SCHEMA
- mechanical cross-project ACL normalization
- treating Stage-5 hardening as Egress resolution

## Current durable state

- main bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Gacha Stage-5 Drafts #241-#246 remain unmerged
- Production Supabase mutations under Stage 5: 0
- paid Supabase branch/plan change: 0
- final Stage-5 evidence: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`
- Production execution remains a separate approval-bound phase

## Canonical history

Pre-Stage-5 decisions: `docs/history/2026-09-03-pre-233-DECISIONS.md`.
