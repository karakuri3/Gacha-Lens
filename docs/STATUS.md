# Gacha Lens Status

Updated: 2026-09-14 JST — product gate and fresh business scorecard synchronized

## Executive state

- Infrastructure migration: **COMPLETE**
- Production runtime: Cloudflare Worker `gacha-lens`
- **Live `main`: always re-fetch before acting; do not infer it from a hard-coded SHA in this status file**
- #320 canonical synchronization merge: `d89c33ac715490f6923a442c3593e4164f8dd396`
- Last runtime/application baseline immediately before #320: `3b215a9c777431cbf049ec4966b83f474f146953`; #320 is docs-only
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Supabase Fair Use restriction: **CLEARED**
- #219/#238: **CLOSED / recovery complete**
- #281: public-read outage **RESOLVED**
- #282: **CLOSED UNMERGED**
- #280: **CLOSED / scheduled-write safety proven**
- #262/#265: **CLOSED / MERGED**; Cloudflare is authoritative release path
- #258: **MERGED**; runtime/cache proof pinning normalized
- #273: **MERGED**; fresh-database `forecast_snapshots` baseline restored
- #287/#291: **MERGED**; framework/security baseline updated and deterministic vinext validation established
- #253: **MERGED**; Japanese stored category routes repaired
- #261: **MERGED**; rerelease canonical year/month behavior repaired while Official auto remains disabled
- #307: **MERGED**; stale GitHub Actions work cancelled for bounded cost control
- #320: **MERGED / DOCS ONLY**; canonical product/reliability/business state synchronized
- #285/#286: **ACTIVE DRAFT / TECHNICALLY GREEN**; genuine independent Reviewer + Verifier remain the release blocker
- #303: **ACTIVE DRAFT / TECHNICALLY GREEN**; current-main reconciliation, Cloudflare gates and visual QA are complete at its frozen checkpoint; genuine independent review remains the release blocker
- #319: **ACTIVE P1 BUSINESS DECISION GATE**; fresh Production scorecard completed
- #263/#266/#268 and #264/#267/#269: **HOLD**; preserve implementation assets but do not advance provider spend until #319 reactivation conditions are met
- #119/#257/#260: **HOLD**; broad Data Scale is not the default next move
- #284: **OPEN** cost hygiene; broader docs-only-build objective still requires direct evidence

## Recovery and scheduled-write safety

The 2026-09 Fair Use incident is closed. Restrictions cleared after the provider cycle reset, representative public routes recovered, and the release train advanced through governance, Foundation repair, security, category routing and rerelease canonicalization.

Keep both scheduled write gates false:
- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

Recovery and subsequent code releases do not authorize either lane to wake up. Re-enable is always a separate lane-specific decision.

## P1 reliability release candidate — #286

Draft #286 extends the existing bounded 30-minute `seriesDetail` Cloudflare cache from `/series/:slug` to exactly `/series/group/:slug` without introducing a generic `/series/**` wildcard.

Frozen candidate checkpoint:
- head: `38aae46fa759b1cd470d6220640a905440f720ab`
- validated base: `3b215a9c777431cbf049ec4966b83f474f146953`
- ahead 5 / behind 0 at that checkpoint
- effective diff: exactly 4 files

Fresh exact-head evidence:
- PR Code Quality `34817627624`: SUCCESS
- Cloudflare runtime smoke `34817627620`: SUCCESS
- Cloudflare cache proof `34817627621`: SUCCESS

Dedicated validation-only #308 proved the canonical parent-series route on exact Preview:
- cold `MISS` -> warm `HIT` -> `HIT`
- byte-identical 64,736-byte HTML
- marker `series-detail-1800-v1`
- no `Set-Cookie`
- public runtime/auth/security checks PASS

#308 was closed unmerged after evidence capture.

**Remaining release gate:** genuine independent Reviewer + Verifier. Same-assistant self-review is not independent approval. Until that gate passes, #286 stays Draft and must not merge.

#320 advanced `main` after this frozen checkpoint with docs-only changes. Do not rewrite the frozen candidate merely to make an old ahead/behind count look current. Before eventual merge, fetch current main, inspect/reconcile drift and rerun any gates affected by the new exact head/base.

## P1 product release candidate — #303 Collector Editorial

Draft #303 implements the product-specific **Collector Editorial** direction: object-first collector context, real product imagery, compact market evidence and less generic dashboard/SaaS presentation while preserving market/data semantics.

Frozen candidate checkpoint:
- head: `37c8523acd44dd319dd06e79d3cc5f8e82edf1c8`
- validated main checkpoint: `3b215a9c777431cbf049ec4966b83f474f146953`
- ahead 38 / behind 0 at that checkpoint
- branch reconciled non-destructively; no force/history rewrite

Frozen-head release evidence is green:
- PR Code Quality: SUCCESS
- Cloudflare vinext: SUCCESS
- Cloudflare runtime smoke: SUCCESS
- Cloudflare cache proof: SUCCESS
- Design Visual QA: SUCCESS

Visual/data evidence:
- production-faithful QA harness integrated through #316
- real Japanese-data validation through #317/#318
- #318 final run `34823381570`: SUCCESS
- all 21 bounded public reads returned HTTP 200 on attempt 1
- bounded 5xx retry count: 0
- 360x800 / 390x844 / 1440x1000 coverage
- home, catalog/search, parent series, variant detail and ranking reviewed
- strengthened latest visual artifact contains 33 screenshots; no blocking horizontal/layout issue or development chrome

Validation-only #317/#318 are closed unmerged after evidence capture.

#303 briefly became Ready without an independent review submission. Live review and thread lists were empty, so it was returned to **Draft**. **Remaining release gate:** genuine independent review/verification required for this substantial product/UI release.

#320 subsequently advanced `main` with docs-only changes. Keep the frozen candidate stable for independent review. After independent PASS, fetch/reconcile then-current main and rerun any exact-head gates required by the resulting head/base before the complete Auto-Merge + Production Release policies.

## P1 business decision — #319

A fresh SELECT-only Production scorecard was run on 2026-09-14 instead of reusing the 2026-09-06 affiliate cohort or 2026-09-01 Data Scale baseline.

Current measured state:
- catalog: 10,241 series / 23,808 variants
- market: 176 listings; 175 safe active singles
- fresh <30d market coverage: 163 variants / **0.6846%**
- depth: 161 variants have 1 fresh listing, 2 have 2, none have 3+
- history: 198 observations; 22 listings re-observed; 12.5% re-observation rate
- last 7d: **0** new listings / **0** new observations
- review-safe stock/restock: **0 / 0**
- outbound clicks: 34 / 30d but **0 / 7d**; 14 distinct clicked variants / 30d
- verified affiliate provenance: 10 listings, all Rakuten
- affiliate-eligible exact `(variant_id, provider)` clicks: **0 / 34 = 0%**

Truthfulness states:
- Search Console: `unavailable` because the connected GSC Wizard trial/subscription does not currently permit the read; never convert this to zero or buy a plan by implication
- PostHog/product analytics: `unavailable` in the current tool session; no inferred traffic value
- provider-reported affiliate revenue/orders: `unavailable`
- X/social for this decision: `not_instrumented`; no provider action authorized

### Current business policy

The 2026-09-06 conclusion that affiliate-demand coverage should immediately advance is no longer current enough for execution.

Do **not** spend provider budget or advance #264/#267/#269 yet. First establish the current user-facing product baseline through normal governance and then observe fresh post-release user demand.

If fresh demand shows a meaningful Rakuten/Yahoo monetization overlap, recompute and reconcile the affiliate stack. If demand remains too sparse, prefer a **demand-weighted market-quality/re-observation experiment** on actually used pages/variants before broad Data Scale.

No arbitrary click threshold is invented in advance; use the actual post-release distribution and sample size.

## HOLD lanes

### Affiliate/provider stack
#263/#266/#268 and Draft PRs #264/#267/#269 are explicitly HOLD. Their safety designs and implementation remain useful, but all data-dependent cohorts, exact-main bindings and migration/history assumptions must be recomputed/rechecked before reuse. Provider execution and persistence remain separate explicit approvals.

### Broad Data Scale
#119/#257/#260 remain HOLD behind #319. Low market coverage alone does not justify broad collection expansion while recent demand and collection freshness are both weak. Prefer measured user-value work over generic provider count/data volume.

## Near-term operating order

1. Keep #286 frozen; obtain genuine independent Reviewer + Verifier.
2. Keep #303 frozen Draft; obtain genuine independent release review/verification.
3. If either independent gate passes, re-fetch current `main`, check drift/overlap, then apply Auto-Merge + Production Release policy in full before merge.
4. Release only through normal Git-triggered Cloudflare; perform bounded public smoke after release.
5. Once the current product baseline is live, measure fresh first-party usage and continue #319.
6. Choose affiliate coverage vs demand-weighted market-quality from current behavior; keep old affiliate stack and broad Data Scale HOLD until evidence reactivates them.
7. Finish #284 only from measured Cloudflare build behavior; avoid speculative settings expansion.
8. Keep scheduled write lanes disabled until separately authorized.

## Hard constraints

No direct main push; no Production DB/history, provider execution, workflow dispatch/change, Secrets/Variables, scheduled-lane re-enable, billing, auth/DNS or destructive action by implication. Keep ingestion disabled; no automatic RPC retry; never touch `supabase/.temp/cli-latest`; no Mercari/Amazon scraping.
