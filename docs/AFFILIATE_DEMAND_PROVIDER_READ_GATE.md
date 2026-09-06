# P1 Affiliate Demand Provider-Read Gate

Issue: #266  
Stacked after: Draft PR #264 / Issue #263  
Status: non-Production execution binding only

## Decision

The next monetization experiment should first target **already-observed outbound demand that already has safe market identity**, rather than spend provider budget on generic catalog depth.

The #264 planner selects exact `(variant_id, provider)` pairs from recent first-party clicks. This gate binds that planning result to a narrow external-provider read envelope before any live Rakuten/Yahoo request is allowed.

This file and its code do not execute the experiment.

## Binding contract

`buildAffiliateDemandProviderReadPlan()` is pure and performs no I/O. It requires:

- an exact 40-character current-main SHA;
- a valid planning-only #264 cohort;
- fresh variant and parent-series rows;
- exact current `market_listings` rows for every selected listing ID.

For each target it fails closed unless:

1. variant -> series identity still matches;
2. variant and series names are present and neither row is review-required;
3. every planned listing still exists;
4. listing variant identity is unambiguous;
5. listing provider identity is unambiguous and matches the exact clicked provider;
6. listing remains active / single / non-review-required;
7. provider-native identity exists (`itemCode` / `source_listing_id` for Rakuten, `code` / `source_listing_id` for Yahoo);
8. the public URL is HTTPS on the expected provider host;
9. verified affiliate provenance is still absent;
10. the exact listing count still matches the cohort plan.

The plan binds series/variant names plus listing IDs, provider-native IDs and public URLs into deterministic request keys.

## Exact query binding

A future executor is **not allowed to choose its own broad search term**. Each target carries exactly one deterministic query:

`<series name> <variant name> ガチャ`

Contract:

- query profile: `affiliate_demand_exact_variant_v1`;
- query strategy version: `1`;
- maximum query length: 120 characters; over-length input fails closed rather than truncating silently;
- fallback queries: prohibited;
- the exact query is part of the request key and final SHA-256 approval digest;
- changing the query or request key after binding invalidates the plan.

This deliberately avoids inheriting broad/rotating market-discovery behavior. The dedicated later executor must pass this exact single root query into the provider request path with no generated fallback expansion.

## Provider request budget

A future dedicated executor may use only this two-phase sequence per target:

1. `discovery`
2. `affiliate_enrichment`

Budget:

- maximum targets: 10;
- logical provider HTTP requests per target: 2;
- maximum HTTP attempts per phase: 3;
- default #264 cohort of 4 therefore binds at most 8 logical provider HTTP requests / 24 HTTP attempts.

This is a **ceiling**, not a target. Successful first attempts must not be retried. Whole-batch retry is not authorized.

The general/broad market discovery executor must not be invoked merely because this plan exists. A later executor must enforce this exact bounded contract.

## Configuration preflight

The plan contains configuration **names only**, never values. Immediately before a later provider call, the executor must independently verify required configuration without printing or returning secret values.

Rakuten requires:

- `RAKUTEN_APPLICATION_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_AFFILIATE_ID`

Yahoo requires:

- `YAHOO_SHOPPING_APP_ID`
- `YAHOO_AFFILIATE_TRACKING_ID`

Yahoo ValueCommerce readiness is not inferred from database rows. Missing/invalid configuration must fail closed. Creating/changing configuration is a separate approval boundary.

## Exact approval binding

The canonical provider-read plan is SHA-256 bound to exact current main.

Approval format:

`APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:<40-char-main-sha>:<64-char-digest>`

Rules:

- dry-run rejects any approval token;
- provider-read mode requires exact current-main equality and exact token equality;
- approval is non-reusable;
- the pure binder does **not** provide durable one-time consumption enforcement;
- a future executor must consume/record authorization safely before the first provider request and fail closed on ambiguous/replayed completion.

## Persistence is separate

A successful provider response is still read-only evidence. This gate authorizes:

- Production writes: 0
- RPC calls: 0
- workflow dispatches: 0
- Secrets/Variables changes: 0
- affiliate-provenance persistence: not authorized
- public CTA/ranking/trend/forecast changes: 0

Persisting newly verified affiliate provenance requires a separate Production-write gate after exact provider-issued provenance validation.

## Success metrics

The first later live cohort should measure:

- targets requested under the exact bound envelope;
- targets returning valid provider-issued affiliate provenance;
- future naturally occurring affiliate-eligible click share after separately approved persistence;
- provider-reported orders/revenue only from a trustworthy provider report.

Historical clicks represented by a cohort are prioritization evidence only. They are not orders, conversion, EPC, forecast revenue or realized revenue.

## Current freeze

#219/#238 remain authoritative. This stacked implementation stays Draft/non-Production while the current billing-cycle/Fair Use gate is open. It authorizes no provider request or Production merge.
