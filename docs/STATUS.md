# Gacha Lens Status

Updated: 2026-09-04 JST — P0-B public detail read amplification under active mitigation

For the full live checkpoint and rejected experiments, read `docs/HANDOFF_LATEST.md` first. `HANDOFF_LATEST / HANDOFF / STATUS / DECISIONS / TODO` are synchronized for cross-thread recovery. Historical pre-P0-B status is preserved in `docs/history/2026-09-03-pre-233-STATUS.md`.

## Current repository / release

- current verified `main`: `da506232472c22c909f95e5a855b1cfed8889e73`
- Production domain: `gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum`
- parent incident: Issue #219 — **OPEN P0**
- implementation issue: #239 — **OPEN P0**
- implementation branch: `fix/p0-public-data-cache-30m`
- Draft PR #240 — **OPEN / UNMERGED / Production freeze active**
- last exact code head tested: `a02e69285ebcc9c06e1be67f2e066d8460e57e68`
- exact-head CI `33784381137`: **SUCCESS**
- exact-head Preview `dpl_BagCivrtVobFkZum27Stg2PridsS`: **READY**

## What is failing

A normal public `/series/[slug]` request performs a broad Supabase read set for the target variant, siblings, market observations, x reactions, stock reports, restock events, market listings, related candidates, and related-series signals. The identical second request currently repeats that backend work.

This matters because the shared Supabase organization previously showed uncached Egress **24.614 / 5 GB (~492%)**, with a Fair Use grace period ending 2026-09-19 and credible availability/cost risk. Exact Gacha-only billed GB remains unproven and must not be invented.

## P0-A

Sitemap amplification mitigation from PR #231 is **RELEASED / VERIFIED**. It moved sitemap work to daily static/ISR boundaries and passed Production smoke. It reduced one amplification path but did not by itself close #219.

## P0-B evidence now decisive

Rejected approaches:
- `revalidate=1800` alone — backend reads repeated;
- full-route `force-static` — ASCII worked but Japanese slugs could 500 via invalid `x-next-cache-tags`;
- operation-scoped cached Supabase fetch — Japanese 200 but backend read set repeated;
- completed-result `unstable_cache` facade — Japanese 200 but backend read set repeated.

The latest instrumented exact head `a02e692...` proved the facade is definitely executed. On a fresh Japanese probe, the first request logged the cache origin callbacks `variant` twice and `related` once; the identical second request logged the exact same hashes again. Supabase independently repeated the same detail read set at about `17:27:35-36Z` after the first at about `17:25:52Z`.

Conclusion: **do not spend more builds on alias/explicit-import or `unstable_cache` variants.** The next move is an architecture choice.

## Current true gate

Select and implement one production-grade mechanism that materially reduces repeated Supabase reads while preserving Japanese slugs, freshness, public semantics, write/admin isolation, and Cloudflare portability where practical.

Candidates to compare before implementation:
- portable cache abstraction with a Vercel Runtime Cache adapter now and Cloudflare adapter later;
- safe response/CDN cache boundary;
- reduced/precomputed public detail read model.

No new paid dependency may be added by implication.

## Validation required before normal development resumes

- chosen mechanism implemented as a small reversible diff;
- temporary diagnostic code removed or replaced by safe proof instrumentation;
- fresh exact-head CI SUCCESS;
- exact-head Vercel Preview READY;
- fresh Japanese slug request #1 and identical request #2;
- runtime evidence shows intended cache/reduction behavior;
- Supabase logs show the repeated detail read set is absent or materially reduced as designed;
- complete diff/security review and current-main drift check;
- applicable Production approval before merge/release;
- Production smoke and short post-release Supabase egress/read observation.

## Hard holds

- no Production DB/schema/data write by implication
- no workflow dispatch/change by implication
- no Secrets/Variables changes by implication
- no paid/destructive action without approval
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no direct main push
- keep PR #240 Draft until its backend-load gate passes

## Separate lower-priority work

- Cloudflare Workers/vinext POC PR #235 remains Draft/non-Production and is useful as a portability constraint, not a reason to delay P0.
- branch-protection hardening Issue #236 remains open.
- Data Scale/history/provider writes remain on hold; prior #228 authority is consumed/non-reusable.
- Supabase advisor debt remains separate behavior-impact work.
