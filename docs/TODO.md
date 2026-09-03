# Gacha Lens Ordered TODO

Updated: 2026-09-04 JST — P0-B public-detail read amplification

Read `docs/HANDOFF_LATEST.md` first for the exact live checkpoint. Historical pre-P0-B TODO is preserved at `docs/history/2026-09-03-pre-233-TODO.md`.

## P0 — Issue #219 / #239 — CURRENT BLOCKER

P0-A sitemap mitigation is released and verified. P0-B has now proven a remaining repeated product-detail Supabase read path. Normal feature/Data Scale development stays behind this reliability gate.

### Completed P0-B diagnosis

- [x] attribute the product-detail target/sibling/signal/related read set
- [x] reject `revalidate=1800` alone after repeated backend reads
- [x] reject full-route `force-static` after Japanese slug HTTP 500 / invalid cache-tag metadata
- [x] reject operation-scoped Supabase fetch caching after exact Preview backend repetition
- [x] reject completed-result `unstable_cache` facade after exact Preview backend repetition
- [x] instrument `unstable_cache` origin without raw slug/secrets
- [x] exact-head `a02e69285ebcc9c06e1be67f2e066d8460e57e68` CI `33784381137` SUCCESS
- [x] exact-head Preview `dpl_BagCivrtVobFkZum27Stg2PridsS` READY
- [x] fresh Japanese request #1 HTTP 200
- [x] identical request #2 HTTP 200
- [x] prove facade is actually executed via identical hashed origin markers on both requests
- [x] prove Supabase backend read set repeats on the second request at about `17:27:35-36Z` after first at about `17:25:52Z`
- [x] close the alias/explicit-import hypothesis; do not spend another build on it
- [x] synchronize `HANDOFF_LATEST / HANDOFF / STATUS / DECISIONS / TODO` so a new thread can resume without user re-explanation

### Remaining blocking gates before normal development resumes

1. [ ] Compare official current semantics/cost/limits/portability and select **one** architecture: portable Runtime Cache adapter, safe response/CDN cache boundary, or reduced/precomputed public-detail read model.
2. [ ] Implement the smallest safe reversible candidate; remove temporary `unstable_cache` diagnostic code and avoid raw service-role/admin/write caching.
3. [ ] Pass fresh exact-head CI + Vercel Preview + Japanese slug two-request test + Vercel runtime evidence + Supabase backend evidence.
4. [ ] Complete final full-diff/security review, unresolved-thread/runtime-error check, and current-main drift check.
5. [ ] Obtain/apply the applicable Production approval, merge/release through the normal path, and pass Production smoke.
6. [ ] Perform short read-only post-release Supabase egress/read observation; keep #219 open until the Fair Use/availability risk is credibly controlled.

Most of the six gates are assistant-executable. The owner should only be interrupted for an actual approval/human-only boundary.

### Acceptance criteria

- same public Japanese product page must remain correct;
- second request must avoid or materially reduce the expensive detail read set as designed;
- no raw service-role/admin/write data in shared cache;
- freshness target remains aligned to intended ingestion cadence (about 30 minutes unless evidence justifies otherwise);
- cache failure must degrade safely;
- no paid dependency or plan change without explicit approval;
- account for Cloudflare migration portability and cold-origin duplicate work.

## P1 — Resume product development after #219 is controlled

When the six gates above pass, immediately re-rank normal work using:

**Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**

Do not automatically return to Data Scale. Re-fetch Search Console/product traffic/outbound click/affiliate/freshness/cost evidence and choose the single highest-leverage product experiment.

## Separate work / HOLD

- Cloudflare Workers/vinext POC PR #235 remains Draft/non-Production and should inform portability but not interrupt P0.
- branch-protection hardening Issue #236 remains open.
- Data Scale/history/provider writes stay on hold; exact #228 authority is consumed/non-reusable.
- Supabase advisor remediation remains separate behavior-impact work.
- no workflow dispatch/change, Secrets/Variables change, paid/destructive action, direct-main push, or Production DB/schema/data write by implication.
- never touch `supabase/.temp/cli-latest`.
- keep `.github/workflows/gacha-ingestion.yml` disabled.
