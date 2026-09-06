# Market Depth R5 — Demand-weighted cross-provider cohort plan

Updated: 2026-09-06 JST

## Why R5 now

The P1 reassessment compared reliability/cost, live user-path correctness, data quality, and current market-data usefulness before returning to Data Scale.

Current SELECT-only Production checkpoint:

- catalog variants: **23,808**
- fresh <30d market-covered variants: **159**
- fresh depth: **157 x1 / 2 x2 / 0 x3+**
- fresh provider coverage: **Yahoo Shopping 96 listings / 95 variants; Rakuten 65 listings / 64 variants**
- depth1 source split: **94 Yahoo-only / 63 Rakuten-only**
- multi-source variants: **0**
- repeated observations exist, so history capture is no longer the primary P0
- sold/completed evidence: **0**
- restock events: **0**
- stock reports: **0**

The next market-data experiment should therefore test whether already-demanded depth1 variants can obtain a second independent offer from the missing provider. This produces more decision-useful evidence than blindly adding four unrelated depth0 variants.

## First bounded cohort

Default cohort size: **4 variants**. Hard ceiling: **10** to remain compatible with the existing atomic depth batch safety boundary.

Eligibility is fail-closed:

1. current listing is fresh within 30 days;
2. `status=active`;
3. `listing_type=single`;
4. listing and variant are not review-required;
5. variant/series identity is internally consistent;
6. exactly one eligible current listing exists for the variant;
7. current source is exactly `rakuten` or `yahoo_shopping`.

Selection priority:

1. outbound clicks in the last 7 days;
2. outbound clicks in the last 30 days;
3. most recent click;
4. freshest current listing;
5. stable variant-id tie break.

Provider direction alternates where possible so the first cohort tests both adapter directions rather than concentrating on one marketplace. The initial cohort also allows only one variant per series.

The measured live candidates currently support a natural 2+2 first experiment. Representative highest-demand depth1 rows are:

- バズ・ライトイヤー — current Rakuten -> target Yahoo Shopping — 3 clicks/7d, 3/30d
- タイムふろしき — current Yahoo Shopping -> target Rakuten — 1/7d, 1/30d
- ぶりぶりざえもん — current Rakuten -> target Yahoo Shopping — 5/30d
- ロズ — current Yahoo Shopping -> target Rakuten — 1/30d

These names are evidence for the current checkpoint, not a frozen Production write manifest. Any later execution must fresh-rebind identities, current depth, provider evidence, and main SHA.

## What this PR does

The R5 planner is pure domain logic. It accepts snapshot rows and emits a deterministic plan. It performs:

- **0 provider requests**
- **0 Production writes**
- **0 workflow dispatches**
- **0 schema/migration changes**

It emits each target's current source, missing target source, expected existing listing identity, and demand evidence so a later provider-specific dry run can be built without guessing selection semantics.

## Later execution gates

This planner does **not** authorize execution.

Before any R5 Production-connected step:

1. #219 / current Supabase billing-cycle residual risk must be rechecked after the planned reset gate.
2. The live category-routing P0 (#252/#253) should be resolved under its applicable Production approval.
3. Recompute the Scoreboard and fresh depth1 candidate set.
4. Fresh-rebind the exact cohort against then-current main and Production rows.
5. Run provider-specific **dry run only** first; no write by implication.
6. Record request ceilings, no-result/rejection reasons, expected affiliate/provenance semantics, and exact candidate identities.
7. Collection-semantics changes require the applicable independent Reviewer + Verifier gate (or a fresh task-specific human substitution where policy allows it).
8. Provider execution, workflow dispatch/mutation, Secrets/Variables changes, RPC invocation, and Production writes each remain behind their applicable explicit approval boundaries.
9. Never reuse #214/#228 authority and never automatically retry an ambiguous RPC.

## Success metric for the first later experiment

The experiment is useful only if it improves user-facing evidence, not merely row counts.

Primary result:
- number of the four demand-weighted variants that move from truthful fresh depth1 to truthful fresh depth2 with an independent missing-provider listing.

Supporting results:
- provider request count and success/no-result/error split;
- exact-match acceptance/rejection rate;
- new multi-source variant count;
- price dispersion created for the target variants;
- no collision/provenance/review regressions;
- bounded Supabase/Cloudflare cost delta.

Do not scale the cohort merely because one write succeeds. Scale only after the measured provider yield and safety/cost evidence justify the next bound.
