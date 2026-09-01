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
  const sourceListingId = overrides.source_listing_id ?? (provider === "rakuten_ichiba" ? `${shop}:item-${index}` : `${shop}_item-${index}`);
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

function selectionFor(values, options = {}) {
  return selectMarketDepthCandidates(values, {
    targetVariantId: VARIANT_ID,
    targetSeriesId: SERIES_ID,
    ...options,
  });
}

test("Depth Collector retains 10+ legitimate offers for one variant instead of stopping at three", () => {
  const candidates = Array.from({ length: 12 }, (_, offset) => candidate(offset + 1, { price: 600 }));
  const selection = selectionFor(candidates, { budget: 50 });

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
  const selection = selectionFor([
    candidate(21, { price: 750, title: "Same title" }),
    candidate(22, { price: 750, title: "Same title" }),
    candidate(23, { price: 750, title: "Same title", provider: "yahoo_shopping" }),
  ]);

  assert.equal(selection.selected_count, 3);
  assert.deepEqual(selection.provider_counts, { rakuten_ichiba: 2, yahoo_shopping: 1 });
});

test("same target variant and series legitimately appear in every planned listing row", () => {
  const selection = selectionFor(Array.from({ length: 10 }, (_, offset) => candidate(offset + 30)));
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

test("duplicate marketplace identities are rejected deterministically", () => {
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
  const selection = selectionFor([first, exactDuplicate, sameNativeIdDifferentUrl, duplicateUrl]);

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.rejection_reason_counts.duplicate_or_existing_listing_id, 2);
  assert.equal(selection.rejection_reason_counts.duplicate_or_existing_public_url, 1);
});

test("duplicate candidate keys are all rejected instead of choosing an arbitrary winner", () => {
  const key = "aaaaaaaaaaaaaaaa";
  const selection = selectionFor([
    candidate(54, { candidate_key: key }),
    candidate(55, { candidate_key: key }),
    candidate(56),
  ]);

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.selected[0].candidate_key, candidate(56).candidate_key);
  assert.equal(selection.rejection_reason_counts.duplicate_candidate_key, 2);
});

test("already-known listing identities are excluded from projected new depth", () => {
  const known = candidate(60);
  const initial = selectionFor([known]);
  const rows = buildMarketDepthCollectorRows(initial, {
    runKey: "existing-fixture",
    observedAt: "2026-09-01T10:00:00.000Z",
  });
  const selection = selectionFor([known, candidate(61)], { existingListings: rows.listingRows });

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
  const selection = selectionFor(values);

  assert.equal(selection.selected_count, 1);
  assert.equal(selection.selected[0].candidate_key, candidate(76).candidate_key);
  assert.equal(selection.rejection_reason_counts.strict_market_safety_rejected, 5);
  assert.equal(selection.rejection_reason_counts.wrong_target_variant, 1);
});

test("zero and negative prices remain fail closed through the reused strict safety contract", () => {
  const selection = selectionFor([
    candidate(77, { price: 0 }),
    candidate(78, { price: -1 }),
    candidate(79, { price: 500 }),
  ]);
  assert.equal(selection.selected_count, 1);
  assert.equal(selection.rejection_reason_counts.strict_market_safety_rejected, 2);
});

test("operational budget caps work without encoding a product completion target", () => {
  assert.equal(MARKET_DEPTH_COLLECTOR_DEFAULT_BUDGET, 50);
  assert.equal(MARKET_DEPTH_COLLECTOR_MAX_BUDGET, 200);
  assert.equal(parseDepthBudget(200), 200);
  assert.throws(() => parseDepthBudget(201), /between 1 and 200/);

  const selection = selectionFor(Array.from({ length: 8 }, (_, offset) => candidate(offset + 80)), { budget: 5 });
  assert.equal(selection.selected_count, 5);
  assert.equal(selection.rejection_reason_counts.operational_budget_exceeded, 3);
  assert.equal(selection.product_completion_target, null);
});

test("row builder rejects target drift after selection", () => {
  const selection = selectionFor([candidate(90)]);
  selection.selected[0].target.variant_id = "tampered-variant";
  assert.throws(() => buildMarketDepthCollectorRows(selection, {
    runKey: "target-tamper",
    observedAt: "2026-09-01T10:00:00.000Z",
  }), /selection identity binding|target drifted/);
});

test("row builder rejects marketplace identity drift after selection", () => {
  const selection = selectionFor([candidate(91)]);
  selection.selected[0].source.public_url = "https://item.rakuten.co.jp/shop-91/different-item/";
  assert.throws(() => buildMarketDepthCollectorRows(selection, {
    runKey: "identity-tamper",
    observedAt: "2026-09-01T10:00:00.000Z",
  }), /selection identity binding/);
});

test("row builder rejects selection metadata tampering", () => {
  const selection = selectionFor([candidate(92)]);
  selection.selected_candidate_keys = ["bbbbbbbbbbbbbbbb"];
  assert.throws(() => buildMarketDepthCollectorRows(selection, {
    runKey: "metadata-tamper",
    observedAt: "2026-09-01T10:00:00.000Z",
  }), /selection identity binding/);
});

test("dry-run reports retrieval, accepted/rejected, storefront and projected-write metrics", () => {
  const selection = selectionFor([
    candidate(100),
    candidate(101),
    candidate(102, { set_signal_detected: true }),
  ]);
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

test("dry-run projected write output is sanitized to non-negative integer counts", () => {
  const report = buildMarketDepthCollectorDryRun({
    selection: {
      selected_count: 1,
      operational_budget: 50,
      raw_candidate_count: 1,
    },
    rows: {
      projected_writes: {
        listing_inserts: 1,
        observation_inserts: 1,
        listing_updates: -10,
        observation_updates: "bad",
        deletes: 4.5,
      },
    },
  });
  assert.deepEqual(report.projected_writes, {
    listing_inserts: 1,
    observation_inserts: 1,
    listing_updates: 0,
    observation_updates: 0,
    deletes: 0,
  });
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
  const selection = selectionFor([affiliateCandidate]);
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
