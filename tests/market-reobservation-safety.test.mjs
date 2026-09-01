import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  normalizeRakutenReobservationResponse,
  normalizeYahooReobservationResponse,
  planMarketReobservation,
} from "../lib/domain/market-reobservation.js";

function listingFixture(overrides = {}) {
  const provider = overrides.provider ?? "rakuten_ichiba";
  const sourceListingId = overrides.source_listing_id ?? (provider === "rakuten_ichiba" ? "shop:item-1" : "shop_item-1");
  const publicUrl = overrides.public_url ?? (provider === "rakuten_ichiba"
    ? "https://item.rakuten.co.jp/shop/item-1/"
    : "https://store.shopping.yahoo.co.jp/shop/item-1.html");
  const source = provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping";
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title: "Example" }),
    variant_id: "variant-1",
    matched_variant_id: "variant-1",
    series_id: "series-1",
    title: "Example",
    listing_type: "single",
    price: 500,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    last_observed_at: "2026-09-02T00:00:00.000Z",
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
    ...overrides,
  };
}

test("missing or zero provider price cannot become a synthetic zero-price observation", () => {
  const listing = listingFixture();
  for (const invalidPrice of [null, undefined, "", 0, "0", -1, "-1"]) {
    const plan = planMarketReobservation({
      listing,
      providerResult: {
        outcome: "seen",
        provider: "rakuten_ichiba",
        source_listing_id: listing.raw.source_listing_id,
        public_url: listing.source_url,
        price: invalidPrice,
        status: "active",
      },
      observedAt: "2026-09-03T00:00:00.000Z",
      observationKey: `invalid-price-${String(invalidPrice) || "empty"}`,
    });
    assert.equal(plan.outcome, "provider_error");
    assert.equal(plan.writes.observation_insert, null);
    assert.equal(plan.writes.listing_update, null);
  }
});

test("Rakuten unknown or missing availability fails closed instead of becoming active", () => {
  for (const availability of [undefined, null, "", 2, "2", "unknown"]) {
    const result = normalizeRakutenReobservationResponse({
      itemCode: "shop:item-1",
      itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
      itemPrice: 500,
      ...(availability === undefined ? {} : { availability }),
    }, {
      source_listing_id: "shop:item-1",
      public_url: "https://item.rakuten.co.jp/shop/item-1/",
    });
    assert.equal(result.outcome, "provider_error");
    assert.equal(result.reason, "unknown_availability");
  }

  assert.equal(normalizeRakutenReobservationResponse({
    itemCode: "shop:item-1",
    itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
    itemPrice: 500,
    availability: 1,
  }).status, "active");
  assert.equal(normalizeRakutenReobservationResponse({
    itemCode: "shop:item-1",
    itemUrl: "https://item.rakuten.co.jp/shop/item-1/",
    itemPrice: 500,
    availability: 0,
  }).status, "sold_out");
});

test("Yahoo unknown or missing inStock fails closed instead of becoming active", () => {
  for (const inStock of [undefined, null, "true", 1, 0]) {
    const result = normalizeYahooReobservationResponse({
      code: "shop_item-1",
      url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
      price: 500,
      ...(inStock === undefined ? {} : { inStock }),
    }, {
      source_listing_id: "shop_item-1",
      public_url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
    });
    assert.equal(result.outcome, "provider_error");
    assert.equal(result.reason, "unknown_availability");
  }

  assert.equal(normalizeYahooReobservationResponse({
    code: "shop_item-1",
    url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
    price: 500,
    inStock: true,
  }).status, "active");
  assert.equal(normalizeYahooReobservationResponse({
    code: "shop_item-1",
    url: "https://store.shopping.yahoo.co.jp/shop/item-1.html",
    price: 500,
    inStock: false,
  }).status, "sold_out");
});

test("an out-of-order observation cannot roll the current listing snapshot backward", () => {
  const listing = listingFixture({ last_observed_at: "2026-09-03T00:00:00.000Z" });
  const plan = planMarketReobservation({
    listing,
    providerResult: {
      outcome: "seen",
      provider: "rakuten_ichiba",
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.source_url,
      price: 650,
      status: "active",
    },
    observedAt: "2026-09-02T23:59:59.000Z",
    observationKey: "stale-run",
  });

  assert.equal(plan.outcome, "provider_error");
  assert.equal(plan.reason, "stale_observation_time");
  assert.equal(plan.writes.observation_insert, null);
  assert.equal(plan.writes.listing_update, null);
});

test("equal observation timestamp remains retry-safe for the same logical bucket", () => {
  const listing = listingFixture({ last_observed_at: "2026-09-03T00:00:00.000Z" });
  const input = {
    listing,
    providerResult: {
      outcome: "seen",
      provider: "rakuten_ichiba",
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.source_url,
      price: 500,
      status: "active",
    },
    observedAt: "2026-09-03T00:00:00.000Z",
    observationKey: "same-bucket-retry",
  };
  const first = planMarketReobservation(input);
  const retry = planMarketReobservation(input);
  assert.equal(first.outcome, "unchanged");
  assert.equal(first.writes.observation_insert.id, retry.writes.observation_insert.id);
});
