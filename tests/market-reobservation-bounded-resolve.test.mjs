import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { buildMarketReobservationBoundedRpcBatch } from "../lib/domain/market-reobservation-bounded-persistence.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  buildMarketReobservationBoundedResolutionManifest,
  resolveMarketReobservationBoundedCommit,
} from "../scripts/market-reobservation-bounded-resolve.mjs";

const KEY = "reobs-v1:bounded-20260903-01";
const OBSERVED_AT = "2026-09-03T10:00:00.000Z";

function listingFixture(index, provider = index % 2 === 0 ? "rakuten_ichiba" : "yahoo_shopping") {
  const rakuten = provider === "rakuten_ichiba";
  const sourceListingId = rakuten ? `resolve-${index}:30${index}` : `resolve-${index}_30${index}`;
  const publicUrl = rakuten
    ? `https://item.rakuten.co.jp/resolve-${index}/item-${index}/`
    : `https://store.shopping.yahoo.co.jp/resolve-${index}/item-${index}.html`;
  const source = rakuten ? "rakuten" : "yahoo_shopping";
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl }),
    variant_id: `resolve-variant-${index}`,
    matched_variant_id: `resolve-variant-${index}`,
    series_id: `resolve-series-${index}`,
    title: `Resolve ${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 800 + index * 10,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    listed_at: "2026-09-01T00:00:00.000Z",
    sold_at: null,
    confidence: 0.9,
    review_required: false,
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
    last_observed_at: "2026-09-02T00:00:00.000Z",
  };
}

function fixture(priorCounts = [1, 3, 1]) {
  const listings = priorCounts.map((_, index) => listingFixture(index));
  const cohort = listings.map((listing, index) => ({ listing, prior_observation_count: priorCounts[index] }));
  const plans = cohort.map(({ listing }) => planMarketReobservation({
    listing,
    providerResult: {
      outcome: "seen",
      provider: listing.raw.provider,
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.raw.public_url,
      price: listing.price,
      status: listing.status,
    },
    observedAt: OBSERVED_AT,
    observationKey: KEY,
  }));
  const batch = buildMarketReobservationBoundedRpcBatch({ cohort, plans, observationKey: KEY });
  const manifest = buildMarketReobservationBoundedResolutionManifest({ observationKey: KEY, batch });
  return { listings, priorCounts, batch, manifest };
}

function baselineRows(listings, priorCounts) {
  const rows = [];
  for (let index = 0; index < listings.length; index += 1) {
    const listing = listings[index];
    for (let count = 0; count < priorCounts[index]; count += 1) {
      rows.push({
        id: `resolve-base-${index}-${count}`,
        listing_id: listing.id,
        variant_id: listing.variant_id,
        series_id: listing.series_id,
        price: listing.price,
        status: listing.status,
        source: listing.source,
        observed_at: count === priorCounts[index] - 1 ? listing.last_observed_at : "2026-09-01T00:00:00.000Z",
        raw: {},
        created_at: listing.last_observed_at,
      });
    }
  }
  return rows;
}

function committedRow(entry) {
  return {
    id: entry.observation_id,
    listing_id: entry.listing_id,
    variant_id: entry.variant_id,
    series_id: entry.series_id,
    price: entry.price,
    status: entry.status,
    source: entry.source,
    observed_at: entry.observed_at,
    raw: {
      market_reobservation: {
        provider: entry.provider,
        source_listing_id: entry.source_listing_id,
        observation_key: entry.observation_key,
        outcome: "unchanged",
      },
    },
    created_at: entry.observed_at,
  };
}

function harness({ state = "not_committed", priorCounts = [1, 3, 1] } = {}) {
  const data = fixture(priorCounts);
  const listings = structuredClone(data.listings);
  const baseline = baselineRows(listings, priorCounts);
  let committed = [];
  if (state === "committed" || state === "partial") {
    const selected = state === "committed" ? data.batch : data.batch.slice(0, 1);
    committed = selected.map(committedRow);
    for (const entry of selected) {
      const listing = listings.find((row) => row.id === entry.listing_id);
      listing.price = entry.price;
      listing.status = entry.status;
      listing.last_observed_at = entry.observed_at;
      listing.updated_at = entry.observed_at;
    }
  }
  return {
    ...data,
    listings,
    async fetchRows(table, options = {}) {
      if (table === "market_listings") return structuredClone(listings);
      if (table !== "market_listing_observations") throw new Error(`unexpected table ${table}`);
      const rows = [...baseline, ...committed];
      const idFilter = String(options.params?.id ?? "");
      const listingFilter = String(options.params?.listing_id ?? "");
      if (idFilter) return structuredClone(rows.filter((row) => idFilter.includes(row.id)));
      if (listingFilter) return structuredClone(rows.filter((row) => listingFilter.includes(row.listing_id)));
      return structuredClone(rows);
    },
  };
}

test("bounded resolver reports not_committed only when deterministic IDs are absent and frozen prior state remains exact", async () => {
  const read = harness({ state: "not_committed" });
  const result = await resolveMarketReobservationBoundedCommit({ loadEnv: false, manifest: read.manifest, fetchRows: read.fetchRows });
  assert.equal(result.state, "not_committed");
  assert.equal(result.provider_requests, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.production_writes, 0);
  assert.equal(result.automatic_retry, false);
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts).sort((a, b) => a - b), [1, 1, 3]);
});

test("bounded resolver reports committed for mixed providers and prior-count greater than one", async () => {
  const read = harness({ state: "committed" });
  const result = await resolveMarketReobservationBoundedCommit({ loadEnv: false, manifest: read.manifest, fetchRows: read.fetchRows });
  assert.equal(result.state, "committed");
  assert.equal(result.reason, "all_bounded_deterministic_observations_verified");
  assert.equal(result.observation_ids.length, 3);
  assert.equal(result.write_retry_authorized, false);
  assert.deepEqual(Object.values(result.target_observation_counts).sort((a, b) => a - b), [2, 2, 4]);
});

test("bounded resolver reports inconsistent on any partial deterministic commit", async () => {
  const read = harness({ state: "partial" });
  const result = await resolveMarketReobservationBoundedCommit({ loadEnv: false, manifest: read.manifest, fetchRows: read.fetchRows });
  assert.equal(result.state, "inconsistent");
  assert.equal(result.reason, "partial_or_duplicate_bounded_observation_set");
  assert.equal(result.found_observation_ids.length, 1);
  assert.equal(result.write_retry_authorized, false);
});

test("bounded resolution manifest rejects an entry whose observation key differs from the manifest key", () => {
  const data = fixture([1]);
  const bad = structuredClone(data.batch);
  bad[0].observation_key = "reobs-v1:other";
  assert.throws(() => buildMarketReobservationBoundedResolutionManifest({ observationKey: KEY, batch: bad }), /entry is invalid/);
});

test("bounded resolver source is SELECT-only and never authorizes retry", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-bounded-resolve.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetchExactMarketReobservation|\/rest\/v1\/rpc\//);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds|method:\s*["']POST["']|method:\s*["']PATCH["']|method:\s*["']DELETE["']/);
  assert.match(source, /automatic_retry:\s*false/);
  assert.match(source, /write_retry_authorized:\s*false/);
});
