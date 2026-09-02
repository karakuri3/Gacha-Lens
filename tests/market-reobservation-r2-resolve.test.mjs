import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { marketReobservationObservationId } from "../lib/domain/market-reobservation.js";
import {
  R2_FROZEN_LISTING_IDS,
  R2_OBSERVATION_KEY,
} from "../scripts/market-reobservation-r2-canary.mjs";
import { resolveMarketReobservationR2Commit } from "../scripts/market-reobservation-r2-resolve.mjs";

function frozenListings() {
  const definitions = [
    [R2_FROZEN_LISTING_IDS[0], "rakuten_ichiba", "auc-toysanta:10386044", "https://item.rakuten.co.jp/auc-toysanta/g-5l8n0018l8-002", "rakuten", 598],
    [R2_FROZEN_LISTING_IDS[1], "rakuten_ichiba", "realize-store-2:10575349", "https://item.rakuten.co.jp/realize-store-2/qq152607s248phk4", "rakuten", 898],
    [R2_FROZEN_LISTING_IDS[2], "yahoo_shopping", "lead-netstore_302507s186ook3", "https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html", "yahoo_shopping", 698],
    [R2_FROZEN_LISTING_IDS[3], "yahoo_shopping", "selen-shope_5500000224314", "https://store.shopping.yahoo.co.jp/selen-shope/5500000224314.html", "yahoo_shopping", 1500],
  ];
  return definitions.map(([id, provider, sourceListingId, publicUrl, source, price], index) => {
    assert.equal(buildMarketplaceListingId({ provider, sourceListingId, publicUrl }), id);
    return {
      id,
      variant_id: `variant-${index}`,
      matched_variant_id: `variant-${index}`,
      series_id: `series-${index}`,
      title: `Target ${index}`,
      listing_type: "single",
      market_review_type: "single",
      price,
      status: "active",
      source,
      source_type: "marketplace",
      source_url: publicUrl,
      listed_at: "2026-08-31T05:41:52.543Z",
      sold_at: null,
      confidence: 0.86,
      review_required: false,
      raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
      created_at: "2026-08-31T05:41:53.000Z",
      updated_at: "2026-08-31T05:41:53.000Z",
      last_observed_at: "2026-08-31T05:41:52.543Z",
    };
  });
}

function baselineRows(listings) {
  return listings.map((listing, index) => ({
    id: `baseline-${index}`,
    listing_id: listing.id,
    variant_id: listing.variant_id,
    series_id: listing.series_id,
    price: listing.price,
    status: listing.status,
    source: listing.source,
    observed_at: listing.last_observed_at,
    raw: {},
    created_at: listing.last_observed_at,
  }));
}

function committedRows(listings, observedAt = "2026-09-02T07:00:00.000Z") {
  return listings.map((listing) => {
    listing.last_observed_at = observedAt;
    listing.updated_at = observedAt;
    return {
      id: marketReobservationObservationId({
        listingId: listing.id,
        provider: listing.raw.provider,
        observationKey: R2_OBSERVATION_KEY,
      }),
      listing_id: listing.id,
      variant_id: listing.variant_id,
      series_id: listing.series_id,
      price: listing.price,
      status: listing.status,
      source: listing.source,
      observed_at: observedAt,
      raw: {
        market_reobservation: {
          provider: listing.raw.provider,
          source_listing_id: listing.raw.source_listing_id,
          observation_key: R2_OBSERVATION_KEY,
          outcome: "unchanged",
        },
      },
      created_at: observedAt,
    };
  });
}

function harness({ state = "not_committed" } = {}) {
  const listings = frozenListings();
  const baseline = baselineRows(listings);
  let r2 = [];
  if (state === "committed") r2 = committedRows(listings);
  if (state === "partial") r2 = committedRows(listings).slice(0, 2);

  return {
    listings,
    async fetchRows(table, options = {}) {
      if (table === "market_listings") return structuredClone(listings);
      if (table !== "market_listing_observations") throw new Error(`unexpected table ${table}`);
      const idFilter = String(options.params?.id ?? "");
      const listingFilter = String(options.params?.listing_id ?? "");
      const all = [...baseline, ...r2];
      if (idFilter) return structuredClone(all.filter((row) => idFilter.includes(row.id)));
      if (listingFilter) return structuredClone(all.filter((row) => listingFilter.includes(row.listing_id)));
      return structuredClone(all);
    },
  };
}

test("R2 resolver reports not_committed when deterministic IDs are absent and each target still has one observation", async () => {
  const read = harness({ state: "not_committed" });
  const result = await resolveMarketReobservationR2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.state, "not_committed");
  assert.equal(result.provider_requests, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.production_writes, 0);
  assert.equal(result.automatic_retry, false);
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts), [1, 1, 1, 1]);
});

test("R2 resolver reports committed only when all four deterministic observations and current snapshots verify", async () => {
  const read = harness({ state: "committed" });
  const result = await resolveMarketReobservationR2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.state, "committed");
  assert.equal(result.reason, "all_four_deterministic_observations_verified");
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts), [2, 2, 2, 2]);
  assert.equal(result.observation_ids.length, 4);
});

test("R2 resolver reports inconsistent on partial deterministic observation set", async () => {
  const read = harness({ state: "partial" });
  const result = await resolveMarketReobservationR2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.state, "inconsistent");
  assert.equal(result.reason, "partial_or_duplicate_r2_observation_set");
  assert.equal(result.write_retry_authorized, false);
  assert.equal(result.found_observation_ids.length, 2);
});

test("R2 resolver source is SELECT-only and contains no provider/RPC/write path", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-r2-resolve.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetchExactMarketReobservation|\/rest\/v1\/rpc\//);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds|method:\s*["']POST["']|method:\s*["']PATCH["']|method:\s*["']DELETE["']/);
  assert.match(source, /automatic_retry:\s*false/);
  assert.match(source, /write_retry_authorized:\s*false/);
});
