import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { buildMarketReobservationR2CohortDigest } from "../lib/domain/market-reobservation-r2-persistence.js";

const HEAD = "82ef2532253a99b1ba1c46b48a22442281c27442";
const KEY = "reobs-v1:r2-20260902-01";

function listing(index, provider = index < 2 ? "rakuten_ichiba" : "yahoo_shopping") {
  const rakuten = provider === "rakuten_ichiba";
  const sourceListingId = rakuten ? `shop-${index}:item-${index}` : `shop-${index}_item-${index}`;
  const publicUrl = rakuten
    ? `https://item.rakuten.co.jp/shop-${index}/item-${index}`
    : `https://store.shopping.yahoo.co.jp/shop-${index}/item-${index}.html`;
  const source = rakuten ? "rakuten" : "yahoo_shopping";
  const id = buildMarketplaceListingId({ provider, sourceListingId, publicUrl });
  return {
    id,
    variant_id: `variant-${index}`,
    matched_variant_id: `variant-${index}`,
    series_id: `series-${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 500 + index,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    sold_at: null,
    review_required: false,
    last_observed_at: "2026-09-01T00:00:00.000Z",
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
  };
}

function cohort() {
  return [listing(0), listing(1), listing(2), listing(3)];
}

test("R2 cohort digest accepts only current review-safe single marketplace listings", () => {
  assert.match(buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings: cohort() }), /^[0-9a-f]{64}$/);

  const mutations = [
    ["review_required", true],
    ["listing_type", "set"],
    ["market_review_type", "ambiguous"],
    ["source_type", "manual"],
    ["sold_at", "2026-09-02T00:00:00.000Z"],
    ["matched_variant_id", "other-variant"],
  ];

  for (const [field, value] of mutations) {
    const rows = cohort();
    rows[0][field] = value;
    assert.throws(
      () => buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings: rows }),
      /frozen listing contract is invalid/,
      field,
    );
  }
});
