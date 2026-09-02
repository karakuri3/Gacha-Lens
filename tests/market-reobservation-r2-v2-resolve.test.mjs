import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { marketReobservationObservationId } from "../lib/domain/market-reobservation.js";
import {
  R2_V2_FROZEN_LISTING_IDS,
  R2_V2_OBSERVATION_KEY,
} from "../scripts/market-reobservation-r2-v2-canary.mjs";
import { resolveMarketReobservationR2V2Commit } from "../scripts/market-reobservation-r2-v2-resolve.mjs";

function frozenListings() {
  const definitions = [
    [R2_V2_FROZEN_LISTING_IDS[0], "lead-netstore_302507s186ook3", "https://store.shopping.yahoo.co.jp/lead-netstore/302507s186ook3.html", "tarts-y096563-面会窓", "tarts-y096563", 698, "2026-08-16T08:50:42.683Z"],
    [R2_V2_FROZEN_LISTING_IDS[1], "selen-shope_5500000224314", "https://store.shopping.yahoo.co.jp/selen-shope/5500000224314.html", "gashapon-4570118105790000-コライドン", "gashapon-4570118105790000", 1500, "2026-08-31T05:41:52.543Z"],
    [R2_V2_FROZEN_LISTING_IDS[2], "lead-netstore_qq222607s309ptk2", "https://store.shopping.yahoo.co.jp/lead-netstore/qq222607s309ptk2.html", "tarts-y901065-たっつん", "tarts-y901065", 898, "2026-09-01T00:41:05.400Z"],
    [R2_V2_FROZEN_LISTING_IDS[3], "toysanta_g-5l960018a9-002-57393", "https://store.shopping.yahoo.co.jp/toysanta/g-5l960018a9-002-57393.html", "gashapon-4582769979163000-くちぱっち", "gashapon-4582769979163000", 458, "2026-09-01T00:41:05.400Z"],
  ];
  return definitions.map(([id, sourceListingId, publicUrl, variantId, seriesId, price, lastObservedAt], index) => {
    assert.equal(buildMarketplaceListingId({ provider: "yahoo_shopping", sourceListingId, publicUrl }), id);
    return {
      id,
      variant_id: variantId,
      matched_variant_id: variantId,
      series_id: seriesId,
      title: `Target ${index}`,
      listing_type: "single",
      market_review_type: "single",
      price,
      status: "active",
      source: "yahoo_shopping",
      source_type: "marketplace",
      source_url: publicUrl,
      listed_at: lastObservedAt,
      sold_at: null,
      confidence: 0.9,
      review_required: false,
      raw: { provider: "yahoo_shopping", source_listing_id: sourceListingId, public_url: publicUrl },
      created_at: lastObservedAt,
      updated_at: lastObservedAt,
      last_observed_at: lastObservedAt,
    };
  });
}

function baselineRows(listings) {
  return listings.map((listing, index) => ({
    id: `baseline-v2-${index}`,
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

function committedRows(listings, observedAt = "2026-09-02T09:00:00.000Z") {
  return listings.map((listing) => {
    listing.last_observed_at = observedAt;
    listing.updated_at = observedAt;
    return {
      id: marketReobservationObservationId({
        listingId: listing.id,
        provider: "yahoo_shopping",
        observationKey: R2_V2_OBSERVATION_KEY,
      }),
      listing_id: listing.id,
      variant_id: listing.variant_id,
      series_id: listing.series_id,
      price: listing.price,
      status: listing.status,
      source: "yahoo_shopping",
      observed_at: observedAt,
      raw: {
        market_reobservation: {
          provider: "yahoo_shopping",
          source_listing_id: listing.raw.source_listing_id,
          observation_key: R2_V2_OBSERVATION_KEY,
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
      const rows = [...baseline, ...r2];
      if (idFilter) return structuredClone(rows.filter((row) => idFilter.includes(row.id)));
      if (listingFilter) return structuredClone(rows.filter((row) => listingFilter.includes(row.listing_id)));
      return structuredClone(rows);
    },
  };
}

test("R2 v2 resolver reports not_committed with deterministic IDs absent and one prior row each", async () => {
  const read = harness({ state: "not_committed" });
  const result = await resolveMarketReobservationR2V2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.schema_version, 2);
  assert.equal(result.state, "not_committed");
  assert.equal(result.provider_requests, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.production_writes, 0);
  assert.equal(result.automatic_retry, false);
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts), [1, 1, 1, 1]);
});

test("R2 v2 resolver reports committed only when all four deterministic Yahoo observations verify", async () => {
  const read = harness({ state: "committed" });
  const result = await resolveMarketReobservationR2V2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.state, "committed");
  assert.equal(result.reason, "all_four_r2_v2_deterministic_observations_verified");
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts), [2, 2, 2, 2]);
  assert.equal(result.observation_ids.length, 4);
});

test("R2 v2 resolver reports inconsistent on a partial deterministic observation set", async () => {
  const read = harness({ state: "partial" });
  const result = await resolveMarketReobservationR2V2Commit({ loadEnv: false, fetchRows: read.fetchRows });
  assert.equal(result.state, "inconsistent");
  assert.equal(result.reason, "partial_or_duplicate_r2_v2_observation_set");
  assert.equal(result.write_retry_authorized, false);
  assert.equal(result.found_observation_ids.length, 2);
});

test("R2 v2 resolver source is SELECT-only and never authorizes automatic/write retry", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-r2-v2-resolve.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetchExactMarketReobservation|\/rest\/v1\/rpc\//);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds|method:\s*["']POST["']|method:\s*["']PATCH["']|method:\s*["']DELETE["']/);
  assert.match(source, /automatic_retry:\s*false/);
  assert.match(source, /write_retry_authorized:\s*false/);
  assert.match(source, /R2_V2_OBSERVATION_KEY/);
});
