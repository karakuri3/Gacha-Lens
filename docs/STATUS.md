# Gacha Lens Status

Updated: 2026-09-15 JST — #286/#303 released, measurement baseline active

## Executive state

- Infrastructure migration: **COMPLETE**
- Production runtime / authoritative release path: Cloudflare Worker `gacha-lens`
- **Live `main`: always re-fetch before acting; do not infer it from a hard-coded SHA in this file**
- Verified release checkpoint at this sync: GitHub `8a090d116fda6234c53d327760c9ce1c933fdd6e` (#303), Cloudflare Production version `c2ede0e8`, 100% traffic
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- Fair Use restriction: **CLEARED**
- Scheduled writes remain disabled:
  - `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
  - `OFFICIAL_BOUNDED_AUTO_ENABLED=false`
- #219/#238 recovery/freeze: **CLOSED**
- #280 scheduled-write safety: **CLOSED**
- #281 public-read outage: **RESOLVED**
- #282 emergency containment: **CLOSED UNMERGED**
- #262/#265 Cloudflare cutover/governance: **CLOSED / MERGED**
- #258 runtime/cache proof pinning: **MERGED**
- #273 fresh-database forecast migration baseline: **MERGED**
- #287/#291 framework/security: **MERGED**
- #253 Japanese stored-category routing: **MERGED**
- #261 rerelease canonical year/month: **MERGED**
- #307 CI stale-run cancellation: **MERGED**
- #323 Production-only outbound-click measurement hardening: **MERGED / RELEASED**
- #285/#286 parent-series edge cache: **CLOSED / MERGED / RELEASED**
- #303 Collector Editorial product release: **MERGED / RELEASED**
- #322 privacy-minimized demand measurement: **CLOSED / COMPLETE**
- #319: **ACTIVE P1 BUSINESS DECISION GATE**
- #263/#266/#268 and #264/#267/#269: **HOLD**
- #119/#257/#260 broad Data Scale: **HOLD**
- #284 Cloudflare build-cost hygiene: **OPEN**, separate settings lane

## Released reliability — #285 / #286

#286 extends the existing bounded 30-minute `seriesDetail` Cloudflare cache from `/series/:slug` to exactly `/series/group/:slug` without broadening to arbitrary `/series/**`.

Final release evidence:
- reconciled PR head: `e379d70f55b1f2ce03501934e69b4deede984a54`
- squash merge: `b9b8165c73e6ee9290ebadf9f6bd7802c545f7f6`
- independent Reviewer + Verifier: PASS
- exact-head Code Quality `34855518392`: SUCCESS
- cache proof `34855518389`: SUCCESS
- runtime smoke `34855518434`: SUCCESS
- Cloudflare build `03dba514-9c87-4976-b857-711fd3241bc3`: SUCCESS
- dedicated parent-series proof previously showed cold `MISS` -> warm `HIT` -> `HIT`, byte-identical HTML, marker `series-detail-1800-v1`, and no `Set-Cookie`
- #285 is closed completed

The later #303 release does not modify `worker/index.js`, so the released parent-series cache behavior is preserved in current Production source.

Do **not** claim a measured Production egress saving from #286 without actual before/after traffic measurement.

## Released product baseline — #303 Collector Editorial

#303 replaces generic dashboard/SaaS presentation with object-first collector context, real product imagery, compact evidence and denser series/product comparison while preserving market/data semantics.

Final release evidence:
- reconciled PR head: `773040deb53020b9da317a7bbe2fd4a492bc2b79`
- merge: `8a090d116fda6234c53d327760c9ce1c933fdd6e`
- independent Reviewer + Verifier: PASS
- natural checks passed:
  - test/lint `34856915575`
  - compatibility `34856915830`
  - screenshots `34856915548`
  - exact-head runtime `34856915847`
  - isolated cache proof `34856915789`
  - Cloudflare Workers build `5e69aab5-9673-45dc-b535-cf021fffcffd`
- real Japanese-data multi-viewport validation had already passed through #317/#318
- Cloudflare Production was directly verified at 100% traffic on version `c2ede0e8`, linked to GitHub commit `8a090d...`

This is now the live product-quality baseline for business measurement.

## Measurement layer — #322 / #323

#323 hardened `outbound_clicks` so demand events are accepted only from canonical HTTPS `gachalens.com`; Preview/localhost/noncanonical hosts return 204 before DB insertion. Historical rows were not rewritten.

#322 is closed completed. Live Cloudflare dashboard verification established:
- Web Analytics site configured for `gachalens.com`
- RUM mode: **Enable, excluding visitor data in the EU**
- automatic JS injection
- Path data visible for `/`, `/series`, and `/series/group/...`
- existing Web Analytics values are measurement-readiness evidence, not clean business demand

Fresh measurement epoch:

**T0 = 2026-09-15 00:00 JST**

For #319, do not treat pre-T0 Web Analytics or pre-hardening click residue as fresh post-product demand. Compare the same post-T0 window across Page views / Visits / Path and Production-only outbound clicks.

## P1 business decision — #319

The 2026-09-14 SELECT-only scorecard remains the pre-release/current-state reference:
- 10,241 series / 23,808 variants
- 176 market listings; 175 safe active singles
- 163 variants fresh <30d; fresh coverage **0.6846%**
- depth: 161 variants ×1 listing, 2 ×2, none ×3+
- 198 observations; 22 listings re-observed; 12.5% re-observation rate
- last 7d at that checkpoint: 0 new listings / 0 new observations
- stock/restock review-safe signals: 0 / 0
- outbound clicks: 34 / 30d, 0 / 7d, but 23/34 belonged to same-day same-page 3+ provider bursts and therefore cannot be treated as verified organic demand
- verified affiliate provenance: 10 listings, all Rakuten
- affiliate-eligible exact `(variant_id, provider)` clicks: 0 / 34

Truthfulness states:
- Search Console: `unavailable` through current GSC Wizard access; never convert this to zero or buy a plan by implication
- PostHog: `unavailable` in the current tool session
- provider-reported affiliate revenue/orders: `unavailable`
- X/social: `not_instrumented` for this decision

### Current business policy

#303 is now live, so #319 moves from “wait for product baseline” to **fresh observation**.

Use post-T0 evidence to answer:
1. Is Gacha Lens receiving meaningful use?
2. Which catalog/detail paths are actually viewed?
3. Do users express outbound purchase intent on those paths?
4. Does current demand overlap with affiliate-eligible inventory?
5. If not, which actually used pages/variants deserve deeper/re-observed market data?

Do not invent a conversion rate or demand threshold when sample size/denominator quality is insufficient.

## HOLD lanes

### Affiliate/provider stack
#263/#266/#268 and #264/#267/#269 remain HOLD. Before reuse, recompute demand cohorts from post-T0 evidence, reconcile onto then-current `main`, revalidate migration/history/config state, and preserve separate provider/persistence approvals.

### Broad Data Scale
#119/#257/#260 remain HOLD. Low market coverage alone does not justify broad provider expansion. Prefer demand-weighted data quality unless fresh usage proves broader collection has higher user/revenue ROI.

## Near-term operating order

1. Observe fresh post-T0 usage on the released #303 baseline; keep measurement windows aligned.
2. Continue #319 only from current behavior, not historical 30-day residue.
3. When the sample is decision-useful, choose affiliate coverage vs demand-weighted market-quality/re-observation.
4. Keep affiliate/provider Draft stack and broad Data Scale HOLD until #319 reactivates one.
5. Finish #284 only through a separately approved Cloudflare settings change with measured before/after evidence.
6. Keep scheduled write lanes disabled until separately authorized.
7. Continue normal reliability/security monitoring without reopening completed release trains absent fresh evidence.

## Hard constraints

No direct main push; no Production DB/schema/data/history mutation by implication; no provider execution by implication; no workflow dispatch/change by implication; no Secrets/Variables mutation by implication; no scheduled-lane re-enable by implication; no paid/destructive action without approval; no automatic RPC retry; keep ingestion disabled; never touch `supabase/.temp/cli-latest`; no Mercari/Amazon scraping.
