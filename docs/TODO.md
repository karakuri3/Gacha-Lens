# Gacha Lens Ordered TODO

Updated: **2026-09-04 JST — Stage-5 Supabase hardening isolated validation completed technically; final canonical-head CI remains the close gate.**

The complete pre-Stage-5 ordered TODO is preserved at `docs/history/2026-09-03-pre-233-TODO.md`.

## Stage 5 — Supabase hardening isolated validation

Canonical evidence: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.

### Gacha current-table/API boundary
- [x] re-fetch Production security/performance advisors read-only
- [x] prove 13 target tables are RLS-enabled / zero-policy with broad API-role grants
- [x] prove 4 `series_*` tables are intentional public-read objects and exclude them
- [x] prove current application data access is server-side/service-role
- [x] create free disposable isolated environment with no Production credentials
- [x] synthesize deferred `forecast_snapshots` only inside disposable CI
- [x] #241 reproduce -> targeted revoke -> service-role regression -> rollback -> reapply PASS
- [x] #241 exact technical isolated run `33855152896` SUCCESS
- [x] #241 Code Quality `33855152742` SUCCESS
- [x] classify targeted 13-table normalization **Production適用推奨**

### `pg_net`
- [x] verify Production version/public placement/non-relocatable state
- [x] verify queue0 / recent-response0 / cron0 / application-owned DB dependency0 at inspection time
- [x] #242 forward relocation / rollback / reverse / reapply PASS
- [x] isolated `33855189033` + Code Quality `33855189058` SUCCESS
- [x] classify simple `ALTER EXTENSION ... SET SCHEMA` **不要**
- [x] classify drop/recreate relocation **保留** despite technical PASS because current benefit is low versus extension-recreation risk

### `pg_graphql`
- [x] verify no Gacha GraphQL client runtime path
- [x] verify Production application-owned DB graphql dependency0
- [x] #243 plain non-CASCADE drop / RLS+Data API regression / service-role regression / recreate rollback / reapply PASS
- [x] Foundation/data-source/lint/build PASS
- [x] isolated `33857636302` + Code Quality `33857636272` SUCCESS
- [x] classify unused `pg_graphql` disable **Production適用推奨** after a fresh dependency preflight

### Service-role boundary
- [x] identify `lib/data/ingestion-run-store.js` as remaining service-role-key reader without explicit `server-only`
- [x] verify current consumer is Node-only
- [x] #244 add marker + regression test
- [x] Code Quality `33854491517` SUCCESS
- [x] classify #244 **Production適用推奨**

### Performance indexes
- [x] re-fetch six unindexed-FK advisor notices
- [x] identify `market_listings(series_id)` as the only candidate with material current call volume
- [x] #245 prove index planner use at synthetic 100k rows
- [x] prove FK behavior, drop rollback, reapply
- [x] isolated `33855753155` + Code Quality `33855753047` SUCCESS
- [x] final Production read-only dominant path: ~219,852 calls / ~52,841.92 ms total / ~0.2404 ms mean / table ~141 rows
- [x] classify `market_listings(series_id)` **保留** until real latency/CPU/scale evidence changes
- [x] classify other five FK indexes **保留**
- [x] keep unused-index removals **保留** absent sustained workload evidence

### Future-object default privileges
- [x] re-fetch exact Production `pg_default_acl`
- [x] distinguish schema-scoped direct API-role defaults from PostgreSQL hard-wired PUBLIC function default
- [x] #246 Candidate A: remove future direct table/function/sequence defaults for API roles in `public`
- [x] prove explicit service-role/public grants still work and intentional-public ACLs are unchanged
- [x] prove rollback to Production-style defaults
- [x] prove Candidate B global PUBLIC revoke affects future postgres-owned functions outside `public`, including `extensions`
- [x] isolated `33859987774` + Code Quality `33859987765` SUCCESS
- [x] classify Candidate A **Production適用推奨**
- [x] classify Candidate B **保留** due all-schema blast radius
- [x] lock explicit sensitive-function PUBLIC/API-role revokes as the migration standard

### Beach cross-repo verification
- [x] final Beach Draft #216 docs-sync head `95d092551893207ebeaf9e34c3ed44a2c6c5e6a3`
- [x] isolated `33859304627` SUCCESS including DB rehearsal/runtime/rollback/reapply/Unit/Lint/Build/cleanup
- [x] profile-stats constraint-target fix classified **Production適用推奨**
- [x] blanket SECURITY DEFINER revoke **不要**
- [x] `session_permissions` browser policy **不要**
- [x] three advisor-unused indexes **保留**
- [x] leaked-password protection **保留（有償依存）** because organization is Free; no paid upgrade authorized
- [x] record npm audit 503/network timeout separately without weakening Quality Gate

### Canonical / safety closeout
- [x] final classifications recorded as **Production適用推奨 / 保留 / 不要**
- [x] rollback contracts recorded
- [x] Production preflight/application order recorded
- [x] `SUPABASE_HARDENING_ISOLATED_2026-09-04.md` synchronized
- [x] `HANDOFF.md` synchronized
- [x] `STATUS.md` synchronized
- [x] `DECISIONS.md` synchronized
- [x] `TODO.md` synchronized
- [x] Production Supabase changes remain 0
- [x] main merges remain 0
- [x] Production deploys remain 0
- [x] paid branch/plan changes remain 0
- [ ] require final canonical-docs PR #241 head to pass exact-head `Supabase Hardening Isolated` + PR Code Quality
- [ ] confirm Gacha main still equals Stage-5 bind immediately before declaring validation complete
- [ ] confirm PR #241-#246 + Beach #216 remain unmerged/draft/open at close

## Production execution queue — NOT AUTHORIZED

After future separate approvals, proposed order:
1. Beach profile-stats minimal correctness fix + immediate postflight.
2. Gacha #244 server-only code boundary.
3. Gacha #241 targeted current-table grant normalization.
4. application regression + Supabase advisor rerun.
5. Gacha #246 Candidate A future-object defaults; retain explicit sensitive-function revoke/grant contracts.
6. fresh no-dependency preflight -> Gacha #243 non-CASCADE pg_graphql disable.
7. application regression + advisor rerun.
8. keep pg_net, global PUBLIC default revoke, indexes, and unused-index cleanup on HOLD until their evidence gates change.

Do not bundle these changes and do not interpret Stage-5 completion as Production approval.

## Separate company lanes

- Issue #219 Egress reliability/cost remains separate and open until read-only observation proves recovery.
- Cloudflare Workers runtime migration remains separate.
- PR #240 public-read-cache experiments remain separate.
- #137/#142 F0 remains separate.
- Beach R5-03C remains separate.

## Permanent holds

- DO NOT apply Stage-5 changes to Production without a fresh explicit approval
- DO NOT merge #241-#246 as part of closing Stage 5
- DO NOT create paid Supabase resources by implication
- DO NOT mutate workflows/Secrets/Variables by implication
- DO NOT touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no direct main push
- do not weaken identity/matching guards
- do not scrape Mercari or Amazon

## Canonical history

Pre-Stage-5 TODO: `docs/history/2026-09-03-pre-233-TODO.md`.
