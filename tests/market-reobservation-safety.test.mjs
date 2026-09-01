import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";

test("missing provider price cannot become a synthetic zero-price observation", () => {
  const provider = "rakuten_ichiba";
  const sourceListingId = "shop:item-1";
  const publicUrl = "https://item.rakuten.co.jp/shop/item-1/";
  const listing = {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl, title: "Example" }),
    variant_id: "variant-1",
    matched_variant_id: "variant-1",
    series_id: "series-1",
    title: "Example",
    listing_type: "single",
    price: 500,
    status: "active",
    source: "rakuten",
    source_type: "marketplace",
    source_url: publicUrl,
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
  };

  for (const missingPrice of [null, undefined, ""]) {
    const plan = planMarketReobservation({
      listing,
      providerResult: {
        outcome: "seen",
        provider,
        source_listing_id: sourceListingId,
        public_url: publicUrl,
        price: missingPrice,
        status: "active",
      },
      observedAt: "2026-09-02T00:00:00.000Z",
      observationKey: `missing-price-${String(missingPrice) || "empty"}`,
    });
    assert.equal(plan.outcome, "provider_error");
    assert.equal(plan.writes.observation_insert, null);
    assert.equal(plan.writes.listing_update, null);
  }
});
