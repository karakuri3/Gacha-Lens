import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  buildMarketReobservationDryRun,
  marketReobservationObservationId,
  normalizeRakutenReobservationResponse,
  normalizeYahooReobservationResponse,
  planMarketReobservation,
  selectDueMarketReobservations,
} from "../lib/domain/market-reobservation.js";

function listingFixture(overrides = {}) {
  const provider = overrides.provider ?? "rakuten_ichiba";
  const sourceListingId = overrides.source_listing_id ?? (provider === "rakuten_ichiba" ? "test-shop:item-1" : "test-shop_item-1");
  const publicUrl = overrides.public_url ?? (provider === "rakuten_ichiba"
    ? "https://item.rakuten.co.jp/test-shop/item-1/"
    : "https://store.shopping.yahoo.co.jp/test-shop/item-1.html");
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  const id = buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title: "Example ガチャ 単品" });
  return {
    id,
    variant_id: "variant-1",
    matched_variant_id: "variant-1",
    series_id: "series-1",
    title: "Example ガチャ 単品",
    listing_type: "single",
    market_review_type: "single",
    price: overrides.price ?? 500,
    status: overrides.status ?? "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    listed_at: overrides.listed_at ?? "2026-08-31T00:00:00.000Z",
    last_observed_at: overrides.last_observed_at ?? "2026-09-01T00:00:00.000Z",
    raw: {
      provider,
      source_listing_id: sourceListingId,
      public_url: publicUrl,
    },
    ...overrides,
  };
}

function seenResult(listing, overrides = {}) {
  return {
    outcome: "seen",
    provider: listing.raw.provider,
    source_listing_id: listing.raw.source_listing_id,
    public_url: listing.source_url,
    price: listing.price,
    status: listing.status,
    ...overrides,
  };
}

test("one known listing can accumulate 3+ append-only observations across separate windows", () => {
  const listing = listingFixture();
  const plans = [
    planMarketReobservation({ listing, providerResult: seenResult(listing), observedAt: "2026-09-02T00:00:00.000Z", observationKey: "run-1" }),
    planMarketReobservation({ listing, providerResult: seenResult(listing), observedAt: "2026-09-03T00:00:00.000Z", observationKey: "run-2" }),
    planMarketReobservation({ listing, providerResult: seenResult(listing), observedAt: "2026-09-04T00:00:00.000Z", observationKey: "run-3" }),
  ];

  assert.deepEqual(plans.map((plan) => plan.outcome), ["unchanged", "unchanged", "unchanged"]);
  assert.equal(new Set(plans.map((plan) => plan.writes.observation_insert.id)).size, 3);
  assert.ok(plans.every((plan) => plan.writes.observation_insert.price === 500));
  assert.ok(plans.every((plan) => plan.writes.listing_update.changes.price === 500));
});

test("same logical run is retry-idempotent even when price is unchanged", () => {
  const listing = listingFixture();
  const input = {
    listing,
    providerResult: seenResult(listing),
    observedAt: "2026-09-02T00:00:00.000Z",
    observationKey: "scheduled-33488346438",
  };
  const first = planMarketReobservation(input);
  const retry = planMarketReobservation(input);

  assert.equal(first.writes.observation_insert.id, retry.writes.observation_insert.id);
  assert.equal(first.writes.observation_insert.id, marketReobservationObservationId({
    listingId: listing.id,
    provider: "rakuten_ichiba",
    observationKey: "scheduled-33488346438",
  }));
});

test("price change appends new evidence and only plans allowlisted current snapshot changes", () => {
  const listing = listingFixture({ price: 500 });
  const plan = planMarketReobservation({
    listing,
    providerResult: seenResult(listing, { price: 680 }),
    observedAt: "2026-09-02T01:00:00.000Z",
    observationKey: "run-price-change",
  });

  assert.equal(plan.outcome, "price_changed");
  assert.equal(plan.price_changed, true);
  assert.equal(plan.status_changed, false);
  assert.equal(plan.writes.observation_insert.price, 680);
  assert.deepEqual(Object.keys(plan.writes.listing_update.changes).sort(), ["last_observed_at", "price", "status", "updated_at"]);
  assert.equal(plan.writes.listing_update.changes.price, 680);
  assert.equal(listing.price, 500, "planning must not mutate the historical/current fixture object");
});

test("reappearance after unavailable state is represented as a status change without deleting history", () => {
  const listing = listingFixture({ status: "sold_out", price: 500 });
  const plan = planMarketReobservation({
    listing,
    providerResult: seenResult(listing, { status: "active" }),
    observedAt: "2026-09-05T00:00:00.000Z",
    observationKey: "run-reappeared",
  });

  assert.equal(plan.outcome, "status_changed");
  assert.equal(plan.status_changed, true);
  assert.equal(plan.writes.observation_insert.status, "active");
  assert.equal(plan.writes.listing_update.changes.status, "active");
  assert.equal(plan.writes.listing_update.changes.sold_at, undefined);
});

test("not-found, throttling and provider failures create no false listing lifecycle mutation", () => {
  const listing = listingFixture();
  for (const outcome of ["not_found", "throttled", "provider_error"]) {
    const plan = planMarketReobservation({
      listing,
      providerResult: { outcome, provider: "rakuten_ichiba", reason: `fixture_${outcome}` },
      observedAt: "2026-09-02T02:00:00.000Z",
      observationKey: `run-${outcome}`,
    });
    assert.equal(plan.outcome, outcome);
    assert.equal(plan.writes.observation_insert, null);
    assert.equal(plan.writes.listing_update, null);
  }
});

test("completed/sold semantics cannot be fabricated by the ordinary re-observation lane", () => {
  const listing = listingFixture();
  const plan = planMarketReobservation({
    listing,
    providerResult: seenResult(listing, { status: "sold" }),
    observedAt: "2026-09-02T03:00:00.000Z",
    observationKey: "run-false-sold",
  });

  assert.equal(plan.outcome, "provider_error");
  assert.equal(plan.reason, "invalid_seen_payload");
  assert.equal(plan.writes.observation_insert, null);
  assert.equal(plan.writes.listing_update, null);
});

test("provider listing identity mismatch fails closed", () => {
  const listing = listingFixture();
  const cases = [
    { source_listing_id: "test-shop:other-item" },
    { public_url: "https://item.rakuten.co.jp/test-shop/other-item/" },
    { provider: "yahoo_shopping" },
  ];

  for (const mismatch of cases) {
    const plan = planMarketReobservation({
      listing,
      providerResult: seenResult(listing, mismatch),
      observedAt: "2026-09-02T04:00:00.000Z",
      observationKey: `mismatch-${Object.keys(mismatch)[0]}`,
    });
    assert.equal(plan.outcome, "identity_mismatch");
    assert.equal(plan.writes.observation_insert, null);
    assert.equal(plan.writes.listing_update, null);
  }
});

test("Rakuten and Yahoo exact response adapters preserve stable provider identities", () => {
  const rakuten = normalizeRakutenReobservationResponse({
    itemCode: "shop:item-9",
    itemUrl: "https://item.rakuten.co.jp/shop/item-9/",
    itemPrice: 790,
    availability: 1,
  });
  assert.deepEqual(rakuten, {
    outcome: "seen",
    provider: "rakuten_ichiba",
    source_listing_id: "shop:item-9",
    public_url: "https://item.rakuten.co.jp/shop/item-9/",
    price: 790,
    status: "active",
    reason: "rakuten_exact_item_response",
  });

  const yahoo = normalizeYahooReobservationResponse({
    code: "shop_item-9",
    url: "https://store.shopping.yahoo.co.jp/shop/item-9.html",
    price: 820,
    inStock: false,
  });
  assert.equal(yahoo.provider, "yahoo_shopping");
  assert.equal(yahoo.source_listing_id, "shop_item-9");
  assert.equal(yahoo.status, "sold_out");

  const missing = normalizeRakutenReobservationResponse(null, {
    source_listing_id: "shop:item-9",
    public_url: "https://item.rakuten.co.jp/shop/item-9/",
  });
  assert.equal(missing.outcome, "not_found");
  assert.equal(missing.source_listing_id, "shop:item-9");
});

test("due selection prioritizes hot, then active, then unavailable listings with bounded cadence", () => {
  const hot = listingFixture({ id: "hot", reobservation_priority: "hot", last_observed_at: "2026-09-01T00:00:00.000Z" });
  const active = listingFixture({ id: "active", last_observed_at: "2026-08-31T00:00:00.000Z" });
  const unavailable = listingFixture({ id: "unavailable", status: "sold_out", last_observed_at: "2026-08-28T00:00:00.000Z" });
  const notDue = listingFixture({ id: "fresh", last_observed_at: "2026-09-02T20:00:00.000Z" });

  const selected = selectDueMarketReobservations([unavailable, active, notDue, hot], {
    now: "2026-09-03T00:00:00.000Z",
    limit: 10,
  });

  assert.deepEqual(selected.map((entry) => entry.listing.id), ["hot", "active", "unavailable"]);
  assert.deepEqual(selected.map((entry) => entry.cadence_hours), [6, 24, 72]);
});

test("dry-run artifact separates outcomes from projected writes and contains no Production action", () => {
  const listing = listingFixture();
  const plans = [
    planMarketReobservation({ listing, providerResult: seenResult(listing), observedAt: "2026-09-02T00:00:00.000Z", observationKey: "artifact-seen" }),
    planMarketReobservation({ listing, providerResult: { outcome: "throttled", provider: "rakuten_ichiba" }, observedAt: "2026-09-02T01:00:00.000Z", observationKey: "artifact-throttle" }),
  ];
  const artifact = buildMarketReobservationDryRun(plans, { generated_at: "2026-09-02T02:00:00.000Z" });

  assert.equal(artifact.checked_count, 2);
  assert.equal(artifact.outcome_counts.unchanged, 1);
  assert.equal(artifact.outcome_counts.throttled, 1);
  assert.equal(artifact.projected_writes.observation_inserts, 1);
  assert.equal(artifact.projected_writes.listing_updates, 1);
  assert.equal(artifact.production_actions, 0);
});
