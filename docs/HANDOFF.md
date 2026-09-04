# Gacha Lens Canonical Handoff

Updated: **2026-09-04 JST — company-roadmap Stage-5 Supabase hardening isolated validation finalized on Draft PRs; Production changes 0.**

The complete pre-Stage-5 checkpoint is preserved at `docs/history/2026-09-03-pre-233-HANDOFF.md`. Fresh GitHub / Supabase / deployment evidence always wins over this file.

## Resume order

For a thread assigned **Supabase hardening isolated検証**:
1. `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`
2. this file
3. `docs/STATUS.md`
4. `docs/DECISIONS.md`
5. `docs/TODO.md`
6. `docs/INFRA_AUDIT_FINDINGS_2026-09-03.md`
7. `AGENTS.md` / `docs/AGENT_OS.md`

For a general **Gacha Lens続けて** thread, also read the existing product/data/release policy docs named by the pre-Stage-5 checkpoint.

## Current identity

- Repository: `karakuri3/Gacha-Lens`
- Stage-5 main bind: `da506232472c22c909f95e5a855b1cfed8889e73`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase: `ihcudkfspzuixsqsvoku`
- Production domain: `https://gachalens.com`
- Stage-5 canonical Draft: PR #241
- all Gacha Stage-5 PRs #241-#246: **Draft / open / unmerged**
- Production Supabase mutations under Stage 5: **0**
- Production deploys under Stage 5: **0**
- paid Supabase branch: **0**

## Stage-5 exact evidence

- #241 13-table grant rehearsal head `cf57582404023853738b19ba18c45a05fe56687e`: isolated `33855152896` SUCCESS; Code Quality `33855152742` SUCCESS.
- #242 `pg_net` relocation head `5c5c4b063eacf7d9a852fda275cb565a8637b8d6`: isolated `33855189033` SUCCESS; Code Quality `33855189058` SUCCESS.
- #243 `pg_graphql` disable head `2c787dc6a482feb978fab6b506f2a45d05fbe175`: isolated `33857636302` SUCCESS; Code Quality `33857636272` SUCCESS.
- #244 service-role boundary head `3f96b259b162dab3657738b7415159733658c51e`: Code Quality `33854491517` SUCCESS.
- #245 market-listings index head `c0c93f4af23d6a8cb476348ee7a5f4e4b11fc457`: isolated `33855753155` SUCCESS; Code Quality `33855753047` SUCCESS.
- #246 default-privilege hardening head `784f3740bd9adbf3894265749250eb555627d355`: isolated `33859987774` SUCCESS; Code Quality `33859987765` SUCCESS.
- review threads on #241-#246: **0** at final audit.

Beach is a separate repository. Beach Draft #216 final docs-sync head `95d092551893207ebeaf9e34c3ed44a2c6c5e6a3` passed isolated workflow `33859304627` including DB rehearsal, runtime, rollback/reapply, Unit, Lint, Build, cleanup. The normal Quality Gate hit npm advisory endpoint network failures and is recorded separately; it was not weakened.

## Final Stage-5 recommendations

### Production適用推奨
- targeted revoke of `anon` / `authenticated` privileges from the 13 Gacha server-only tables (#241)
- explicit `server-only` marker for `lib/data/ingestion-run-store.js` (#244)
- schema-scoped future-object default hardening for role `postgres` in schema `public` (#246 Candidate A)
- explicit per-function PUBLIC/API-role revoke as the migration standard for sensitive future functions
- disable unused `pg_graphql` with the non-CASCADE preflight/rollback procedure proven in #243
- Beach: `rebuild_profile_stats_v1` constraint-target correctness fix, in its own repository/approval lane

### 保留
- `pg_net` drop/recreate relocation despite successful isolated proof: low current usage/urgency versus extension-recreation risk
- global future-function PUBLIC default revoke: all-schema blast radius including future `extensions` functions
- `market_listings(series_id)` index: real hot call count but current ~141-row table averages ~0.2404 ms on dominant path
- other five unindexed FK candidates
- advisor-unused index removals
- Beach leaked-password protection: security-beneficial but current Supabase organization is Free and the feature is paid-plan dependent; no plan upgrade is authorized

### 不要
- blanket revoke from the four intentional-public `series_*` tables
- adding RLS policies to the 13 server-only tables merely to silence `RLS enabled/no policy`
- simple `ALTER EXTENSION pg_net SET SCHEMA` because Production reports `extrelocatable=false`
- treating Stage-5 hardening as proof that Egress #219 is solved
- mechanical Gacha default-ACL changes on Beach; the projects have different current privilege states

Full evidence/rollback/order: `docs/SUPABASE_HARDENING_ISOLATED_2026-09-04.md`.

## Production application order — NOT AUTHORIZED BY THIS FILE

After future independent approvals:
1. Beach profile-stats minimal correctness fix + immediate postflight.
2. Gacha #244 server-only code boundary.
3. Gacha #241 targeted current-table grant normalization.
4. application regression + Supabase advisor rerun.
5. Gacha #246 Candidate A future-object defaults; keep explicit sensitive-function revokes.
6. fresh dependency preflight, then Gacha #243 non-CASCADE `pg_graphql` disable.
7. application regression + advisor rerun.
8. leave `pg_net`, global PUBLIC default revoke, index additions/removals on HOLD until new evidence supports them.

Do not bundle these into one change window by implication.

## Separate active lanes — do not conflate

- Cloudflare Workers runtime migration remains completely separate.
- Supabase Egress #219 remains separate and is not solved by Stage 5.
- PR #240 P0 public-read-cache experiments remain separate.
- Beach R5-03C remains separate and requires its own compatibility-soak/Production authorization.
- #137/#142 F0 remains separate.
- PR #232 technology-intelligence work remains separate.

## Hard boundaries

- no Production DB/schema/data/Auth mutation without fresh explicit authorization
- no direct push to main
- no Production-impacting merge/deploy by implication
- no Secrets/Variables or workflow mutation by implication
- no paid/destructive action without approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not weaken strict market identity/matching guards
- do not scrape Mercari or Amazon

## Stage-5 close gate

The final canonical-docs head on Draft PR #241 must itself pass exact-head `Supabase Hardening Isolated` and PR Code Quality. Once that is green and main has not drifted, Stage 5 may be declared **validation complete** while all Production changes remain unapplied.
