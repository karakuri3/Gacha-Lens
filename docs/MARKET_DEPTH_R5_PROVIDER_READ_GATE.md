# Market Depth R5 provider-read gate

Updated: 2026-09-06 JST
Parent program: #119
Planner prerequisite: #256 / Draft #257
Execution-binding issue: #259

## Purpose

R5 cohort selection and live-provider execution are separate approval boundaries.

The cohort planner may select a demand-weighted set with zero external side effects. The provider-read gate then binds that complete cohort to an exact main SHA, fresh catalog identity, one missing-provider root request per target, and a deterministic SHA-256 digest.

This document grants no live provider execution and no Production write authority.

## Bound read-only envelope

For the initial four-target R5 cohort:

- logical provider requests: **4 maximum**;
- exactly one root request per selected target;
- target provider must be the missing provider from `rakuten` / `yahoo_shopping`;
- max HTTP attempts per logical request: **3**;
- absolute HTTP-attempt ceiling for four targets: **12**;
- affiliate enrichment: **disabled**;
- Production writes: **0**;
- RPC calls: **0**;
- workflow dispatches: **0**;
- whole-batch retry: **not authorized**;
- approval token reuse: **not authorized**.

The 10-target planner hard ceiling implies an absolute maximum of 30 HTTP attempts under this contract. A smaller cohort receives a proportionally smaller ceiling.

## Fresh-rebind requirements

Before a provider-read plan can be built, every selected target must still satisfy:

1. complete R5 cohort plan;
2. exact eligible depth=1 contract;
3. one variant per series;
4. current and target providers are opposite supported providers;
5. exactly one expected existing listing identity;
6. variant exists and still belongs to the selected series;
7. variant/series are not review-required;
8. current variant and series names exist for later reviewed provider query construction.

Any drift fails closed before live provider execution.

## Digest and approval token

The read plan is canonicalized and bound to the exact main SHA.

Approval format:

`APPROVE_MARKET_DEPTH_R5_PROVIDER_READ_V1:<40-char-main-sha>:<64-char-sha256-digest>`

The token authorizes only the exact frozen provider-read plan represented by that digest. It does not authorize:

- another main SHA;
- another cohort;
- a larger request or retry budget;
- a second provider for a target;
- affiliate enrichment;
- workflow creation/dispatch;
- Supabase mutation;
- R4/R5 RPC invocation;
- persistence of any provider result;
- retry of the entire batch after ambiguous completion.

Dry-run validation must contain no approval token. A later live-provider execution path must require the exact token and exact current-main equality immediately before requests begin.

## Release order

Current #219/#238 freeze remains authoritative.

After the billing-cycle gate clears:

1. release #258 CI baseline repair first;
2. rebase/revalidate and release #253 category-route fix;
3. synchronize canonical state as required;
4. merge/rebase #257 R5 cohort planner;
5. retarget/revalidate this #259 provider-read binding on the resulting main;
6. fresh-recompute Production Scoreboard and cohort;
7. build the exact read plan/digest;
8. request a fresh human provider-read approval token;
9. execute only the approved bounded read-only provider batch;
10. review results before any separate persistence proposal.

Provider success never implies Production write approval. Persistence remains a later independent gate using the existing atomic/fail-closed contracts.
