# Gacha Lens Ordered TODO

Updated: 2026-09-14 JST

Infrastructure migration, Fair Use recovery, release-governance repair, Foundation migration repair, framework security, Japanese category routing and rerelease canonicalization are complete. The current operating order is: finish independently gated release candidates, establish the Collector Editorial product baseline, then re-measure fresh user demand through #319 before choosing affiliate execution or demand-weighted market-quality work.

## Completed recovery / governance / security train

- [x] #219/#238 recovery gate passed and incident/freeze closed
- [x] #281 resolved after provider recovery
- [x] #282 closed without merge
- [x] #280 scheduled-write safety complete
- [x] keep `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] keep `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] #265 merged and #262 closed; Cloudflare is authoritative Production/Preview release path
- [x] #258 merged; runtime/cache proof source binding normalized
- [x] #273 merged; fresh-database `forecast_snapshots` baseline restored
- [x] #291/#287 merged; framework security baseline and deterministic vinext toolchain repaired
- [x] #253 merged; Japanese stored category routing repaired
- [x] #261 merged; rerelease canonical year/month repair released while Official auto remains disabled
- [x] #307 merged; stale CI runs cancelled to reduce redundant Actions usage
- [ ] re-enable either scheduled write lane only under a new lane-specific approval

## P1 release candidate — #285 / #286 parent-series edge cache

- [x] bounded matcher implementation exists
- [x] current candidate reconciled to current `main` at its frozen checkpoint
- [x] exact-head PR Code Quality PASS
- [x] exact-head Cloudflare runtime smoke PASS
- [x] exact-head Cloudflare cache proof PASS
- [x] dedicated parent-series exact-Preview proof PASS through validation-only #308
- [x] parent-series cold `MISS` -> `HIT` -> `HIT`
- [x] byte-identical 64,736-byte HTML within the proof run
- [x] `series-detail-1800-v1`, no `Set-Cookie`
- [x] public runtime/auth/security checks PASS
- [x] #308 closed without merge
- [ ] obtain a genuine independent Verifier result on the frozen current candidate
- [ ] obtain a genuine independent Reviewer result on the frozen current candidate
- [ ] after independent PASS, re-fetch `main` and confirm no intervening overlap/drift
- [ ] apply Auto-Merge and Production Release gates in full
- [ ] squash merge only if every gate remains green
- [ ] observe the normal Git-triggered Cloudflare release and run bounded Production smoke
- [ ] close #285 only after released behavior is verified
- [ ] do not claim measured Production egress savings without actual measurement

## P1 product experience — #303 Collector Editorial

- [x] product-specific design direction and `DESIGN.md` exist
- [x] #303 reconciled non-destructively with current `main` at checkpoint `3b215a9c777431cbf049ec4966b83f474f146953`
- [x] current frozen head `37c8523acd44dd319dd06e79d3cc5f8e82edf1c8` is ahead 38 / behind 0 at the checkpoint
- [x] exact-head PR Code Quality PASS
- [x] exact-head Cloudflare vinext PASS
- [x] exact-head Cloudflare runtime smoke PASS
- [x] exact-head Cloudflare cache proof PASS
- [x] Design Visual QA PASS
- [x] production-faithful visual harness integrated through #316
- [x] real Japanese-data validation through #317/#318
- [x] final #318 pass returned HTTP 200 on all 21 bounded reads with zero 5xx retries
- [x] 360 px / 390 px / desktop reviewed
- [x] home, catalog/search, parent series, variant detail and ranking reviewed
- [x] long Japanese names and populated/fallback states reviewed
- [x] strengthened visual artifact includes 33 screenshots with no blocking layout issue
- [x] market/data semantics intentionally unchanged
- [x] validation-only #317/#318 closed without merge after evidence capture
- [ ] obtain genuine independent Reviewer/Verifier disposition required for this substantial release
- [ ] keep #303 Draft until that independent gate passes
- [ ] after PASS, re-fetch `main`, recheck head/base drift and apply complete Auto-Merge + Production Release gates
- [ ] release only through normal merge-triggered Cloudflare Production path, then bounded public smoke

## P1 business decision — #319 fresh scorecard

- [x] run a fresh current-state Production scorecard on 2026-09-14 using SELECT-only reads
- [x] measure current first-party outbound demand and affiliate coverage
- [x] measure current market breadth/depth/history/signals
- [x] record truthfulness states for unavailable Search Console/PostHog/revenue data
- [x] create #319 as the current business decision gate
- [x] mark #263/#266/#268 and Drafts #264/#267/#269 HOLD rather than treating 2026-09-06 inputs as current

Fresh decision evidence at the #319 checkpoint:
- 10,241 series / 23,808 variants
- 176 market listings; 163 variants fresh <30d; fresh coverage 0.6846%
- 161 / 163 fresh covered variants have only one listing
- 198 observations; 22 listings re-observed; re-observation rate 12.5%
- 0 new listings and 0 new observations in the last 7d
- stock/restock review-safe signals 0 / 0
- outbound clicks: 34 / 30d, **0 / 7d**, 14 distinct variants / 30d
- verified affiliate provenance listings: 10, all Rakuten
- affiliate-eligible exact `(variant_id, provider)` clicks: **0 / 34 = 0%**

Current policy:
- [ ] first establish/release the current product-quality baseline through governance
- [ ] observe fresh post-release first-party usage; do not use rolling 30d historical residue alone
- [ ] recompute exact Rakuten/Yahoo demand/listing overlap from then-current Production data
- [ ] choose affiliate execution only if current demand makes it a materially useful experiment
- [ ] if demand remains weak, prefer demand-weighted market-quality/re-observation on actually used pages/variants before broad Data Scale
- [ ] do not invent a numeric demand threshold in advance; decide from the actual post-release distribution/sample size

If affiliate execution later wins:
- [ ] recompute #264 cohort from then-current data
- [ ] reconcile #264 onto then-current `main`
- [ ] reconcile/revalidate #267 provider-read binding
- [ ] reconcile/revalidate #269 durable authorization ledger
- [ ] independently review the ledger before release
- [ ] reconcile any Production migration-history state only through a separate exact-evidence plan; never blind `db push`
- [ ] check configuration readiness without exposing secret values
- [ ] obtain a fresh exact provider-read approval before any provider call
- [ ] keep provider execution and affiliate-provenance persistence separately gated

## Reliability / cost hygiene — #284

- [x] exact two Cloudflare proof-workflow paths have the previously approved bounded Build Watch exclusion
- [ ] establish current before/after evidence for the remaining docs-only-build problem
- [ ] do not broaden exclusions speculatively
- [ ] prove any future docs-only skip without breaking runtime-relevant Preview builds
- [ ] close #284 only when its actual current acceptance criteria are met

## HOLD — broad Data Scale #119 / #257 / #260

- [x] #119 metadata corrected from stale P0 to HOLD
- [x] #119 linked to #319 current business decision
- [ ] keep broad Data Scale HOLD unless fresh post-product evidence shows cross-provider depth work has higher user/revenue ROI
- [ ] prefer demand-weighted data quality before broad provider expansion when demand is sparse
- [ ] if reprioritized, recompute all data-dependent inputs and reconcile/revalidate from then-current `main`

## Backlog hygiene

- [ ] review stale Draft #232 in a separate bounded cleanup task; do not delete history or silently discard still-useful decisions
- [x] synchronize `HANDOFF`, `STATUS`, `DECISIONS` and `TODO` through the #319 docs-only update candidate
- [ ] keep future canonical-doc updates consolidated so live GitHub state and docs do not drift again

## Hard boundaries

- [ ] no direct main push
- [ ] no Production DB/schema/data/history by implication
- [ ] no DNS/Auth/write/admin change by implication
- [ ] no workflow dispatch/change by implication
- [ ] no Secrets/Variables change by implication
- [ ] no scheduled-lane re-enable by implication
- [ ] no provider/load experiment by implication
- [ ] no paid/destructive action without approval
- [ ] no automatic RPC retry
- [ ] keep ingestion disabled
- [ ] never touch `supabase/.temp/cli-latest`
- [ ] no Mercari/Amazon scraping
