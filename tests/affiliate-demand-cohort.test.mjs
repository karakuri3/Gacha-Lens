import assert from "node:assert/strict";
import test from "node:test";

import {
  AFFILIATE_DEMAND_COHORT_LIMITS,
  buildAffiliateDemandCohort,
} from "../lib/domain/affiliate-demand-cohort.js";

const NOW = "2026-09-06T12:00:00.000Z";

function variant(id, seriesId = `series-${id}`) {
  return { id, series_id: seriesId };
}

function click(variantId, provider, clickedAt) {
  return { variant_id: variantId, provider, clicked_at: clickedAt };
}

function listing(id, variantId, provider, overrides = {}) {
  return {
    id,
    variant_id: variantId,
    matched_variant_id: null,
    listing_type: "single",
    status: "active",
    review_required: false,
    source: provider,
    last_observed_at: "2026-09-05T12:00:00.000Z",
    listed_at: "2026-09-05T12:00:00.000Z",
    created_at: "2026-09-05T12:00:00.000Z",
    raw: { provider },
    ...overrides,
  };
}

function affiliateRaw(provider = "rakuten_ichiba") {
  return {
    provider,
    affiliate_url: "https://affiliate.example/item",
    affiliate_url_source: provider.startsWith("yahoo") ? "yahoo_api" : "rakuten_api",
    affiliate_url_contract: "verified-contract",
    source_documentation: "https://provider.example/docs",
  };
}

test("requires an explicit valid planning timestamp", () => {
  assert.throws(() => buildAffiliateDemandCohort({
    variants: [],
    outboundClicks: [],
    marketListings: [],
  }), /affiliate_demand_cohort_now_required/);

  assert.throws(() => buildAffiliateDemandCohort({
    variants: [],
    outboundClicks: [],
    marketListings: [],
  }, { now: "not-a-date" }), /affiliate_demand_cohort_now_required/);
});

test("selects clicked Rakuten and Yahoo demand with current safe listings and no affiliate provenance", () => {
  const variants = [variant("v1"), variant("v2"), variant("v3"), variant("v4")];
  const outboundClicks = [
    click("v1", "rakuten", "2026-09-06T10:00:00.000Z"),
    click("v1", "rakuten_ichiba", "2026-09-06T09:00:00.000Z"),
    click("v1", "rakuten", "2026-09-05T09:00:00.000Z"),
    click("v2", "yahoo_shopping", "2026-09-06T11:00:00.000Z"),
    click("v2", "yahoo", "2026-09-05T11:00:00.000Z"),
    click("v3", "rakuten", "2026-09-06T11:30:00.000Z"),
    click("v4", "mercari", "2026-09-06T11:45:00.000Z"),
  ];
  const marketListings = [
    listing("l1", "v1", "rakuten_ichiba"),
    listing("l2", "v1", "rakuten_ichiba", { last_observed_at: "2026-09-06T08:00:00.000Z" }),
    listing("l3", "v2", "yahoo_shopping"),
    listing("l4", "v3", "rakuten_ichiba", { raw: affiliateRaw("rakuten_ichiba") }),
    listing("l5", "v4", "mercari"),
  ];

  const result = buildAffiliateDemandCohort({ variants, outboundClicks, marketListings }, { now: NOW });

  assert.equal(result.mode, "planning_only");
  assert.equal(result.selected_count, 2);
  assert.equal(result.historical_clicks_represented, 5);
  assert.deepEqual(result.targets.map((target) => [target.variant_id, target.provider, target.clicks_in_window]), [
    ["v1", "rakuten", 3],
    ["v2", "yahoo", 2],
  ]);
  assert.deepEqual(result.targets[0].listing_ids, ["l2", "l1"]);
  assert.equal(result.targets[0].affiliate_provenance_present, false);
  assert.deepEqual(result.execution, {
    provider_requests: 0,
    production_writes: 0,
    rpc_calls: 0,
    workflow_dispatches: 0,
    secrets_or_variables_changes: 0,
    approval_reusable: false,
  });
});

test("fails closed on stale, unsafe, unsupported, unknown, or already monetized rows", () => {
  const variants = [variant("eligible"), variant("unsafe"), variant("stale-listing"), variant("monetized"), variant("stale-click")];
  const outboundClicks = [
    click("eligible", "rakuten", "2026-09-06T10:00:00.000Z"),
    click("unsafe", "rakuten", "2026-09-06T10:00:00.000Z"),
    click("stale-listing", "yahoo", "2026-09-06T10:00:00.000Z"),
    click("monetized", "rakuten", "2026-09-06T10:00:00.000Z"),
    click("stale-click", "rakuten", "2026-07-01T10:00:00.000Z"),
    click("missing-catalog", "rakuten", "2026-09-06T10:00:00.000Z"),
    click("eligible", "amazon", "2026-09-06T11:00:00.000Z"),
  ];
  const marketListings = [
    listing("eligible-listing", "eligible", "rakuten_ichiba"),
    listing("unsafe-review", "unsafe", "rakuten_ichiba", { review_required: true }),
    listing("unsafe-bundle", "unsafe", "rakuten_ichiba", { listing_type: "bundle" }),
    listing("stale-listing", "stale-listing", "yahoo_shopping", { last_observed_at: "2026-07-01T00:00:00.000Z" }),
    listing("monetized-listing", "monetized", "rakuten_ichiba", { raw: affiliateRaw("rakuten_ichiba") }),
    listing("missing-catalog-listing", "missing-catalog", "rakuten_ichiba"),
  ];

  const result = buildAffiliateDemandCohort({ variants, outboundClicks, marketListings }, { now: NOW });

  assert.equal(result.selected_count, 1);
  assert.equal(result.targets[0].variant_id, "eligible");
  assert.equal(result.targets[0].provider, "rakuten");
});

test("ranking is deterministic by demand, click recency, listing freshness, then identity", () => {
  const variants = [variant("a"), variant("b"), variant("c"), variant("d")];
  const outboundClicks = [
    click("a", "rakuten", "2026-09-05T08:00:00.000Z"),
    click("a", "rakuten", "2026-09-05T09:00:00.000Z"),
    click("b", "rakuten", "2026-09-05T10:00:00.000Z"),
    click("b", "rakuten", "2026-09-05T11:00:00.000Z"),
    click("c", "yahoo", "2026-09-05T11:00:00.000Z"),
    click("c", "yahoo", "2026-09-05T10:00:00.000Z"),
    click("d", "yahoo", "2026-09-05T11:00:00.000Z"),
  ];
  const marketListings = [
    listing("la", "a", "rakuten_ichiba", { last_observed_at: "2026-09-06T11:00:00.000Z" }),
    listing("lb", "b", "rakuten_ichiba", { last_observed_at: "2026-09-04T11:00:00.000Z" }),
    listing("lc", "c", "yahoo_shopping", { last_observed_at: "2026-09-06T11:30:00.000Z" }),
    listing("ld", "d", "yahoo_shopping", { last_observed_at: "2026-09-06T11:45:00.000Z" }),
  ];

  const result = buildAffiliateDemandCohort(
    { variants, outboundClicks, marketListings },
    { now: NOW, cohortSize: 4 },
  );

  assert.deepEqual(result.targets.map((target) => target.variant_id), ["c", "b", "a", "d"]);
});

test("cohort size is bounded and catalog duplicate identity fails closed", () => {
  assert.equal(AFFILIATE_DEMAND_COHORT_LIMITS.defaultCohortSize, 4);
  assert.equal(AFFILIATE_DEMAND_COHORT_LIMITS.maxCohortSize, 10);

  assert.throws(() => buildAffiliateDemandCohort({
    variants: [],
    outboundClicks: [],
    marketListings: [],
  }, { now: NOW, cohortSize: 11 }), /affiliate_demand_cohort_invalid_cohortSize/);

  assert.throws(() => buildAffiliateDemandCohort({
    variants: [variant("dup", "series-1"), variant("dup", "series-2")],
    outboundClicks: [],
    marketListings: [],
  }, { now: NOW }), /affiliate_demand_cohort_duplicate_variant:dup/);
});
