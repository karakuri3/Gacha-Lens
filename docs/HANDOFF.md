# Gacha Lens Canonical Handoff

Updated: 2026-09-15 JST — released baseline live; clean T1 business-measurement window active

This file is the active-state handoff. Historical detail remains in Git history and `docs/history/`.

## Resume rule

If a new thread receives only **「Gacha Lens続けて」**:

1. Read `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/TODO.md`, `AGENTS.md`, `docs/AGENT_OS.md`, `docs/PRODUCTION_RELEASE_POLICY.md`, and `docs/AUTO_MERGE_POLICY.md`.
2. **Always re-fetch current `main`** before using an exact SHA.
3. Re-fetch active Issues/PRs, current Supabase usage, Cloudflare Production source, and current Web Analytics state before mutating anything.
4. Do not recreate completed #286/#303/#322/#323 work.
5. Treat #319 as the current business decision gate.
6. For #319 observation, do **not** open `gachalens.com` Production content from the operator/assistant workflow; use Cloudflare management analytics and SELECT-only Production aggregates so the business window stays clean.
7. Keep scheduled write lanes disabled unless separately and explicitly authorized.
8. Keep affiliate/provider Draft stack and broad Data Scale HOLD until fresh post-release evidence reactivates a lane.

## Production baseline

- repo: `karakuri3/Gacha-Lens`
- URL: `https://gachalens.com`
- runtime/DNS: Cloudflare
- Vercel: registrar/non-live rollback only; routine Vercel build status is non-authoritative
- Supabase Production: `vxbrnvfhmzcxehuuzzum` (`gacha-lens-tokyo`, ap-northeast-1)
- old `ihcudkfspzuixsqsvoku` is inactive
- live `main`: fetch at resume time
- released application checkpoint: `8a090d116fda6234c53d327760c9ce1c933fdd6e` (#303)
- canonical docs checkpoint before this sync: `7382c2b48eb2b977cfcbfa824b2df0a3258de07e` (#324)
- Cloudflare Production release verified at 100% traffic on version `c2ede0e8`, linked to `8a090d...`

## Completed release-train work

Do not reopen these merely because older PR bodies describe them as pending:

- #219/#238 recovery/freeze closed
- #281 public-read outage resolved
- #282 emergency containment closed without merge
- #280 scheduled-write safety complete; lanes remain disabled
- #265/#262 Cloudflare standing release governance complete
- #258 runtime/cache proof source binding normalized
- #273 fresh-database forecast migration baseline repaired
- #291/#287 framework security + deterministic vinext validation merged
- #253 Japanese stored category routing repaired
- #261 rerelease canonical year/month repair merged; Official auto still disabled
- #307 stale GitHub Actions cancellation merged
- #309/#320/#321/#324 canonical docs sync work merged
- #323 Production-only outbound-click hardening merged/released
- #285/#286 parent-series edge cache merged/released and #285 closed
- #303 Collector Editorial merged/released
- #322 privacy-minimized demand measurement closed completed
- #232 stale technology-intelligence Draft closed unmerged; useful concept preserved in backlog #326

## Released reliability — #286

Purpose: include canonical `/series/group/:slug` in the existing bounded 30-minute `seriesDetail` Cloudflare edge cache without broad `/series/**` matching.

Final evidence:
- final PR head `e379d70f55b1f2ce03501934e69b4deede984a54`
- merge `b9b8165c73e6ee9290ebadf9f6bd7802c545f7f6`
- independent Reviewer + Verifier PASS
- exact-head Code Quality/runtime/cache proofs PASS
- dedicated parent-series Preview proof: cold `MISS` -> warm `HIT` -> `HIT`, byte-identical HTML, `series-detail-1800-v1`, no `Set-Cookie`
- #303 changed no Worker source, so #286 Worker behavior remains part of current Production release

Do not claim measured Production egress savings without direct measurement.

## Released product baseline — #303 Collector Editorial

#303 is no longer Draft/pending. It is the live product baseline.

Final evidence:
- final PR head `773040deb53020b9da317a7bbe2fd4a492bc2b79`
- merge `8a090d116fda6234c53d327760c9ce1c933fdd6e`
- independent Reviewer + Verifier PASS
- required natural test/lint, compatibility, screenshot, exact-runtime, isolated-cache-proof and Workers build gates PASS
- real Japanese-data visual validation completed at 360/390/desktop through the validation train
- Cloudflare Production directly verified at 100% traffic on version `c2ede0e8`, linked to the merge commit

The next step is not more redesign churn by default. Measure how users behave on this baseline.

## Measurement — #322 / #323

#323 ensures `outbound_clicks` accepts demand events only from canonical HTTPS `gachalens.com`; Preview/noncanonical hosts return 204 before DB insert. Historical click rows were preserved.

Cloudflare Web Analytics was already active and was audited live rather than re-enabled redundantly:
- configured hostname `gachalens.com`
- automatic RUM injection
- mode **Enable, excluding visitor data in the EU**
- Path breakdown available
- no app-side analytics DB/table was added

### Decision-quality accounting boundary

The earlier `T0 = 2026-09-15 00:00 JST` is retained only as instrumentation evidence. Release verification between 00:00 and 00:30 opened Production routes and can appear in Web Analytics, so T0 is **not** the aligned business-decision window.

Use instead:

**T1 = 2026-09-15 00:30 JST**

Rules:
- treat 00:00–00:30 JST as verification-contaminated for Web Analytics;
- use T1 for both Cloudflare Visits/Page views/Path and Production-only `outbound_clicks`;
- do not delete or rewrite old analytics/click evidence;
- do not open Production content from routine #319 operator/assistant observation after T1;
- if the dashboard cannot safely isolate the exact clean interval, wait for a naturally separated window rather than estimate/subtract traffic.

The rolling 24h Web Analytics view observed just after T1 showed 17 Page views / 17 Visits, but it was operator-dominated: Opera 16, Chrome 1, Windows 17, direct 17, with paths matching release verification (`/`, `/ranking`, `/series`, parent-series detail). Treat this as verification evidence, not business demand.

Initial SELECT-only post-T1 `outbound_clicks` seed was 0 events / 0 variants / 0 providers. This is a clean-window seed, **not** a demand verdict.

## Current business gate — #319

The 2026-09-14 SELECT-only scorecard remains the reference for the pre-release state:
- 10,241 series / 23,808 variants
- 176 listings
- 163 variants fresh <30d; 0.6846% fresh coverage
- 161/163 fresh covered variants have only one listing
- 198 observations; 22 re-observed listings; 12.5% re-observation rate
- no new listings/observations in the previous 7d
- stock/restock review-safe signals 0/0
- 34 outbound clicks / 30d, but 23/34 were same-day same-page 3+ provider bursts and therefore not verified organic demand
- 10 verified affiliate-provenance listings, all Rakuten
- exact affiliate-eligible `(variant_id, provider)` clicks 0/34

Truthfulness states:
- Search Console: unavailable through current GSC Wizard access
- PostHog: unavailable in current tool session
- provider revenue/orders: unavailable
- X/social: not instrumented for this decision

### What to do next

Measure the released #303 baseline using aligned post-T1 windows:
1. Cloudflare Visits + Page views
2. route/path mix, especially `/series` and `/series/...`
3. most-viewed detail paths after the sample becomes useful
4. Production-only outbound clicks over the same interval
5. clicked variants/providers
6. affiliate-eligible demand overlap
7. only compute an intent rate where the denominator is meaningful

Then choose:
- **affiliate coverage** if fresh demand overlaps monetizable providers/items, or
- **demand-weighted market-quality/re-observation** if users are looking at pages whose market evidence is shallow/stale.

If fresh demand remains too sparse to choose either lane, do not jump to broad Data Scale by default; prioritize improving qualified discovery/traffic and re-evaluate from real behavior.

## HOLD lanes

### Affiliate/provider stack
#263/#266/#268 and Drafts #264/#267/#269 remain HOLD behind #319. If revived, recompute cohorts from fresh post-T1 data, reconcile onto current main, revalidate migration/config/history assumptions, and keep provider execution/persistence separately approval-bound.

### Broad Data Scale
#119/#257/#260 remain HOLD. #257 and #260 are explicitly titled `[HOLD]`. Prefer demand-weighted data quality unless fresh evidence proves broader expansion has higher user/revenue value.

### Technology-intelligence backlog
#232 is closed unmerged. #326 preserves the useful idea of evaluating external AI/development techniques through current-problem, primary-evidence, system-delta, bounded-experiment, risk and maintenance gates. Revisit only after #319 or when a concrete development bottleneck justifies it; never merge/rebase #232 as-is.

## Cost hygiene

#284 remains open. Docs/workflow-only Cloudflare builds have been observed, and a bounded Build Watch exclusion plan exists, but changing Cloudflare build settings remains a separate approval-bound provider-settings action.

## Scheduled-write safety remains locked

- `P3_BOUNDED_SEED_V2_AUTO_ENABLED=false`
- `OFFICIAL_BOUNDED_AUTO_ENABLED=false`

No release or provider recovery implicitly re-enables either lane.

## Hard boundaries

- no direct main push
- never touch `supabase/.temp/cli-latest`
- keep `.github/workflows/gacha-ingestion.yml` disabled
- no automatic RPC retry
- no Production DB/history mutation by implication
- no provider action by implication
- no workflow dispatch/change by implication
- no Secrets/Variables mutation by implication
- no scheduled-lane re-enable by implication
- no paid/destructive action without approval
- do not scrape Mercari or Amazon
