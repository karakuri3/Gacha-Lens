# Gacha Lens Status

Updated: 2026-09-06 JST — Supabase Egress P0-B released to Production; post-release Usage refresh pending

The company infrastructure migration remains complete. The full pre-cutover checkpoint is preserved at `docs/history/2026-09-05-pre-final-cutover-STATUS.md` and in Git history.

## Executive state

- Company infrastructure migration: **COMPLETE**.
- Production web runtime: Cloudflare Worker `gacha-lens` on `https://gachalens.com`.
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`).
- Issue #219 Supabase Egress: **P0-B RELEASED / FINAL POST-RELEASE EVIDENCE PENDING**.
- Issue #238 change freeze: **ACTIVE** until #219 is evidence-backed closed.
- Issue #239 implementation lane: **OPEN / superseded by merged PR #249, close only with #219**.
- Normal feature development: infrastructure-ready, but **temporarily frozen by #238**.

## P0-B Production release — PASS

PR #249 (`fix: bound discovery origin reads at Cloudflare edge`) was explicitly approved and merged through the PR mechanism. No direct main push was used.

- merged main commit: `397584fabe633b511cc060ae85335dc4e85fa81d`
- Cloudflare Production build: `f1d61310-7e7e-44f5-8c3e-4eb791aca5ac` — successful
- exact Preview and repository gates before merge: PR Code Quality, vinext compatibility, runtime smoke, and isolated cache proof all passed
- Production `/brands`: healthy and rendering expected manufacturer facets
- Production representative Japanese `/series/[slug]`: healthy and rendering full live data
- Production repeated-request check: one correlated cold Supabase API Gateway/PostgREST bundle followed by no repeated bundle for the two identical warm requests

The strict Preview proof had already established byte-identical `MISS -> HIT -> HIT` for a cache-eligible Japanese product page. Production API Gateway behavior is consistent with that cache boundary being active after merge.

## Active edge-cache policy

Shared public HTML remains deliberately bounded:

- `/categories`, `/brands`, `/franchises` no-query roots: 24h, marker `discovery-index-86400-v1`
- `/series` no-query and first-page facet landings: 30m, marker `discovery-document-1800-v1`
- series detail: 30m, marker `series-detail-1800-v1`
- ordinary public documents: 120s, marker `public-document-120-v1`
- public sitemap documents: 24h, marker `public-sitemap-86400-v1`
- query/search/pagination, auth/cookie requests, and Next internals remain outside the discovery shared-cache policy
- known branded error HTML is not promoted into shared edge cache

## Supabase Usage — current truth

Immediate post-release Usage remains the same as the pre-release baseline:

- plan: Free
- billing cycle: 2026-08-12–2026-09-12
- uncached Egress: **25.108 GB / 5 GB**
- Cached Egress: **0.085 GB / 5 GB**
- Fair Use grace date shown by Supabase: **2026-09-06**

Supabase states the Usage summary can take up to **1 hour** to refresh. Therefore the unchanged counter minutes after release is only a baseline and is not enough to certify monthly Free-plan sustainability.

Current decision:
- implementation/runtime/cache/backend suppression: **PASS**
- paid plan required: **NOT ESTABLISHED**
- Free-plan sustainability: **PENDING refreshed post-release Egress evidence**
- do not close #219 or lift #238 until that evidence is available

## Production infrastructure state remains valid

- authoritative DNS: Cloudflare (`lady.ns.cloudflare.com`, `tony.ns.cloudflare.com`)
- apex: Worker Custom Domain -> `gacha-lens`
- `www`: Cloudflare 301 redirect to apex with path/query preservation
- Vercel: registrar and non-live rollback artifact only; routine Git builds disabled
- Stage 5 Supabase hardening recommended subset: applied and verified
- Workers Logs: disabled; do not claim log-stream review
- Cloudflare deployment history retains prior versions for rollback

## Approval boundaries

Still enforced:
- no direct main push
- no paid/destructive action without applicable approval
- no Production DB/schema/data mutation by implication
- no provider write/refresh by implication
- no workflow dispatch/change by implication
- no Secrets/Variables change by implication
- consumed #228 authority remains non-reusable
- keep `.github/workflows/gacha-ingestion.yml` disabled
- never touch `supabase/.temp/cli-latest`
- no automatic RPC retry

## Next gate

The only blocking evidence item in this lane is a refreshed post-release Supabase Egress measurement sufficient to judge trajectory. If it supports Free-plan sustainability, close #219, formally release #238, close/supersede #239, and reopen normal development. If it does not, keep the freeze and continue bounded attribution/mitigation rather than buying a plan by default.
