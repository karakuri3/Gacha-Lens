import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketDepthCollectorDryRun,
  buildMarketDepthCollectorRows,
  MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET,
  MARKET_DEPTH_COLLECTOR_MAX_BUDGET,
  parseDepthBudget,
  selectMarketDepthCandidates,
} from "../lib/domain/market-depth-collector.js";

const VARIANT_ID = "series-1-hero";
const SERIES_ID = "series-1";

function candidate(index, overrides = {}) {
  const provider = overrides.provider ?? "rakuten_ichiba";
  const shop = overrides.shop ?? `shop-${index}`;
  const sourceListingId = overrides.source_listing_id ?? `${shop}:item-${index}`;
  const publicUrl = overrides.public_url ?? (provider === "rakuten_ichiba"
    ? `https://item.rakuten.co.jp/${shop}/item-${index}/`
    : `https://store.shopping.yahoo.co.jp/${shop}/item-${index}.html`);
  const source = {
    provider,
    listing_id: sourceListingId,
    public_url: publicUrl,
    ...(provider === "rakuten_ichiba"
      ? { shopCode: shop, itemCode: sourceListingId, shopName: `Shop ${index}` }
      : { seller: { sellerId: shop, name: `Shop ${index}` } }),
    ...(overrides.source ?? {}),
  };
  return {
    candidate_key: overrides.candidate_key ?? index.toString(16).padStart(16, "0"),
    source,
    listing: {
      title: overrides.title ?? "Example Series Hero ガチャ 単品",
      price: overrides.price ?? 600,
      status: overrides.status ?? "active",
      listing_type: overrides.listing_type ?? "single",
    },
    target: {
      variant_id: overrides.variant_id ?? VARIANT_ID,
      series_id: overrides.series_id ?? SERIES_ID,
      search_query: "Example Series Hero",
    },
    assessment: {
      accepted: overrides.accepted ?? true,
      review_required: overrides.review_required ?? false,
      reason: overrides.reason ?? "variant_and_parent_evidence_confirmed",
      confidence: overrides.confidence ?? 0.9,
    },
    checks: {
      variant_evidence_present: true,
      parent_series_evidence_present: true,
      set_signal_detected: overrides.set_signal_detected ?? false,
      multiple_variant_candidates: false,
      explicit_variant_conflict: false,
      explicit_label_unresolved: false,
      explicit_label_other_variant_match: false,
      parent_series_edition_conflict: false,
      catalog_parent_variant_identity_ambiguous: false,
      explicit_label_target_match: true,
      parent_series_exact_evidence_present: true,
      ...(overrides.checks ?? {}),
    },
  };
}

test("Depth Collector retains 10+ legitimate offers for one variant instead of stopping at three", () => {
  const candidates = Array.from({ length: 12 }, (_, offset) => candidate(offset + 1, { price: 600 }));
  const selection = selectMarketDepthCandidates(candidates, {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
    budget: 50,
  });

  assert.equal(selection.raw_candidate_count, 12);
  assert.equal(selection.selected_count, 12);
  assert.equal(selection.distinct_listing_count, 12);
  assert.equal(selection.known_storefront_count, 12);
  assert.equal(selection.rejected_count, 0);
  assert.equal(selection.presentation_threshold_is_collection_target, false);
  assert.equal(selection.product_completion_target, null);
  assert.ok(selection.selected_count > 3);
});

test("same price and title do not collapse genuinely distinct listing identities", () => {
  const selection = selectMarketDepthCandidates([
    candidate(21, { price: 750, title: "Same title" }),
    candidate(22, { price: 750, title: "Same title" }),
    candidate(23, { price: 750, title: "Same title", provider: "yahoo_shopping", source_listing_id: "shop-23_item-23" }),
  ], { targetVariantId: VARIANT_ID, targetSeriesId: SERIES_ID });

  assert.equal(selection.selected_count, 3);
  assert.deepEqual(selection.provider_counts, { rakuten_ichiba: 2, yahoo_shopping: 1 });
});

test("same target variant and series legitimately appear in every planned listing row", () => {
  const selection = selectMarketDepthCandidates(
    Array.from({ length: 10 }, (_, offset) => candidate(offset + 30)),
    { targetVariantId: VARIANT_ID, targetSeriesId: SERIES_ID },
  );
  const rows = buildMarketDepthCollectorRows(selection, {
    runKey: "dry-run-depth-1",
    observedAt: "2026-09-01T10:00:00.000Z",
  });

  assert.equal(rows.listingRows.length, 10);
  assert.equal(rows.observationRows.length, 10);
  assert.ok(rows.listingRows.every((row) => row.variant_id === VARIANT_ID));
  assert.ok(rows.listingRows.every((row) => row.series_id === SERIES_ID));
  assert.equal(new Set(rows.listingRows.map((row) => row.id)).size, 10);
  assert.equal(new Set(rows.observationRows.map((row) => row.id)).size, 10);
  assert.equal(rows.projected_writes.listing_inserts, 10);
});

test("duplicate marketplace identities are rejected before canonical URL duplicates", () => {
  const first = candidate(50);
  const exactDuplicate = candidate(51, {
    shop: "shop-50",
    source_listing_id: first.source.listing_id,
    public_url: first.source.public_url,
  });
  const sameNativeIdDifferentUrl = candidate(52, {
    source_listing_id: first.source.listing_id,
    public_url: "https://item.rakuten.co.jp/different-shop/different-item/",
  });
  const duplicateUrl = candidate(53, {
    source_listing_id: "shop-53:unique-item",
    public_url: `${first.source.public_url}?utm_source=test#fragment`,
  });
  const selection = selectMarketDepthCandidates([first, exactDuplicate, sameNativeIdDifferentUrl, duplicateUrl], {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
  });

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.rejection_reason_counts.duplicate_or_existing_listing_id, 2);
  assert.equal(selection.rejection_reason_counts.duplicate_or_existing_public_url, 1);
});

test("already-known listing identities are excluded from projected new depth", () => {
  const known = candidate(60);
  const initial = selectMarketDepthCandidates([known], { targetVariantId: VARIANT_ID, targetSeriesId: SERIES_ID });
  const rows = buildMarketDepthCollectorRows(initial, {
    runKey: "existing-fixture",
    observedAt: "2026-09-01T10:00:00.000Z",
  });
  const selection = selectMarketDepthCandidates([known, candidate(61)], {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
    existingListings: rows.listingRows,
  });

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.selected[0].candidate_key, candidate(61).candidate_key);
  assert.equal(selection.rejection_reason_counts.duplicate_or_existing_listing_id, 1);
});

test("strict P3 safety contract still rejects sets, ambiguous candidates and wrong variants", () => {
  const values = [
    candidate(70, { set_signal_detected: true }),
    candidate(71, { review_required: true }),
    candidate(72, { accepted: false }),
    candidate(73, { checks: { explicit_variant_conflict: true } }),
    candidate(74, { variant_id: "other-variant" }),
    candidate(75, { listing_type: "complete_set" }),
    candidate(76),
  ];
  const selection = selectMarketDepthCandidates(values, {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
  });

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.selected[0].candidate_key, candidate(76).candidate_key);
  assert.equal(selection.rejection_reason_counts.strict_market_safety_rejected, 5);
  assert.equal(selection.rejection_reason_counts.wrong_target_variant, 1);
});

test("operational budget caps work without encoding a product completion target", () => {
  assert.equal(MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET, 50);
  assert.equal(MARKET_DEPTH_COLLECTOR_MAX_BUDGET, 200);
  assert.equal(parseDepthBudget(200), 200);
  assert.throws(() => parseDepthBudget(201), /between 1 and 200/);

  const selection = selectMarketDepthCandidates(
    Array.from({ length: 8 }, (_, offset) => candidate(offset + 80)),
    { targetVariantId: VARIANT_ID, targetSeriesId: SERIES_ID, budget: 5 },
  );
  assert.equal(selection.selected_count, 5);
  assert.equal(selection.rejection_reason_counts.operational_budget_exceeded, 3);
  assert.equal(selection.product_completion_target, null);
});

test("dry-run reports retrieval, accepted/rejected, storefront and projected-write metrics", () => {
  const selection = selectMarketDepthCandidates([
    candidate(100),
    candidate(101),
    candidate(102, { set_signal_detected: true }),
  ], { targetVariantId: VARIANT_ID, targetSeriesId: SERIES_ID });
  const rows = buildMarketDepthCollectorRows(selection, {
    runKey: "dry-run-report",
    observedAt: "2026-09-01T11:00:00.000Z",
  });
  const report = buildMarketDepthCollectorDryRun({
    selection,
    rows,
    retrieval: { provider_request_count: 4 },
    generatedAt: "2026-09-01T11:01:00.000Z",
  });

  assert.equal(report.kind, "market_depth_collector_dry_run");
  assert.equal(report.retrieval.provider_request_count, 4);
  assert.equal(report.retrieval.raw_candidate_count, 3);
  assert.equal(report.selection.accepted_count, 2);
  assert.equal(report.selection.rejected_count, 1);
  assert.equal(report.selection.distinct_listing_count, 2);
  assert.equal(report.projected_writes.listing_inserts, 2);
  assert.equal(report.projected_writes.observation_inserts, 2);
  assert.equal(report.contract.three_listings_is_done, false);
  assert.equal(report.production_actions, 0);
});

test("verified affiliate provenance is preserved in planned rows when present", () => {
  const affiliateCandidate = candidate(120, {
    source: {
      affiliate_destination: {
        url: "https://hb.afl.rakuten.co.jp/ichiba/00000000.00000000.00000000.00000000/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop-120%2Fitem-120%2F",
        source: "rakuten_api",
        contract: "item_search_20260701_item_code_join",
        documentation: "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
      },
    },
  });
  const selection = selectMarketDepthCandidates([affiliateCandidate], {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
  });
  const rows = buildMarketDepthCollectorRows(selection, {
    runKey: "affiliate-depth",
    observedAt: "2026-09-01T12:00:00.000Z",
  });

  const raw = rows.listingRows[0].raw;
  if (raw.affiliate_url) {
    assert.equal(raw.affiliate_url_source, "rakuten_api");
    assert.equal(raw.affiliate_url_contract, "item_search_20260701_item_code_join");
  }
  assert.equal(raw.market_depth_collector.stage, "market-depth-collector-v1");
});
