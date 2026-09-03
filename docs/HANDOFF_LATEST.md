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
- current `main` at latest verification: `da506232472c22c909f95e5a855b1cfed8889e73`
- current P0 branch: `fix/p0-public-data-cache-30m`
- Draft PR: #240 `fix: bound public Supabase reads to ingestion cadence`
- last **code** head tested in Preview: `a02e69285ebcc9c06e1be67f2e066d8460e57e68`
- exact-head CI for that code head: run `33784381137` — SUCCESS
- exact-head Vercel Preview for that code head: `dpl_BagCivrtVobFkZum27Stg2PridsS` — READY
- P0 implementation issue: #239
- parent reliability/cost incident: #219
- Production domain: `https://gachalens.com`
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old inactive Supabase: `ihcudkfspzuixsqsvoku`
- preferred local path: `C:\dev\Gacha-Lens`

Any docs-only commit after `a02e692...` is a checkpoint update, not new cache-code evidence. The next code candidate requires fresh exact-head CI/Preview proof.

## What is being fixed now

The active defect is **repeated public product-detail Supabase reads**. One normal `/series/[slug]` request hydrates the target variant, siblings, market observations, four signal families, related candidates, and related-series signals. Repeating the same page request currently repeats that backend read set instead of reusing or otherwise avoiding the work. This can amplify Supabase uncached egress and keeps Issue #219 at credible reliability/cost risk.

The final solution must continue to support normal Japanese slugs, preserve public semantics/freshness, and never cache raw service-role responses or admin/write data.

## P0-A already released

PR #231 bounded sitemap-driven amplification using static/ISR daily revalidation. That release was verified, but it did not by itself prove the shared Supabase egress risk solved; #219 remains open.

## Rejected P0-B experiments — do not repeat

1. `revalidate=1800` alone: the detail route remained dynamic and the backend reads repeated.
2. Full-route `force-static + revalidate=1800`: ASCII slug could reach `x-vercel-cache: HIT`, but a normal Japanese slug returned HTTP 500 with `ERR_INVALID_CHAR` / invalid `x-next-cache-tags`. Rejected.
3. Exact head `059df1a7bf75dab5552f5f324a78c6c96d6b67cf`: operation-scoped custom `fetch` cache for Supabase GET/HEAD only. CI run `33781577045` SUCCESS and Japanese `セブルス・スネイプ` HTTP 200, but Supabase logs repeated the complete read set at `2026-09-03T16:59:15Z` after baseline `16:58:51Z`. Rejected.
4. Exact head `c587227d321767163620dd37b373265180b8ce73`: completed public-detail `unstable_cache` facade selected through a `jsconfig.json` alias. CI run `33782780011` SUCCESS; Preview `dpl_6e6tZ5ZCSUTZi5epnFomoZ6kuBgV` READY; Japanese probe `チョココロネ` HTTP 200. Supabase logs repeated the same target/siblings/market/signals/related read set at `17:11:05Z` after baseline `17:09:47Z`. Rejected as a merge candidate.
5. Exact head `a02e69285ebcc9c06e1be67f2e066d8460e57e68`: the same `unstable_cache` facade was instrumented so the origin callback logs only a fixed operation name plus the first 12 SHA-256 hex characters of the cache identity. No raw slug, secret, or DB value was logged. CI `33784381137` SUCCESS and Preview `dpl_BagCivrtVobFkZum27Stg2PridsS` READY. Fresh Japanese probe displayed `アルバス・ダンブルドア` with HTTP 200. First request emitted `variant bcc2f31ed429` **twice** and `related a2f2b32e9ea6` once. The identical second request emitted the exact same three origin markers again. Supabase independently showed the product-detail read set at about `17:25:52Z` and again at `17:27:35-36Z`, including target, siblings, market observations, x reactions, stock reports, restock events, market listings, related candidates, and related-series signals. This decisively proves the facade is used at runtime but the present `unstable_cache` path is not reusing the completed result across requests. Reject this cache mechanism; do not spend more builds on alias/explicit-import variants.

The duplicate `variant` origin execution within a single cold request also indicates two detail consumers (for example metadata + page rendering/concurrency) can perform the same expensive origin work. A final design should address request-to-request reuse/reduction and, where practical, cold-request duplicate work.

## Current next step — architecture selection, not another `unstable_cache` tweak

Do **not** run the previously proposed explicit-import diagnostic; the instrumentation proved the facade is executing, so that hypothesis is closed.

Compare and select the smallest safe production-grade mechanism among:

1. a portable cache abstraction with a Vercel Runtime Cache adapter now and a Cloudflare KV/Cache adapter later;
2. response/CDN caching at a safe public-data boundary where Japanese-slug semantics and metadata remain valid;
3. reducing/reshaping the public detail read model so one page requires far fewer Supabase reads, potentially a precomputed public snapshot aligned to ingestion cadence.

Selection criteria:
- materially reduce repeated Supabase uncached egress;
- no raw service-role/admin/write data in shared cache;
- normal Japanese slugs must remain HTTP 200;
- freshness target approximately 30 minutes / fastest intended ingestion cadence unless evidence justifies otherwise;
- fail safely if cache is unavailable;
- account for cold-request duplication/stampede behavior;
- minimize Vercel lock-in because Cloudflare Workers/vinext migration POC #235 is active;
- no new paid dependency without explicit approval;
- prefer a small reversible diff over a schema migration unless the latter is clearly superior.

Before implementation, verify current official Runtime Cache / Cloudflare cache semantics, pricing/limits, and repository dependencies. Then implement one chosen candidate, not several speculative variants.

## Required validation gate for the next candidate

1. remove the temporary diagnostic instrumentation unless the selected mechanism needs equivalent non-sensitive proof;
2. exact-head CI SUCCESS;
3. exact-head Vercel Preview READY;
4. fresh normal Japanese slug request #1;
5. identical request #2;
6. Vercel runtime evidence proves the intended cache/reduction path;
7. Supabase API logs prove the repeated detail read set is absent or materially reduced as designed;
8. runtime errors clean;
9. final complete diff/security review and current-main drift check;
10. only then request/apply the applicable Production approval and release gate.

After release, Production smoke and a short Supabase egress/read observation are still required before #219 can be considered controlled/closable.

## Separate work held behind P0

- Cloudflare Workers/vinext POC: Draft PR #235, exact-head compatibility/build CI previously SUCCESS; no Production DNS/cutover.
- Cloudflare Pages Beach POC is separate and must not distract from Gacha Lens reliability P0.
- branch-protection hardening Issue #236 remains open.
- Supabase advisor findings are separate; do not change RLS/policies/extensions/indexes by implication.
- Data Scale/history/provider writes remain on hold; prior #228 authority is consumed and non-reusable.

## Immediate resume instruction

If this conversation disappears now, the next thread should say **「Gacha Lens続けて。docs/HANDOFF_LATEST.mdを正本としてP0 #219/#239、Draft PR #240から再開して」**. The assistant should re-fetch live state first, skip further `unstable_cache`/alias experiments, perform the architecture selection above, and continue from there. No user re-explanation should be required.
