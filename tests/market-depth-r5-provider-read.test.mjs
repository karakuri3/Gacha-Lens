import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketDepthR5ProviderReadDigest,
  buildMarketDepthR5ProviderReadPlan,
  expectedMarketDepthR5ProviderReadApproval,
  validateMarketDepthR5ProviderReadInvocation,
} from "../lib/domain/market-depth-r5-provider-read.js";

const HEAD = "a".repeat(40);

function cohort(overrides = {}) {
  const targets = [
    target("v1", "s1", "rakuten", "yahoo_shopping", "l1"),
    target("v2", "s2", "yahoo_shopping", "rakuten", "l2"),
    target("v3", "s3", "rakuten", "yahoo_shopping", "l3"),
    target("v4", "s4", "yahoo_shopping", "rakuten", "l4"),
  ];
  return {
    schema_version: 1,
    kind: "market_depth_r5_cohort_plan",
    cohort_size_requested: targets.length,
    cohort_size_selected: targets.length,
    complete: true,
    policy: { exact_eligible_depth: 1, one_variant_per_series: true },
    targets,
    provider_requests: 0,
    production_writes: 0,
    workflow_dispatches: 0,
    ...overrides,
  };
}

function target(variantId, seriesId, currentSource, targetSource, listingId) {
  return {
    variant_id: variantId,
    series_id: seriesId,
    current_source: currentSource,
    target_source: targetSource,
    expected_existing_listing_ids: [listingId],
  };
}

function catalog() {
  return {
    variants: [1, 2, 3, 4].map((n) => ({ id: `v${n}`, series_id: `s${n}`, name: `Variant ${n}`, review_required: false })),
    series: [1, 2, 3, 4].map((n) => ({ id: `s${n}`, name: `Series ${n}`, review_required: false })),
  };
}

test("builds an exact four-request missing-provider read plan with bounded attempts", () => {
  const data = catalog();
  const plan = buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...data });
  assert.equal(plan.head_sha, HEAD);
  assert.equal(plan.logical_provider_requests, 4);
  assert.equal(plan.max_http_attempts, 12);
  assert.equal(plan.production_writes, 0);
  assert.equal(plan.rpc_calls, 0);
  assert.equal(plan.workflow_dispatches, 0);
  assert.equal(plan.affiliate_enrichment, false);
  assert.equal(plan.batch_retry_authorized, false);
  assert.equal(plan.approval_reusable, false);
  assert.deepEqual(plan.requests.map((row) => row.target_source), ["yahoo_shopping", "rakuten", "yahoo_shopping", "rakuten"]);
  assert.ok(plan.requests.every((row) => row.max_http_attempts === 3));
});

test("digest and approval token are stable and exactly head-bound", () => {
  const data = catalog();
  const plan = buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...data });
  const digest1 = buildMarketDepthR5ProviderReadDigest({ headSha: HEAD, readPlan: plan });
  const digest2 = buildMarketDepthR5ProviderReadDigest({ headSha: HEAD, readPlan: { ...plan } });
  assert.equal(digest1, digest2);
  assert.match(digest1, /^[0-9a-f]{64}$/);
  assert.equal(expectedMarketDepthR5ProviderReadApproval({ headSha: HEAD, readPlan: plan }), `APPROVE_MARKET_DEPTH_R5_PROVIDER_READ_V1:${HEAD}:${digest1}`);
  assert.throws(() => buildMarketDepthR5ProviderReadDigest({ headSha: "b".repeat(40), readPlan: plan }), /head does not match/);
});

test("dry-run rejects live approval while provider-read requires the exact token", () => {
  const data = catalog();
  const plan = buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...data });
  const approval = expectedMarketDepthR5ProviderReadApproval({ headSha: HEAD, readPlan: plan });
  const dry = validateMarketDepthR5ProviderReadInvocation({ mode: "dry-run", head_sha: HEAD, expected_main_sha: HEAD, read_plan: plan });
  assert.equal(dry.provider_read_authorized, false);
  assert.throws(() => validateMarketDepthR5ProviderReadInvocation({ mode: "dry-run", head_sha: HEAD, expected_main_sha: HEAD, read_plan: plan, approval }), /must not include/);
  assert.throws(() => validateMarketDepthR5ProviderReadInvocation({ mode: "provider-read", head_sha: HEAD, expected_main_sha: HEAD, read_plan: plan, approval: `${approval}x` }), /approval is invalid/);
  const live = validateMarketDepthR5ProviderReadInvocation({ mode: "provider-read", head_sha: HEAD, expected_main_sha: HEAD, read_plan: plan, approval });
  assert.equal(live.provider_read_authorized, true);
  assert.equal(live.logical_provider_requests, 4);
  assert.equal(live.max_http_attempts, 12);
  assert.equal(live.production_writes, 0);
});

test("fails closed on incomplete cohort, provider direction drift, or one-series violation", () => {
  const data = catalog();
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort({ complete: false }), ...data }), /complete fail-closed/);
  const badDirection = cohort();
  badDirection.targets[0] = { ...badDirection.targets[0], target_source: "rakuten" };
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: badDirection, ...data }), /target is invalid/);
  const duplicateSeries = cohort();
  duplicateSeries.targets[1] = { ...duplicateSeries.targets[1], series_id: "s1" };
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: duplicateSeries, ...data }), /one variant per series/);
});

test("fails closed on catalog identity/review drift or missing names", () => {
  const data = catalog();
  const wrongParent = structuredClone(data);
  wrongParent.variants[0].series_id = "s2";
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...wrongParent }), /catalog drift/);
  const review = structuredClone(data);
  review.variants[0].review_required = true;
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...review }), /catalog drift/);
  const missingName = structuredClone(data);
  missingName.series[0].name = "";
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: cohort(), ...missingName }), /catalog drift/);
});

test("hard-fails cohorts above ten requests", () => {
  const targets = Array.from({ length: 11 }, (_, index) => target(`v${index}`, `s${index}`, index % 2 ? "rakuten" : "yahoo_shopping", index % 2 ? "yahoo_shopping" : "rakuten", `l${index}`));
  const plan = cohort({ cohort_size_requested: 11, cohort_size_selected: 11, targets });
  const variants = targets.map((row) => ({ id: row.variant_id, series_id: row.series_id, name: row.variant_id }));
  const series = targets.map((row) => ({ id: row.series_id, name: row.series_id }));
  assert.throws(() => buildMarketDepthR5ProviderReadPlan({ headSha: HEAD, cohortPlan: plan, variants, series }), /target count is invalid/);
});
