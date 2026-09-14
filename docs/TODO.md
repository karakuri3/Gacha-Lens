# Gacha Lens Ordered TODO

Updated: 2026-09-15 JST

Infrastructure migration, Fair Use recovery, governance repair, parent-series edge-cache coverage and the Collector Editorial product release are complete. The current operating order is now: measure fresh post-release demand, then choose the next user-value/revenue experiment from #319.

## Completed release / safety train

- [x] #219/#238 recovery/freeze closed
- [x] #281 public-read outage resolved
- [x] #282 closed without merge
- [x] #280 scheduled-write safety complete
- [x] keep `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- [x] keep `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- [x] legacy ingestion remains disabled
- [x] #265/#262 Cloudflare authoritative release path complete
- [x] #258 runtime/cache proof source binding normalized
- [x] #273 fresh-database `forecast_snapshots` baseline restored
- [x] #291/#287 framework/security baseline repaired
- [x] #253 Japanese stored-category routing repaired
- [x] #261 rerelease canonical year/month repair released
- [x] #307 stale CI cancellation merged
- [x] #323 Production-only outbound-click hardening merged/released
- [x] #286 independent Reviewer + Verifier PASS
- [x] #286 exact-head Code Quality/runtime/cache proof PASS
- [x] #286 merged as `b9b8165c73e6ee9290ebadf9f6bd7802c545f7f6`
- [x] #285 closed completed
- [x] #303 independent Reviewer + Verifier PASS
- [x] #303 final natural test/lint, compatibility, screenshot, runtime, cache and Workers build gates PASS
- [x] #303 merged as `8a090d116fda6234c53d327760c9ce1c933fdd6e`
- [x] Cloudflare Production verified at 100% traffic on version `c2ede0e8` linked to #303 merge
- [x] #322 measurement readiness completed and closed
- [ ] re-enable either scheduled write lane only under a new lane-specific approval

## P1 business decision — #319

Pre-release checkpoint already completed:
- [x] fresh 2026-09-14 SELECT-only Production scorecard
- [x] current first-party outbound demand + affiliate overlap audit
- [x] market breadth/depth/history/signals audit
- [x] truthfulness states for unavailable Search Console/PostHog/revenue
- [x] historical click-quality audit: 23/34 prior 30d clicks belong to same-day same-page 3+ provider bursts and are not verified organic demand
- [x] #263/#266/#268 and #264/#267/#269 moved to HOLD
- [x] #323 blocks future noncanonical/Preview click pollution
- [x] Cloudflare Web Analytics verified active for `gachalens.com`
- [x] Path data verified for `/`, `/series`, `/series/group/...`
- [x] clean measurement epoch fixed at **2026-09-15 00:00 JST**

Fresh post-release work:
- [ ] observe Cloudflare Visits / Page views from T0 onward
- [ ] measure catalog/detail path mix over the same window
- [ ] identify most-viewed detail paths only after sample size is useful
- [ ] query Production-only outbound clicks over the same post-T0 window
- [ ] map clicked variants/providers against viewed detail paths where mapping is meaningful
- [ ] recompute affiliate-eligible demand overlap from fresh data
- [ ] do not compute a conversion/intent rate from an invalid or tiny denominator
- [ ] choose affiliate coverage only if current demand makes it a useful experiment
- [ ] otherwise choose demand-weighted market-quality/re-observation on actually used pages/variants
- [ ] do not reactivate broad Data Scale from low catalog coverage alone

Pre-release scorecard reference:
- 10,241 series / 23,808 variants
- 176 market listings
- 163 variants fresh <30d / 0.6846% fresh coverage
- 161/163 fresh covered variants have one listing
- 198 observations / 22 re-observed listings / 12.5% re-observation rate
- 0 new listings and 0 new observations in the prior 7d
- stock/restock review-safe signals 0/0
- verified affiliate provenance 10 listings, all Rakuten
- exact affiliate-eligible prior clicks 0/34

If affiliate execution later wins:
- [ ] recompute #264 cohort from then-current data
- [ ] reconcile #264 onto then-current `main`
- [ ] reconcile/revalidate #267 provider-read binding
- [ ] reconcile/revalidate #269 durable authorization ledger
- [ ] independently review the ledger before release
- [ ] reconcile Production migration/history only through a separate exact-evidence plan; never blind `db push`
- [ ] check config readiness without exposing secret values
- [ ] obtain a fresh exact provider-read approval before any provider call
- [ ] keep provider execution and affiliate-provenance persistence separately gated

## Reliability / cost hygiene — #284

- [x] direct evidence exists that docs/workflow-only changes can still trigger Cloudflare Preview builds
- [x] bounded proposed Build Watch exclusion and rollback plan documented in #284
- [ ] do not mutate Cloudflare Build Watch without separate explicit approval
- [ ] after approval, prove docs-only skip while preserving runtime-relevant Preview builds
- [ ] close #284 only when current acceptance criteria are met

## HOLD — broad Data Scale #119 / #257 / #260

- [x] #119 metadata corrected from stale P0 to HOLD
- [x] #119 linked to #319
- [ ] keep broad Data Scale HOLD unless fresh post-release evidence shows cross-provider depth has higher user/revenue ROI
- [ ] prefer demand-weighted data quality before broad provider expansion when demand is sparse
- [ ] if reprioritized, recompute all data-dependent inputs and reconcile/revalidate from then-current `main`

## Backlog hygiene

- [ ] review stale Draft #232 in a separate bounded cleanup task; do not delete history or silently discard useful decisions
- [x] synchronize canonical docs after #286/#303/#322/#323 state change
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
