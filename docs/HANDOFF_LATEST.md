# Gacha Lens Latest Thread Handoff

Updated: 2026-09-04 JST

This file is the **latest in-progress checkpoint** while the Supabase egress P0 remains open. A fresh ChatGPT thread that receives only **「Gacha Lens続けて」** must read this file first, then `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, and the live GitHub/Vercel/Supabase state before taking action.

## Safety state

- Production freeze remains active for the current P0-B experiment.
- Do **not** merge PR #240 until exact-head Preview backend evidence passes and the applicable Production approval is given.
- No Production DB/schema/data write, DNS change, Auth change, Secrets/Variables change, workflow dispatch/change, paid action, or direct-main push is authorized by this checkpoint.
- Keep `.github/workflows/gacha-ingestion.yml` disabled.
- Never touch `supabase/.temp/cli-latest`.

## Repository state

- repository: `karakuri3/Gacha-Lens`
- current `main`: `da506232472c22c909f95e5a855b1cfed8889e73`
- current P0 branch: `fix/p0-public-data-cache-30m`
- Draft PR: #240 `fix: bound public Supabase reads to ingestion cadence`
- last verified PR head before this checkpoint: `c587227d321767163620dd37b373265180b8ce73`
- P0 implementation issue: #239
- parent reliability/cost incident: #219
- Production domain: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase: `ihcudkfspzuixsqsvoku`
- preferred local path: `C:\dev\Gacha-Lens`

## What is being fixed now

The active defect is **repeated public product-detail Supabase reads**. One normal `/series/[slug]` request hydrates the target variant, siblings, market observations, four signal families, related candidates, and related-series signals. Repeating the same page request currently repeats that backend read set instead of reusing a safe 30-minute public-data cache. This can amplify Supabase uncached egress and keeps Issue #219 at credible reliability/cost risk.

The route must continue to support normal Japanese slugs, preserve public semantics/freshness, and never cache raw service-role responses or admin/write data.

## P0-A already released

PR #231 bounded sitemap-driven amplification using static/ISR daily revalidation. That release was verified, but it did not by itself prove the shared Supabase egress risk solved; #219 remains open.

## Rejected P0-B experiments — do not repeat

1. `revalidate=1800` alone: the detail route remained dynamic and the backend reads repeated.
2. Full-route `force-static + revalidate=1800`: ASCII slug could reach `x-vercel-cache: HIT`, but a normal Japanese slug returned HTTP 500 with `ERR_INVALID_CHAR` / invalid `x-next-cache-tags`. Rejected.
3. Exact head `059df1a7bf75dab5552f5f324a78c6c96d6b67cf`: operation-scoped custom `fetch` cache for Supabase GET/HEAD only. CI run `33781577045` SUCCESS and Japanese `セブルス・スネイプ` HTTP 200, but Supabase logs repeated the complete read set at `2026-09-03T16:59:15Z` after baseline `16:58:51Z`. Rejected.
4. Exact head `c587227d321767163620dd37b373265180b8ce73`: completed public-detail `unstable_cache` facade selected through a `jsconfig.json` alias. CI run `33782780011` SUCCESS; Preview `dpl_6e6tZ5ZCSUTZi5epnFomoZ6kuBgV` READY; Japanese probe `チョココロネ` HTTP 200. Supabase logs repeated the same target/siblings/market/signals/related read set at `17:11:05Z` after baseline `17:09:47Z`. Rejected as a merge candidate.

Vercel runtime logs for the last experiment show both requests were served by the same exact deployment and both were serverless route-cache MISSes, which is expected for the intentionally dynamic route and does not prove whether the data facade ran.

## Current next diagnostic — smallest safe change

Before trying another cache technology, isolate whether the previous facade was actually used at runtime:

1. remove the global exact `jsconfig.json` alias for `@/lib/series`;
2. keep all unrelated/admin/write consumers on the original `lib/series.js`;
3. make only `app/series/[slug]/page.js` import `getSeriesBySlug` and `getRelatedSeries` explicitly from the thin public cache facade;
4. keep the route dynamic and TTL 1800 seconds;
5. run exact-head CI;
6. wait for exact-head Vercel Preview READY;
7. use a fresh, normal Japanese slug not previously requested on that deployment;
8. request it once and capture the Supabase backend read set/time;
9. request the identical exact Preview URL a second time;
10. PASS only if the second request does **not** repeat the product-detail backend read set and runtime errors are clean.

If this diagnostic FAILS, do not keep generating small `unstable_cache` variants. Stop and compare three architectural choices: Vercel Runtime Cache, response/CDN caching where semantics allow, and reducing/reshaping the product-detail read model/query volume. The selection must include Cloudflare portability because Gacha Lens has an active Cloudflare migration POC and avoidable Vercel lock-in is undesirable.

## Merge / Production gate

Even if the next Preview test passes:
- review the complete final diff;
- exact-head CI must remain green;
- no unresolved blocking review/runtime error may remain;
- confirm `main` drift before merge;
- request applicable Production approval before merging/releasing if required by current policy;
- after release, verify Production smoke and measure actual Supabase egress/read behavior before closing #219.

## Separate work held behind P0

- Cloudflare Workers/vinext POC: Draft PR #235, exact-head compatibility/build CI previously SUCCESS; no Production DNS/cutover.
- Cloudflare Pages Beach POC is separate and must not distract from Gacha Lens reliability P0.
- branch-protection hardening Issue #236 remains open.
- Supabase advisor findings are separate; do not change RLS/policies/extensions/indexes by implication.
- Data Scale/history/provider writes remain on hold; prior #228 authority is consumed and non-reusable.

## Immediate resume instruction

If this conversation disappears now, the next thread should say **「Gacha Lens続けて。docs/HANDOFF_LATEST.mdを正本としてP0 #219/#239、Draft PR #240から再開して」**. The assistant should re-fetch live state first and continue the explicit-import diagnostic above. No user re-explanation should be required.
