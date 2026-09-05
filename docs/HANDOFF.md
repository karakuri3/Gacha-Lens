# Gacha Lens Canonical Handoff

Updated: 2026-09-06 JST — Supabase Egress P0-B is live in Production; final post-release Usage evidence pending

The company infrastructure Final Release/Cutover remains complete. The pre-final-cutover checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-HANDOFF.md` and in Git history.

## Resume protocol

If a fresh thread receives only **「Gacha Lens続けて」**:

1. Read this file plus `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `docs/FINAL_CUTOVER_2026-09-05.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/AUTO_MERGE_POLICY.md`, and `docs/PRODUCTION_RELEASE_POLICY.md`.
2. Re-fetch current `main`, Issues #219/#238/#239, recent PRs, Cloudflare Production state, and the minimum Supabase evidence needed for the next gate.
3. **Do not resume the company infrastructure migration. It is complete.** Cloudflare is the Production runtime and authoritative DNS.
4. The current blocking lane is Issue #219 Supabase Egress. PR #249 is already merged and live; do not recreate or re-run the P0-B implementation unless new evidence shows a defect.
5. Issue #238 remains the active change freeze until #219 is evidence-backed closed. Infrastructure readiness does not override this freeze.
6. Production data writes, migrations/schema/backfills, provider execution, workflow dispatch/change, Secrets/Variables, paid/destructive actions, and ineligible merges/releases still require their applicable approval. Consumed #228 authority remains non-reusable.
7. After every future major Production/recovery/security/release milestone, synchronize `HANDOFF / STATUS / DECISIONS / TODO` before the next major phase.

## Current Production state

- Repository: `karakuri3/Gacha-Lens`
- current P0-B merge commit: `397584fabe633b511cc060ae85335dc4e85fa81d`
- Production URL: `https://gachalens.com`
- Production runtime: Cloudflare Worker `gacha-lens`
- P0-B Production build: `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac` — successful
- authoritative DNS: Cloudflare
- registrar: Vercel; hosting is non-live rollback artifact only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase project `ihcudkfspzuixsqsvoku`: never confuse with Production

## P0-B result

PR #249 was explicitly approved for Production and merged through GitHub PR, not by direct main push.

What is now live:
- expensive discovery roots `/categories`, `/brands`, `/franchises`: 24h shared Cloudflare Workers Cache
- `/series` no-query and first-page facet landings: 30m shared cache
- series detail: 30m shared cache
- sitemap documents: 24h shared cache
- query/search/pagination variants remain outside discovery shared cache
- authorization/cookie/Next-internal boundaries remain excluded
- known branded Next error HTML is not cacheable at the shared edge
- public Supabase coordinates resolve environment-first with safe public fallback; service-role credentials remain environment-only

Pre-Production proof:
- repository Code Quality: PASS
- vinext compatibility/build: PASS
- exact Cloudflare runtime smoke: PASS
- isolated cache proof: PASS
- strict cache proof: byte-identical `MISS -> HIT -> HIT`
- Japanese variant diagnostic: detail/related/display/structuredData all `ok`

Post-Production proof:
- Cloudflare main build for `397584f` succeeded
- `/brands` renders the expected manufacturer index
- representative Japanese variant detail renders full live data
- a fresh identical Production series-detail request repeated three times produced one correlated cold Supabase API Gateway bundle and no second/third backend bundle for the warm repeats

Workers Logs remain disabled; this handoff does **not** claim a Workers log-stream review.

## Supabase Egress final gate

Immediate post-release baseline:
- Free plan
- cycle 2026-08-12–2026-09-12
- uncached Egress: **25.108 GB / 5 GB**
- Cached Egress: **0.085 GB / 5 GB**
- Fair Use grace date: **2026-09-06**

Supabase states Usage may take up to **1 hour** to refresh. The unchanged number immediately after release is therefore not enough to certify the next-cycle burn rate.

Current classification:
- P0-B implementation: **DONE / Production PASS**
- runtime/cache/backend suppression: **PASS**
- Free-plan sustainability: **PENDING refreshed post-release Egress evidence**
- paid plan required: **NOT ESTABLISHED**
- #219: OPEN
- #238: ACTIVE freeze
- #239: OPEN, implementation content superseded by merged #249; close/supersede only when #219 resolves

### Next action when resuming

Read a refreshed Supabase Usage measurement and compare its delta from the 25.108 GB release baseline with elapsed time and API Gateway request shape. Do not infer safety from a stale counter.

If evidence supports Free-plan sustainability:
1. record final evidence on #219;
2. close #219;
3. release/close #238 and formally reopen normal development;
4. close/supersede #239;
5. synchronize canonical docs again.

If evidence does not support sustainability:
1. keep #219/#238 open;
2. attribute the remaining uncached path/read mix;
3. implement the smallest bounded mitigation with exact-head Preview/CI proof;
4. do not upgrade merely to hide avoidable amplification.

## Infrastructure and rollback boundaries remain unchanged

- Cloudflare Worker prior versions are the primary application rollback path.
- Vercel is not the routine Production runtime.
- Stage 5 DB hardening is independently verified and must not be rolled back merely because application runtime changes.
- `www` canonical redirect and Cloudflare authoritative DNS remain the established Production routing.

## Hard boundaries

- no direct main push
- no paid/destructive action without applicable approval
- no Production DB/schema/data mutation by implication
- no provider refresh/write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no automatic RPC retry
