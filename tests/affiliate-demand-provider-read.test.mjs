import assert from "node:assert/strict";
import test from "node:test";

import {
  AFFILIATE_DEMAND_PROVIDER_READ_CONFIRMATION,
  AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE,
  buildAffiliateDemandProviderReadDigest,
  buildAffiliateDemandProviderReadPlan,
  expectedAffiliateDemandProviderReadApproval,
  validateAffiliateDemandProviderReadInvocation,
} from "../lib/domain/affiliate-demand-provider-read.js";

const HEAD = "83b0b36e5d0172f3ea6964206edad6480a13b4bb";

function cohort(targets) {
  return {
    schema_version: 1,
    generated_at: "2026-09-06T12:00:00.000Z",
    mode: "planning_only",
    requested_cohort_size: targets.length,
    selected_count: targets.length,
    historical_clicks_represented: targets.reduce((sum, row) => sum + row.clicks_in_window, 0),
    targets,
    execution: {
      provider_requests: 0,
      production_writes: 0,
      rpc_calls: 0,
      workflow_dispatches: 0,
      secrets_or_variables_changes: 0,
      approval_reusable: false,
    },
  };
}

function target(variantId, seriesId, provider, listingIds, clicks = 1) {
  return {
    variant_id: variantId,
    series_id: seriesId,
    provider,
    clicks_in_window: clicks,
    latest_click_at: "2026-09-06T11:00:00.000Z",
    active_safe_listing_count: listingIds.length,
    listing_ids: listingIds,
    affiliate_provenance_present: false,
  };
}

function listing(id, variantId, provider, nativeId, url, overrides = {}) {
  return {
    id,
    variant_id: variantId,
    matched_variant_id: null,
    listing_type: "single",
    status: "active",
    review_required: false,
    source: provider === "rakuten" ? "rakuten" : "yahoo_shopping",
    source_url: url,
    raw: provider === "rakuten"
      ? { provider: "rakuten_ichiba", itemCode: nativeId }
      : { provider: "yahoo_shopping", code: nativeId },
    ...overrides,
  };
}

function fixture() {
  const targets = [
    target("v-r", "s-r", "rakuten", ["r-1", "r-2"], 2),
    target("v-y", "s-y", "yahoo", ["y-1"], 1),
  ];
  return {
    cohortPlan: cohort(targets),
    variants: [
      { id: "v-r", series_id: "s-r", name: "おやすみ" },
      { id: "v-y", series_id: "s-y", name: "タイムふろしき" },
    ],
    series: [
      { id: "s-r", name: "シリーズR" },
      { id: "s-y", name: "シリーズY" },
    ],
    marketListings: [
      listing("r-1", "v-r", "rakuten", "shop:1", "https://item.rakuten.co.jp/shop/item-1/"),
      listing("r-2", "v-r", "rakuten", "shop:2", "https://item.rakuten.co.jp/shop/item-2/"),
      listing("y-1", "v-y", "yahoo", "shop_item-3", "https://store.shopping.yahoo.co.jp/shop/item-3.html"),
    ],
  };
}

test("binds an exact affiliate-demand provider-read envelope with bounded budgets", () => {
  const input = fixture();
  const plan = buildAffiliateDemandProviderReadPlan({ headSha: HEAD, ...input });

  assert.equal(plan.target_count, 2);
  assert.equal(plan.logical_provider_http_requests, 4);
  assert.equal(plan.max_http_attempts, 12);
  assert.equal(plan.configuration_preflight_required, true);
  assert.equal(plan.production_writes, 0);
  assert.equal(plan.persistence_authorized, false);
  assert.equal(plan.historical_clicks_represented, 3);
  assert.deepEqual(plan.requests[0].request_sequence, ["discovery", "affiliate_enrichment"]);
  assert.deepEqual(plan.requests[0].required_configuration, ["RAKUTEN_APPLICATION_ID", "RAKUTEN_ACCESS_KEY", "RAKUTEN_AFFILIATE_ID"]);
  assert.deepEqual(plan.requests[1].required_configuration, ["YAHOO_SHOPPING_APP_ID", "YAHOO_AFFILIATE_TRACKING_ID"]);
  assert.equal(plan.requests[0].listing_evidence.length, 2);
  assert.equal(plan.requests[0].max_http_attempts_per_phase, AFFILIATE_DEMAND_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE);
});

test("fails closed on catalog, listing, provider-native, URL, or affiliate drift", () => {
  const base = fixture();

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    ...base,
    variants: [{ id: "v-r", series_id: "wrong", name: "おやすみ" }, base.variants[1]],
  }), /catalog drift/);

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    ...base,
    marketListings: base.marketListings.map((row) => row.id === "y-1" ? { ...row, source_url: "https://example.com/item" } : row),
  }), /listing drift/);

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    ...base,
    marketListings: base.marketListings.map((row) => row.id === "r-1" ? { ...row, raw: { provider: "rakuten_ichiba", itemCode: "" } } : row),
  }), /listing drift/);

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    ...base,
    marketListings: base.marketListings.map((row) => row.id === "r-1" ? {
      ...row,
      raw: {
        ...row.raw,
        affiliate_url: "https://item.rakuten.co.jp/shop/item-1/",
        affiliate_url_source: "rakuten_api",
        affiliate_url_contract: "contract",
        source_documentation: "docs",
      },
    } : row),
  }), /listing drift/);
});

test("digest and approval token are stable and exactly head-bound", () => {
  const input = fixture();
  const plan = buildAffiliateDemandProviderReadPlan({ headSha: HEAD, ...input });
  const digestA = buildAffiliateDemandProviderReadDigest({ headSha: HEAD, readPlan: plan });
  const digestB = buildAffiliateDemandProviderReadDigest({ headSha: HEAD, readPlan: JSON.parse(JSON.stringify(plan)) });

  assert.equal(digestA, digestB);
  assert.match(digestA, /^[0-9a-f]{64}$/);
  assert.equal(
    expectedAffiliateDemandProviderReadApproval({ headSha: HEAD, readPlan: plan }),
    `${AFFILIATE_DEMAND_PROVIDER_READ_CONFIRMATION}:${HEAD}:${digestA}`,
  );
});

test("dry-run and provider-read authorization stay separate", () => {
  const input = fixture();
  const plan = buildAffiliateDemandProviderReadPlan({ headSha: HEAD, ...input });
  const approval = expectedAffiliateDemandProviderReadApproval({ headSha: HEAD, readPlan: plan });

  const dryRun = validateAffiliateDemandProviderReadInvocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: plan,
    approval: "",
  });
  assert.equal(dryRun.provider_read_authorized, false);
  assert.equal(dryRun.persistence_authorized, false);

  assert.throws(() => validateAffiliateDemandProviderReadInvocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: plan,
    approval,
  }), /must not include/);

  assert.throws(() => validateAffiliateDemandProviderReadInvocation({
    mode: "provider-read",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: plan,
    approval: "wrong",
  }), /approval is invalid/);

  const live = validateAffiliateDemandProviderReadInvocation({
    mode: "provider-read",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    read_plan: plan,
    approval,
  });
  assert.equal(live.provider_read_authorized, true);
  assert.equal(live.configuration_preflight_required, true);
  assert.equal(live.production_writes, 0);
  assert.equal(live.approval_reusable, false);
});

test("rejects inconsistent or over-broad cohort contracts", () => {
  const baseTarget = target("v-0", "s-0", "rakuten", ["l-0"], 1);
  const over = Array.from({ length: 11 }, (_, index) => target(`v-${index}`, `s-${index}`, "rakuten", [`l-${index}`], 1));

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    cohortPlan: cohort(over),
    variants: [],
    series: [],
    marketListings: [],
  }), /cohort safety contract/);

  const inconsistent = cohort([baseTarget]);
  inconsistent.historical_clicks_represented = 99;
  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    cohortPlan: inconsistent,
    variants: [],
    series: [],
    marketListings: [],
  }), /click metric is inconsistent/);
});
