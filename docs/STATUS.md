# Gacha Lens Status

Updated: 2026-09-15 JST — released baseline live; T1 clean business-measurement window active

## Executive state

- Infrastructure migration: **COMPLETE**
- Production runtime / authoritative release path: Cloudflare Worker `gacha-lens`
- **Live `main`: always re-fetch before acting; do not infer it from a hard-coded SHA in this file**
- Released application checkpoint: GitHub `8a090d116fda6234c53d327760c9ce1c933fdd6e` (#303), Cloudflare Production version `c2ede0e8`, 100% traffic
- Canonical docs checkpoint before this sync: `7382c2b48eb2b977cfcbfa824b2df0a3258de07e` (#324)
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
- aligned business-measurement epoch: **T1 = 2026-09-15 00:30 JST**
- #263/#266/#268 and #264/#267/#269: **HOLD**
- #119/#257/#260 broad Data Scale: **HOLD**
- #232 stale Draft: **CLOSED UNMERGED**; useful concept preserved in #326 backlog
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
- dedicated parent-series proof showed cold `MISS` -> warm `HIT` -> `HIT`, byte-identical HTML, marker `series-detail-1800-v1`, and no `Set-Cookie`
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
- real Japanese-data multi-viewport validation passed through #317/#318
- Cloudflare Production directly verified at 100% traffic on version `c2ede0e8`, linked to GitHub commit `8a090d...`

This is the live product-quality baseline for business measurement.

## Measurement layer — #322 / #323

#323 hardened `outbound_clicks` so demand events are accepted only from canonical HTTPS `gachalens.com`; Preview/localhost/noncanonical hosts return 204 before DB insertion. Historical rows were not rewritten.

#322 is closed completed. Live Cloudflare dashboard verification established:
- Web Analytics site configured for `gachalens.com`
- RUM mode: **Enable, excluding visitor data in the EU**
- automatic JS injection
- Path data available
- no new first-party pageview/event table was added

### Measurement boundary correction

The earlier `T0 = 2026-09-15 00:00 JST` is **instrumentation evidence only**, not the aligned business window. Operator release verification between 00:00 and 00:30 legitimately entered Cloudflare Web Analytics.

Use:

**T1 = 2026-09-15 00:30 JST**

for #319 decision-quality measurement.

Rules:
- 00:00–00:30 is verification-contaminated for Web Analytics;
- align both Cloudflare analytics and `outbound_clicks` to T1;
- after T1, routine operator/assistant observation must not open Production content;
- use Cloudflare management analytics plus SELECT-only DB aggregates;
- if the UI cannot safely isolate the exact clean interval, wait for a naturally separated window rather than subtract/estimate.

Rolling last-24h Web Analytics immediately after T1 showed **17 Page views / 17 Visits**, but the breakdown was operator-dominated:
- direct 17
- Opera 16 / Chrome 1
- Windows 17 / Desktop 17
- `/` 5, `/ranking` 4, `/series` 3, `/series/group/tarts-y901096` 3

These values match release/Production verification behavior and must not be treated as business demand.

Initial post-T1 SELECT-only `outbound_clicks` seed:
- events: **0**
- distinct variants: 0
- distinct providers: 0

This is not a demand verdict; T1 had only just begun.

## P1 business decision — #319

The 2026-09-14 SELECT-only scorecard remains the pre-release reference:
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

#303 is live and the measurement layer is active. #319 is now in **clean observation** mode.

Use aligned post-T1 evidence to answer:
1. Is Gacha Lens receiving meaningful non-operator use?
2. Which catalog/detail paths are actually viewed?
3. Do users express outbound purchase intent on those paths?
4. Does current demand overlap with affiliate-eligible inventory?
5. If not, which actually used pages/variants deserve deeper/re-observed market data?

Do not invent a conversion rate or demand threshold when sample size/denominator quality is insufficient.

If fresh demand remains too sparse to choose between monetization and market-depth work, do not infer that broad Data Scale is the answer; improve qualified discovery/traffic or other demand-generation work first and re-measure.

## HOLD lanes

### Affiliate/provider stack
#263/#266/#268 and #264/#267/#269 remain HOLD. Before reuse, recompute demand cohorts from post-T1 evidence, reconcile onto then-current `main`, revalidate migration/history/config state, and preserve separate provider/persistence approvals.

### Broad Data Scale
#119/#257/#260 remain HOLD. #257/#260 titles are explicitly marked `[HOLD]`. Low market coverage alone does not justify broad provider expansion. Prefer demand-weighted data quality unless fresh usage proves broader collection has higher user/revenue ROI.

### Technology-intelligence backlog
#232 is closed unmerged. #326 preserves the useful external-tech intake concept. Do not merge/rebase #232 as-is. Revisit #326 only after #319 or when a concrete development bottleneck makes it relevant.

## Near-term operating order

1. Preserve T1 cleanliness: no routine operator/assistant Production page opens.
2. Observe aligned post-T1 Cloudflare Visits/Page views/Paths plus Production-only outbound clicks.
3. Continue #319 only from current behavior, not historical rolling residue.
4. When the sample is decision-useful, choose affiliate coverage vs demand-weighted market-quality/re-observation.
5. If demand is too sparse to make that choice, prioritize qualified discovery/traffic rather than broad Data Scale by default.
6. Keep affiliate/provider Draft stack and broad Data Scale HOLD until #319 reactivates one.
7. Finish #284 only through a separately approved Cloudflare settings change with measured before/after evidence.
8. Keep scheduled write lanes disabled until separately authorized.
9. Continue normal reliability/security monitoring without reopening completed release trains absent fresh evidence.

## Hard constraints

No direct main push; no Production DB/schema/data/history mutation by implication; no provider execution by implication; no workflow dispatch/change by implication; no Secrets/Variables mutation by implication; no scheduled-lane re-enable by implication; no paid/destructive action without approval; no automatic RPC retry; keep ingestion disabled; never touch `supabase/.temp/cli-latest`; no Mercari/Amazon scraping.
