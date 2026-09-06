import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_DEPTH_R5_MAX_COHORT_SIZE,
  planMarketDepthR5Cohort,
} from "../lib/domain/market-depth-r5-cohort.js";

const NOW = new Date("2026-09-06T08:30:00.000Z");

function variant(id, seriesId, extra = {}) {
  return { id, series_id: seriesId, review_required: false, ...extra };
}

function series(id) {
  return { id };
}

function listing(id, variantId, seriesId, source, extra = {}) {
  return {
    id,
    variant_id: variantId,
    matched_variant_id: variantId,
    series_id: seriesId,
    source,
    status: "active",
    listing_type: "single",
    review_required: false,
    last_observed_at: "2026-09-05T08:30:00.000Z",
    ...extra,
  };
}

function clicks(variantId, timestamps) {
  return timestamps.map((clickedAt, index) => ({ id: `${variantId}-${index}`, variant_id: variantId, clicked_at: clickedAt }));
}

test("plans a balanced four-variant cross-provider cohort weighted by recent demand", () => {
  const variants = [
    variant("buzz", "s-buzz"),
    variant("time", "s-time"),
    variant("buriburi", "s-buri"),
    variant("roz", "s-roz"),
    variant("quiet-r", "s-quiet-r"),
    variant("quiet-y", "s-quiet-y"),
  ];
  const seriesRows = variants.map((row) => series(row.series_id));
  const listings = [
    listing("rakuten-buzz", "buzz", "s-buzz", "rakuten"),
    listing("yahoo-time", "time", "s-time", "yahoo_shopping"),
    listing("rakuten-buri", "buriburi", "s-buri", "rakuten"),
    listing("yahoo-roz", "roz", "s-roz", "yahoo_shopping"),
    listing("rakuten-quiet", "quiet-r", "s-quiet-r", "rakuten"),
    listing("yahoo-quiet", "quiet-y", "s-quiet-y", "yahoo_shopping"),
  ];
  const clickRows = [
    ...clicks("buzz", ["2026-09-01T01:00:00Z", "2026-09-02T01:00:00Z", "2026-09-03T01:00:00Z"]),
    ...clicks("time", ["2026-09-03T02:00:00Z"]),
    ...clicks("buriburi", [
      "2026-08-20T01:00:00Z", "2026-08-21T01:00:00Z", "2026-08-22T01:00:00Z",
      "2026-08-23T01:00:00Z", "2026-08-24T01:00:00Z",
    ]),
    ...clicks("roz", ["2026-08-25T01:00:00Z"]),
  ];

  const plan = planMarketDepthR5Cohort({
    now: NOW,
    cohortSize: 4,
    listings,
    clicks: clickRows,
    variants,
    series: seriesRows,
  });

  assert.equal(plan.complete, true);
  assert.equal(plan.cohort_size_selected, 4);
  assert.deepEqual(plan.targets.map((row) => row.variant_id), ["buzz", "time", "buriburi", "roz"]);
  assert.deepEqual(plan.targets.map((row) => row.target_source), ["yahoo_shopping", "rakuten", "yahoo_shopping", "rakuten"]);
  assert.deepEqual(plan.targets[0].expected_existing_listing_ids, ["rakuten-buzz"]);
  assert.equal(plan.provider_requests, 0);
  assert.equal(plan.production_writes, 0);
  assert.equal(plan.workflow_dispatches, 0);
});

test("fails closed on stale, unsafe, unsupported, multi-depth, or identity-inconsistent rows", () => {
  const variants = [
    variant("valid", "s-valid"),
    variant("stale", "s-stale"),
    variant("review-variant", "s-review", { review_required: true }),
    variant("multi", "s-multi"),
    variant("unsupported", "s-unsupported"),
    variant("wrong-series", "s-canonical"),
  ];
  const seriesRows = ["s-valid", "s-stale", "s-review", "s-multi", "s-unsupported", "s-canonical", "s-wrong"].map(series);
  const listings = [
    listing("valid-1", "valid", "s-valid", "rakuten"),
    listing("stale-1", "stale", "s-stale", "rakuten", { last_observed_at: "2026-07-01T00:00:00Z" }),
    listing("review-1", "review-variant", "s-review", "rakuten"),
    listing("multi-1", "multi", "s-multi", "rakuten"),
    listing("multi-2", "multi", "s-multi", "yahoo_shopping"),
    listing("unsupported-1", "unsupported", "s-unsupported", "other_market"),
    listing("wrong-series-1", "wrong-series", "s-wrong", "rakuten"),
  ];

  const plan = planMarketDepthR5Cohort({
    now: NOW,
    cohortSize: 2,
    listings,
    clicks: [],
    variants,
    series: seriesRows,
  });

  assert.equal(plan.complete, false);
  assert.equal(plan.cohort_size_selected, 1);
  assert.deepEqual(plan.targets.map((row) => row.variant_id), ["valid"]);
  assert.equal(plan.eligible_candidate_count, 1);
});

test("keeps at most one variant per series in the initial cohort", () => {
  const variants = [
    variant("a", "shared"),
    variant("b", "shared"),
    variant("c", "unique"),
  ];
  const plan = planMarketDepthR5Cohort({
    now: NOW,
    cohortSize: 3,
    variants,
    series: [series("shared"), series("unique")],
    listings: [
      listing("a-1", "a", "shared", "rakuten"),
      listing("b-1", "b", "shared", "yahoo_shopping"),
      listing("c-1", "c", "unique", "rakuten"),
    ],
    clicks: [
      ...clicks("a", ["2026-09-05T01:00:00Z", "2026-09-05T02:00:00Z"]),
      ...clicks("b", ["2026-09-05T03:00:00Z"]),
    ],
  });

  assert.equal(plan.complete, false);
  assert.equal(plan.cohort_size_selected, 2);
  assert.equal(new Set(plan.targets.map((row) => row.series_id)).size, 2);
});

test("rejects cohort sizes above the atomic safety ceiling", () => {
  assert.throws(
    () => planMarketDepthR5Cohort({ cohortSize: MARKET_DEPTH_R5_MAX_COHORT_SIZE + 1 }),
    /must be an integer from 1 to 10/,
  );
});
