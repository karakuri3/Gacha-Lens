# P1 Affiliate Demand Cohort Plan

Issue: #263
Status: planning-only experiment under #219/#238 Production freeze

## Decision

The next bounded business experiment is **affiliate demand coverage**, not generic market-depth expansion.

2026-09-06 JST SELECT-only Production evidence:

- outbound clicks: 72 lifetime / 42 last 30d / 4 last 7d / 0 last 24h;
- 15 distinct variants received a click in the last 30d;
- market data: 172 listings / 168 variants with market evidence / 194 observations;
- verified affiliate-provenance listings: 10, all Rakuten;
- affiliate-eligible clicks under the existing Scoreboard contract: **0 / 42**;
- clicked variants with any verified affiliate listing: **0 / 15**.

Several clicked variants already have safe active Rakuten/Yahoo single-item listings, but none of those listings carries complete affiliate provenance. That makes the smallest useful P1 experiment demand-to-monetization alignment rather than arbitrary additional depth.

Traffic remains an unavailable panel while connected Search Console tooling is subscription-blocked. Revenue remains unavailable until a verified affiliate-provider report is connected. Neither state may be converted to zero.

## Planner contract

`buildAffiliateDemandCohort()` is a pure deterministic planner. It performs no I/O.

Inputs:

- current catalog variants;
- first-party `outbound_clicks` rows;
- current `market_listings` rows;
- an explicit planning timestamp.

Default policy:

- click window: 30 days;
- listing freshness: 30 days;
- cohort size: 4;
- hard cohort ceiling: 10;
- supported monetization providers: Rakuten and Yahoo Shopping only.

A target is eligible only when:

1. the clicked `variant_id` exists exactly once in the supplied catalog and has a parent `series_id`;
2. the click is inside the configured window and not future-dated;
3. provider normalizes to `rakuten` or `yahoo`;
4. the same exact variant/provider pair has at least one fresh, active, single-item, non-review-required listing;
5. no current eligible listing for that exact pair already carries all four verified provenance fields:
   - `affiliate_url`;
   - `affiliate_url_source`;
   - `affiliate_url_contract`;
   - `source_documentation`.

Ranking is deterministic:

1. click count in the window, descending;
2. latest click, descending;
3. latest safe listing observation, descending;
4. variant ID;
5. provider.

Each target reports the exact existing listing IDs that establish current market identity. Planning output also reports historical clicks represented by the selected cohort. That value is an experiment-priority metric only; it is **not revenue, orders, conversion, EPC, or forecast evidence**.

## Fail-closed requirements

The planner rejects or excludes:

- missing/invalid explicit planning time;
- invalid cohort/window bounds;
- duplicate catalog variant identity;
- unknown catalog variants;
- unsupported providers;
- stale/future clicks;
- stale listings;
- sold/inactive listings;
- bundles/non-single listings;
- review-required listings;
- listings without stable IDs;
- variant/provider pairs already carrying verified affiliate provenance.

No implicit wall-clock fallback is permitted.

## Side-effect contract

Planning output must always state:

- provider requests: 0;
- Production writes: 0;
- RPC calls: 0;
- workflow dispatches: 0;
- Secrets/Variables changes: 0;
- approval reusable: false.

This planner does not read credentials, call Rakuten/Yahoo, generate affiliate destinations, update listings, or alter public CTA behavior.

## Later execution boundary

A future live experiment must be designed and approved separately.

Before any provider request:

1. re-fetch current `main` and fresh click/listing/catalog state;
2. recompute the cohort rather than reusing an old snapshot;
3. bind exact target identity, provider, current listing evidence, request ceiling, and approval token/digest;
4. independently establish that the provider's affiliate configuration is valid without exposing credential values;
5. obtain the applicable provider-execution approval;
6. make no Production write by implication.

Persistence of provider-issued affiliate provenance is a separate Production write gate. Workflow dispatch/change, Secret/Variable creation/change, billing actions, manual forcing of a natural schedule, and Yahoo ValueCommerce activation remain separate approval boundaries.

## Success metrics

For the first approved bounded cohort, measure independently:

- historical click demand represented by selected targets;
- fraction of selected targets for which the provider returns verified affiliate provenance;
- future naturally occurring affiliate-eligible click share after separately approved persistence;
- provider-reported orders/revenue only when a trustworthy report source is connected.

Do not use affiliate status or commission in ranking, trend, forecast, recommendation scoring, or editorial ordering.

## Relationship to R5

Draft #257/#260 remain useful engineering assets, but P1 evidence now says generic depth work should not automatically outrank this monetization experiment. After the #219/#238 freeze clears and the release train stabilizes, choose between #263 and further R5 execution using fresh business evidence rather than PR age or sunk engineering effort.
