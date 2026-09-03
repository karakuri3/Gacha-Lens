# Gacha Lens Durable Decisions

Updated: 2026-09-04 JST — P0-B public-detail read mitigation

Historical durable decisions D-001 through D-123 remain authoritative unless explicitly superseded. Immediate prior snapshot: `docs/history/2026-09-03-pre-233-DECISIONS.md`. Current incident detail: `docs/HANDOFF_LATEST.md`.

## D-119 through D-123 — preserved

- Reliability/cost risk outranks Data Scale when shared infrastructure faces credible restriction.
- P0-A sitemap caching is proven released, but #219 is not proven solved until observed Egress improves.
- Remaining public read amplification is P0-B before more market writes.
- Product prioritization uses **Reliability / Cost -> User Value -> Traffic -> Click -> Revenue**, not Data Scale counts alone.
- Exact #228 R4 authority remains consumed/non-reusable.

## D-124 — Product-detail request-to-request read amplification is a verified P0-B mechanism

Live Preview and Supabase evidence proves that repeating the same normal Japanese `/series/[slug]` request repeats the target/sibling/market/signal/related backend read set. This is no longer a speculative optimization target; it is a verified amplification path and remains part of #219 until bounded or otherwise materially reduced.

## D-125 — Full-route static caching is rejected for current variant-detail pages

A full-route `force-static + revalidate=1800` experiment could produce an ASCII-slug cache HIT but normal Japanese slugs could fail with `ERR_INVALID_CHAR` involving `x-next-cache-tags`. Japanese slugs are ordinary Production data, so this route-cache design is not a safe release candidate.

Do not reintroduce full-route static caching for this path unless the Japanese cache-metadata failure is independently eliminated and re-proven.

## D-126 — Current `unstable_cache` designs are rejected after runtime-origin proof

Multiple `unstable_cache`/Data Cache attempts preserved page correctness but did not suppress repeated backend reads. The decisive instrumented exact head `a02e69285ebcc9c06e1be67f2e066d8460e57e68` proved the cache facade itself executes: a first Japanese request emitted the hashed `variant` origin twice and `related` once; the identical second request emitted the same origin markers again. Supabase independently repeated the complete read set on the second request.

Therefore the working hypothesis is no longer “the alias/facade may not be used.” The facade is used, but this mechanism is not providing the required request-to-request reuse in the deployed path. Do not burn more build budget on alias-vs-explicit-import or minor `unstable_cache` variants without new evidence.

## D-127 — The next P0-B solution must be selected architecturally and include portability/cost as first-class criteria

Before the next implementation, compare the smallest viable production-grade approaches:

1. a portable cache abstraction with a Vercel Runtime Cache adapter now and a Cloudflare KV/Cache adapter later;
2. a safe public response/CDN cache boundary;
3. a reduced/precomputed public-detail read model.

The chosen design must:
- materially reduce repeated uncached Supabase reads;
- never place raw service-role/admin/write data in shared cache;
- preserve normal Japanese slugs and public behavior;
- target freshness around the fastest intended ingestion cadence (currently about 30 minutes) unless evidence justifies another TTL;
- fail safely if cache is unavailable;
- account for duplicate cold-origin execution/stampede where practical;
- avoid unnecessary Vercel lock-in because Cloudflare Workers/vinext POC #235 is active;
- add no paid dependency without explicit owner approval;
- prefer a small reversible diff over a Production schema migration unless the migration/read-model approach is clearly superior.

## D-128 — Exact-head backend evidence, not framework-cache assumptions, is the acceptance criterion

A cache implementation is not accepted because CI passes, a page returns 200, or a framework API is documented to cache. The gate requires the exact deployed head plus two identical fresh Japanese-slug requests and runtime/Supabase evidence demonstrating the intended reduction.

Only after that evidence, complete diff/security review, main-drift check, applicable Production approval, release smoke, and short post-release observation may #219 be considered controlled enough to resume normal product development.

## Current durable state

- verified `main`: `da506232472c22c909f95e5a855b1cfed8889e73`
- Issue #219: **OPEN P0**
- Issue #239: **OPEN P0-B implementation lane**
- Draft PR #240: **OPEN / UNMERGED / NOT A RELEASE CANDIDATE YET**
- last exact code head tested: `a02e69285ebcc9c06e1be67f2e066d8460e57e68`
- exact-head CI `33784381137`: **SUCCESS**
- Preview `dpl_BagCivrtVobFkZum27Stg2PridsS`: **READY**
- present `unstable_cache` mechanism: **REJECTED by backend evidence**
- next gate: **architecture choice -> one new implementation -> exact-head backend proof**

## Approval / hard constraints

Not authorized now:
- merge/release PR #240
- Production DB/schema/data mutation
- provider/history/R4 write or retry
- workflow dispatch/change
- Secrets/Variables changes
- paid-plan or paid-dependency change
- unrelated advisor remediation
- destructive action
- direct main push

Hard constraints:
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- do not weaken strict market matching/identity guards
- completed sold evidence remains separate from asking-price evidence
- do not scrape Mercari or Amazon
