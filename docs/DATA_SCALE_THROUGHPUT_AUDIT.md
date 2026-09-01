# Gacha Lens Data Scale Throughput Audit

Verified: 2026-09-01 JST

Parent program: Issue #119
Audit contract: Issue #124

## Executive result

Gacha Lens market collection is growing, but the current Production architecture is still primarily a **breadth seeder**, not a scalable market-history system.

The current bottleneck is **not simply the P3 hard cap of 25 candidates per run**. The strongest observed losses happen earlier:

1. many target variants return no marketplace candidates,
2. many returned candidates remain review/fail-closed rather than persistence-safe,
3. P3 deliberately keeps one selected listing per variant and one selected variant per series,
4. P1/P2 are manual one-listing canary lanes rather than scalable depth collectors,
5. no Production re-observation lane exists, so every known listing still has only one observation.

The immediate architecture should therefore remain separated into three jobs:

- **Breadth seeding:** keep P3 V2 Auto as the 0→1 discovery lane.
- **Depth collection:** use the reviewed Depth Collector contract from Issue #129 / PR #132 to retain many distinct safe offers for one variant.
- **Re-observation:** use the reviewed re-observation contracts from Issue #128 / PR #131 and Issue #135 / PR #136 to compound known listings into history.

Raising the P3 limit alone would spend more requests without fixing the absence of depth/history and is not the highest-leverage first move.

## 1. Live Production snapshot

Read-only Production queries on 2026-09-01 JST returned:

| Metric | Current value |
| --- | ---: |
| Series | 10,241 |
| Variants | 23,808 |
| Market listings | 107 |
| Market listing observations | 107 |
| Safe active single listings | 106 |
| Safe active variants | 104 |
| Variants with 1 safe active listing | 103 |
| Variants with 2 safe active listings | 0 |
| Variants with 3–4 safe active listings | 1 |
| Variants with 5–9 safe active listings | 0 |
| Variants with 10+ safe active listings | 0 |
| Listings with 2+ observations | 0 |
| `status=sold` listings | 0 |
| `status=sold_out` listings | 1 |
| Yahoo Shopping listings | 57 |
| Rakuten listings | 50 |

### Freshness

Of 106 safe active single listings:

| Freshness window | Listings | Share of safe active |
| --- | ---: | ---: |
| <24h | 13 | 12.3% |
| <7d | 68 | 64.2% |
| <30d | 98 | 92.5% |
| >=30d | 8 | 7.5% |

### Most important history fact

`market_listings = 107` and `market_listing_observations = 107`, with **zero listings having two or more observations**.

That means current known-listing history generation is effectively **0 repeated observations/day**. New-listing inserts create one initial observation, but already-known listings do not yet compound into time-series evidence.

## 2. Recent real growth: 2026-08-24 through 2026-09-01

Production created 95 market listings during the nine-day window.

Daily total listing growth was:

`21 → 13 → 13 → 6 → 3 → 11 → 11 → 9 → 8`

Total rate:

- 95 / 9 days = **10.56 listings/day** across all lanes and canaries.

The marker breakdown is more important than the aggregate:

| Provenance | Rows |
| --- | ---: |
| P3 bounded seed v2 automatic | 86 |
| P3 bounded seed v2 manual | 4 |
| P3 bounded seed v1 | 1 |
| P1 bounded persistence | 1 |
| P2 bounded persistence | 1 |
| P3 seed canary | 1 |
| Series complete-set canary | 1 |
| **Total** | **95** |

Therefore:

- P3 V2 Auto supplied **86 / 95 = 90.5%** of recent listing growth.
- Automatic P3 breadth rate = **86 / 9 = 9.56 new listings/day**.
- P1/P2 contributed only one row each in this period because they are proof/canary lanes, not scheduled scalable collectors.

## 3. P3 V2 Auto: theoretical vs observed throughput

### Current contract

The current workflow `.github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml`:

- runs on `17 */3 * * *`, or eight scheduled opportunities per day,
- is concurrency-bounded through `gacha-market-bounded-v2`,
- has a 40-minute job timeout,
- executes only when the existing automatic gate is enabled and approved.

`lib/domain/market-p3-bounded-seed-v2.js` fixes:

- `P3_BOUNDED_SEED_V2_AUTO_LIMIT = 25`,
- `P3_BOUNDED_SEED_V2_HARD_CAP = 25`,
- unique selected `variant_id`,
- unique selected `series_id`.

This makes the lane intentionally one-listing-per-selected-variant and one-selected-variant-per-series.

### Theoretical ceiling

Eight schedule opportunities/day × 25 persistence candidates = **200 new listings/day**.

Across a nine-day window the theoretical cap is 1,800 rows.

Observed P3 Auto growth was 86 rows, so observed breadth output was:

- **9.56/day**, and
- **4.78% of the theoretical hard-cap capacity** for the same nine-day window.

This does **not** mean GitHub Actions, Rakuten, or Yahoo could safely sustain 200 real writes/day. It only proves the repository hard cap is much higher than current realized output.

### Writing-run distribution

Production markers identify:

- 36 P3 Auto workflow runs that produced at least one persisted row,
- 86 total rows across those writing runs,
- average **2.39 listings per writing run**,
- minimum 1,
- maximum 7.

The observed maximum writing run used only 7 of the possible 25 persistence slots.

This is strong evidence that the present bottleneck is usually before the final hard cap.

## 4. Exact recent funnel: workflow run 33488346438

A sanitized artifact from successful scheduled P3 Auto run `33488346438` was inspected read-only.

The funnel was:

| Stage | Count |
| --- | ---: |
| Requested/selected variants | 25 |
| Queries | 25 |
| Variants with no result | 16 |
| Raw candidate count | 35 |
| Accepted candidates | 17 |
| Review candidates | 18 |
| Final persistence candidates | 6 |
| Listing inserts | 6 |
| Initial observation inserts | 6 |
| Total DB row writes | 12 |

Derived funnel rates:

- no-result targets: **16 / 25 = 64%**,
- review-side candidates: **18 / 35 = 51.4%**,
- persisted listings per requested target: **6 / 25 = 24%**,
- persisted listings per accepted candidate: **6 / 17 = 35.3%**.

The run moved Production from 101→107 listings and 101→107 observations. Every new listing received one initial observation. It created **zero repeated observations of an already-known listing**.

### Interpretation

The 25-row persistence cap was not close to saturation. The run lost capacity primarily through:

1. no-result discovery,
2. strict review/fail-closed filtering,
3. one-per-variant / one-per-series selection,
4. existing-identity/dedup/prewrite constraints.

These safety checks should not be weakened just to raise counts.

## 5. Provider request-budget contract

`lib/fetchers/market-request-budget.js` currently defines:

| Provider | Default root-query limit | Maximum root-query limit |
| --- | ---: | ---: |
| Rakuten Ichiba | 8 | 30 |
| Yahoo Shopping | 24 | 50 |

Additional bounds:

- maximum query attempts per root: 3,
- maximum retry attempts per request: 3,
- maximum affiliate enrichment requests per root: 1.

Yahoo's fetcher enforces request spacing between **1,000 ms and 60,000 ms**, with 1,000 ms as the code default when no override is supplied.

The automatic P3 workflow does not override `YAHOO_SHOPPING_REQUEST_DELAY_MS`; the dedicated P1/P2/manual diagnostic workflows use a more conservative explicit 5,000 ms delay.

### Provider-limit conclusion

Provider pacing and quota contracts matter for any future scale-up, but the measured P3 run above did not saturate the 25-row persistence cap. There is therefore no evidence that simply increasing provider limits is the first-order fix.

Any higher request budget must be justified with observed no-result/review causes and provider-specific quota evidence, not by assuming the current limits are arbitrary.

## 6. P1 and P2 are safety canaries, not scalable depth collectors

### Priority 2

`.github/workflows/gacha-market-p2-bounded-manual.yml` is `workflow_dispatch` only.

It:

- inspects only 1–5 Priority 2 variants per dispatch,
- defaults to read-only dry-run,
- allows `canary-write` only through exact SHA/candidate/digest approval,
- writes an exact one-listing canary when authorized,
- has no schedule.

Its purpose is to prove a safe 1→2 evidence transition, not to fill thousands of variants automatically.

### Priority 1

`.github/workflows/gacha-market-p1-bounded-manual.yml` is also `workflow_dispatch` only.

It:

- inspects only 1–5 Priority 1 variants per dispatch,
- defaults to read-only dry-run,
- allows `canary-write` only through exact SHA/candidate/digest approval,
- writes an exact one-listing canary when authorized,
- has no schedule.

Its purpose is to prove a safe 2→3 transition, not to serve as the permanent depth architecture.

### Consequence

The repository already proved narrow persistence safety, but repeating manual P1/P2 canaries is not a scalable growth strategy. Issue #129 / PR #132 correctly introduces a separate depth-collector contract rather than expanding these proof lanes into bulk collection.

## 7. Bottleneck ranking

### P0 — no repeated-observation Production lane

Evidence:

- 107 listings,
- 107 observations,
- 0 listings with 2+ observations.

Impact:

- no real price trajectory,
- no same-listing availability trajectory,
- no repeated evidence for 7/30/90/365-day change calculations,
- every known marketplace identity stops compounding after discovery.

Highest-leverage architecture work: Issue #128 / PR #131 plus exact provider read Issue #135 / PR #136, followed by a separately approved Production-connected persistence/scheduling phase.

### P0 — no scalable depth lane in Production

Evidence:

- 103 variants have depth 1,
- 0 have depth 2,
- only 1 variant has depth 3–4,
- P1/P2 are manual one-listing canaries,
- P3 intentionally selects one listing per variant/series.

Highest-leverage architecture work: Issue #129 / PR #132, followed by a separately reviewed/approved Production rollout.

### P1 — discovery/no-result recall

Evidence from run `33488346438`:

- 64% of selected targets returned no candidate.

Potential causes include marketplace absence, query recall, catalog/search identity quality, provider coverage and selection targeting. These must be measured separately rather than solved by weakening matching.

### P1 — candidate review/fail-closed rate

Evidence from the same run:

- 18 / 35 candidates were review-side.

This is a major throughput sink, but it is also a truthfulness boundary. Work should classify the review reasons and improve upstream evidence/query quality; matcher/provenance rules should not be weakened merely for volume.

### P2 — hard-cap/request-budget tuning

The current P3 run evidence does not saturate the 25-row persistence cap. Raising caps comes after the earlier losses are understood and after depth/history lanes exist.

## 8. Target separated architecture

### Lane A — Breadth Seeder

Purpose:

- discover first safe market evidence for currently uncovered variants.

Current basis:

- P3 V2 Auto.

Success metric:

- newly covered variants/day,
- not raw request count.

### Lane B — Depth Collector

Purpose:

- retain many genuinely distinct safe offers for the same variant.

Proposed basis:

- Issue #129 / PR #132.

Contract:

- real listing/source/URL identity dedupe,
- same variant and series may appear many times,
- no `3 listings = done` rule,
- explicit operational budget only,
- strict existing matcher/provenance unchanged.

Success metric:

- variants moving 1→2, 2→3–4, 3–4→5–9 and 10+,
- unique listing/storefront depth,
- provider diversity.

### Lane C — Re-observation

Purpose:

- turn every known listing into a time-series asset.

Proposed basis:

- Issue #128 / PR #131,
- Issue #135 / PR #136 exact provider reader.

The current code-only cadence proposal in PR #131 is:

- hot: 6h,
- active: 24h,
- unavailable: 72h.

A successful same-listing recheck adds a new observation even when price/status is unchanged; it does not create a second listing identity.

Success metric:

- observations/listing,
- re-observation rate,
- freshness,
- provider success/throttle/error rates,
- truthful lifecycle transitions.

## 9. Throughput scenarios

These are architecture scenarios, **not Production forecasts or approvals**.

### Current observed state

- automatic breadth: ~9.56 new listings/day,
- all-lane listing growth in measured window: ~10.56/day,
- repeated observations: 0/day.

### History activation using current known listings

If the PR #131 cadence were eventually reviewed, merged and separately approved for Production-connected execution:

- 106 current safe active listings at a normal 24h cadence imply roughly **106 due active rechecks/day** once steady state is reached,
- the one current `sold_out` listing would use the slower unavailable cadence,
- hot listings, if explicitly classified later, could be rechecked more frequently.

Even before discovering many new listings, this would change observation growth from a one-shot dataset into a compounding dataset.

This scenario must still respect provider pacing, quota, exact identity checks, failure handling and an explicit Production rollout gate.

### Combined breadth + history

At the current measured breadth rate plus one normal daily active recheck per current active listing, the order of magnitude would become:

- ~9.6 new listing observations/day from breadth,
- ~106 repeated listing observations/day from known active listings,
- roughly **115 observations/day** before future depth growth.

This is an illustrative steady-state model only. It should be validated first in dry-run/provider-read-only mode.

### Depth activation

PR #132 defines an operational depth budget of default 50 / max 200 candidates, explicitly **not** a product completion target.

The correct scale test is not "can we write 200 rows?" but:

- how many genuinely distinct safe offers are available per target variant,
- how often provider/API budgets are actually reached,
- what rejection reasons dominate,
- whether persistence can remain exact, idempotent and rollback-safe at higher batch sizes.

## 10. Prioritized implementation sequence

1. **Keep P3 Auto unchanged as the current breadth seeder.** Do not raise its cap yet.
2. **Finish independent Verifier/Reviewer gates for PR #131.** It creates the core reusable re-observation contract.
3. **Finish independent Verifier/Reviewer gates for PR #136 after #131.** It provides exact Rakuten/Yahoo read-only rechecks.
4. **Finish independent Verifier/Reviewer gates for PR #132.** It creates the separate multi-offer depth lane.
5. **Use PR #134 Scoreboard after its review gate** so DATA movement is measured daily rather than inferred from PR activity.
6. **Design a separately approval-gated Production re-observation rollout** with dry-run first, small provider-safe batches and measurable failure rates.
7. **Design a separately approval-gated Production depth rollout** after dry-run evidence proves realistic multi-offer yield.
8. **Classify P3 no-result/review reasons at scale** and improve source/query/catalog evidence without weakening strict matching.
9. **Only then tune provider request budgets/caps** from measured API and yield evidence.
10. Continue source expansion under Issue #123; completed/sold evidence remains a separate licensed/partnership track.

## 11. Metrics that should decide the next bottleneck

Daily reporting should include at minimum:

- new listings/day by lane/provider,
- new observations/day split into initial vs repeated observations,
- re-observation rate,
- variants by listing-depth bucket,
- observations/listing depth,
- <24h / <7d / <30d freshness,
- P3 target count → no-result → raw candidates → accepted → review → persisted funnel,
- rejection reason counts,
- provider request counts and success/throttle/error rates,
- average/max persisted rows per writing run,
- affiliate provenance coverage,
- completed/sold evidence count.

Engineering throughput, PR count and agent activity are not substitute business metrics.

## 12. Approval boundaries

This audit authorizes **no Production changes**.

Separate explicit human approval remains required for:

- Production DB inserts/updates/deletes,
- activating a new Production depth or re-observation writer,
- changing Production-capable workflows/schedules/gates,
- `workflow_dispatch` of Production-capable market lanes,
- migrations/schema/backfills/cleanup,
- Secrets or Variables changes,
- paid API activation,
- destructive/irreversible actions.

No recommendation in this document weakens:

- exact marketplace matching,
- source/provenance validation,
- review-required fail-closed behavior,
- listing/storefront/merchant identity separation,
- the rule that `sold_out` is not completed-sale evidence,
- the rule that three listings is only a presentation threshold.

## 13. Evidence inventory

This audit used only read-only evidence:

- Production Supabase aggregate SQL on 2026-09-01 JST,
- current `main` repository files,
- sanitized GitHub Actions artifacts/log metadata,
- existing reviewed issue/PR contracts.

Key repository evidence:

- `.github/workflows/gacha-market-p3-bounded-seed-v2-auto.yml`
- `.github/workflows/gacha-market-p2-bounded-manual.yml`
- `.github/workflows/gacha-market-p1-bounded-manual.yml`
- `lib/domain/market-p3-bounded-seed-v2.js`
- `lib/fetchers/market-request-budget.js`
- `lib/fetchers/yahoo-shopping-fetcher.js`
- PR #131 branch `lib/domain/market-reobservation.js` for the unmerged cadence proposal

Key Production/Actions evidence:

- Production snapshot: 10,241 series / 23,808 variants / 107 listings / 107 observations,
- nine-day market growth: 95 listings,
- P3 Auto marker: 86 rows from 36 writing runs,
- exact analyzed scheduled run: `33488346438`.

## Final disposition

The Data Scale bottleneck is now specific:

> Gacha Lens does not primarily need a larger version of the current P3 canary architecture. It needs **separate breadth, depth and re-observation lanes**, with the latter two already represented by code-only Draft PRs awaiting independent gates.

The next largest DATA gain per engineering effort is to complete the independent review gates for the existing re-observation/depth implementations, then prove Production-connected dry-run/rollout behavior under the existing approval policy. Raising P3 caps comes later, based on measured no-result/review/provider evidence.
