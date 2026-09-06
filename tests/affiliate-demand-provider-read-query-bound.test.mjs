import assert from "node:assert/strict";
import test from "node:test";

import { buildAffiliateDemandProviderReadPlan } from "../lib/domain/affiliate-demand-provider-read.js";

const HEAD = "83b0b36e5d0172f3ea6964206edad6480a13b4bb";

test("exact affiliate provider query fails closed instead of truncating", () => {
  const variantId = "variant-long-query";
  const seriesId = "series-long-query";
  const listingId = "rakuten-long-query";
  const longSeries = `シリーズ${"長".repeat(65)}`;
  const longVariant = `商品${"名".repeat(65)}`;

  assert.throws(() => buildAffiliateDemandProviderReadPlan({
    headSha: HEAD,
    cohortPlan: {
      schema_version: 1,
      generated_at: "2026-09-06T12:00:00.000Z",
      mode: "planning_only",
      requested_cohort_size: 1,
      selected_count: 1,
      historical_clicks_represented: 1,
      targets: [{
        variant_id: variantId,
        series_id: seriesId,
        provider: "rakuten",
        clicks_in_window: 1,
        latest_click_at: "2026-09-06T11:00:00.000Z",
        active_safe_listing_count: 1,
        listing_ids: [listingId],
        affiliate_provenance_present: false,
      }],
      execution: {
        provider_requests: 0,
        production_writes: 0,
        rpc_calls: 0,
        workflow_dispatches: 0,
        secrets_or_variables_changes: 0,
        approval_reusable: false,
      },
    },
    variants: [{ id: variantId, series_id: seriesId, name: longVariant }],
    series: [{ id: seriesId, name: longSeries }],
    marketListings: [{
      id: listingId,
      variant_id: variantId,
      matched_variant_id: null,
      listing_type: "single",
      status: "active",
      review_required: false,
      source: "rakuten",
      source_url: "https://item.rakuten.co.jp/shop/item/",
      raw: { provider: "rakuten_ichiba", itemCode: "shop:item" },
    }],
  }), /exact search query is invalid/);
});
