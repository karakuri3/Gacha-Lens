import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  buildMarketReobservationR2V2CohortDigest,
  expectedMarketReobservationR2V2Approval,
} from "../lib/domain/market-reobservation-r2-v2-persistence.js";
import {
  R2_V2_FROZEN_LISTING_IDS,
  R2_V2_OBSERVATION_KEY,
  runMarketReobservationR2V2Canary,
} from "../scripts/market-reobservation-r2-v2-canary.mjs";

const HEAD = "e43a7c146d329bc3f5e5436b62b3e8d634cb1292";

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

function createReadHarness() {
  const listings = frozenListings();
  const baseObservations = listings.map((listing, index) => ({
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
  const inserted = [];
  const currentListings = structuredClone(listings);

  return {
    currentListings,
    inserted,
    async fetchRows(table, options = {}) {
      if (table === "market_listings") return structuredClone(currentListings);
      if (table === "import_issues") return [];
      if (table === "market_listing_observations") {
        const idFilter = String(options.params?.id ?? "");
        const listingFilter = String(options.params?.listing_id ?? "");
        const rows = [...baseObservations, ...inserted];
        if (idFilter) return structuredClone(rows.filter((row) => idFilter.includes(row.id)));
        if (listingFilter) return structuredClone(rows.filter((row) => listingFilter.includes(row.listing_id)));
        return structuredClone(rows);
      }
      throw new Error(`unexpected table: ${table}`);
    },
    async fetchRowCount(table, params = {}) {
      if (table === "market_listings" && params.status === "eq.sold") return 0;
      if (table === "market_listings") return 113;
      if (table === "market_listing_observations") return 113 + inserted.length;
      throw new Error(`unexpected count table: ${table}`);
    },
    commitBatch(batch) {
      for (const entry of batch) {
        inserted.push({
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
              outcome: entry.price === entry.expected_price && entry.status === entry.expected_status ? "unchanged" : "price_changed",
            },
          },
          created_at: entry.observed_at,
        });
        const listing = currentListings.find((row) => row.id === entry.listing_id);
        listing.price = entry.price;
        listing.status = entry.status;
        listing.last_observed_at = entry.observed_at;
        listing.updated_at = entry.observed_at;
      }
    },
  };
}

function exactProviderRead(listing, overrides = {}) {
  return {
    result: {
      outcome: overrides.outcome ?? "seen",
      provider: "yahoo_shopping",
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.raw.public_url,
      price: overrides.price ?? listing.price,
      status: overrides.status ?? listing.status,
      reason: overrides.reason ?? "exact_test_read",
    },
    diagnostics: {
      attempt_count: overrides.attempt_count ?? 1,
      retry_count: overrides.retry_count ?? 0,
      final_status: 200,
      failure_category: null,
      rate_limited: false,
      timed_out: false,
      recovered_after_retry: false,
    },
  };
}

function approvalFor(listings) {
  const digest = buildMarketReobservationR2V2CohortDigest({
    headSha: HEAD,
    observationKey: R2_V2_OBSERVATION_KEY,
    listings,
  });
  return expectedMarketReobservationR2V2Approval({ headSha: HEAD, cohortDigest: digest });
}

test("R2 v2 dry-run is DB-read-only and makes zero provider/RPC calls", async () => {
  const harness = createReadHarness();
  let providerCalls = 0;
  let rpcCalls = 0;
  const artifact = await runMarketReobservationR2V2Canary({
    mode: "dry-run",
    headSha: HEAD,
    expectedMainSha: HEAD,
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    providerRead: async () => { providerCalls += 1; throw new Error("must not run"); },
    rpcCall: async () => { rpcCalls += 1; throw new Error("must not run"); },
  });
  assert.equal(providerCalls, 0);
  assert.equal(rpcCalls, 0);
  assert.equal(artifact.schema_version, 2);
  assert.equal(artifact.provider_requests, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.write_authorized, false);
  assert.equal(artifact.current_counts.observations, 113);
  assert.equal(artifact.current_counts.reobserved_listings, 0);
  assert.equal(artifact.observation_id_collisions, 0);
  assert.match(artifact.required_approval, /^APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:/);
});

test("R2 v2 stops before RPC on a failed exact read and preserves sanitized attempt evidence", async () => {
  const harness = createReadHarness();
  const approval = approvalFor(harness.currentListings);
  let providerCalls = 0;
  let rpcCalls = 0;
  await assert.rejects(() => runMarketReobservationR2V2Canary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    approval,
    now: new Date("2026-09-02T09:00:00.000Z"),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => {
      providerCalls += 1;
      if (providerCalls === 3) return exactProviderRead(listing, { outcome: "not_found", reason: "exact_item_not_returned", attempt_count: 2, retry_count: 1 });
      return exactProviderRead(listing);
    },
    rpcCall: async () => { rpcCalls += 1; throw new Error("must not run"); },
  }), /attempts=2; total_attempts=4/);
  assert.equal(providerCalls, 3);
  assert.equal(rpcCalls, 0);
  assert.equal(harness.inserted.length, 0);
});

test("R2 v2 enforces Yahoo same-provider pacing before later reads", async () => {
  const harness = createReadHarness();
  const approval = approvalFor(harness.currentListings);
  let now = 0;
  const sleeps = [];
  await runMarketReobservationR2V2Canary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    approval,
    now: new Date("2026-09-02T09:00:00.000Z"),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    clock: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    providerRead: async (listing) => exactProviderRead(listing),
    rpcCall: async (batch) => {
      harness.commitBatch(batch);
      return {
        schema_version: 2,
        kind: "market_reobservation_r2_atomic_canary_v2",
        applied_count: 4,
        observation_key: R2_V2_OBSERVATION_KEY,
        listing_ids: batch.map((entry) => entry.listing_id),
        observation_ids: batch.map((entry) => entry.observation_id),
        market_listing_delta: 0,
        observation_delta: 4,
        reobserved_listing_delta: 4,
        completed_sold_delta: 0,
      };
    },
  });
  assert.deepEqual(sleeps, [1000, 1000, 1000]);
});

test("R2 v2 canary-write performs one atomic RPC after four safe Yahoo plans and verifies +4 history", async () => {
  const harness = createReadHarness();
  const approval = approvalFor(harness.currentListings);
  let providerCalls = 0;
  let rpcCalls = 0;
  const result = await runMarketReobservationR2V2Canary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    approval,
    now: new Date("2026-09-02T09:00:00.000Z"),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => { providerCalls += 1; return exactProviderRead(listing); },
    rpcCall: async (batch) => {
      rpcCalls += 1;
      harness.commitBatch(batch);
      return {
        schema_version: 2,
        kind: "market_reobservation_r2_atomic_canary_v2",
        applied_count: 4,
        observation_key: R2_V2_OBSERVATION_KEY,
        listing_ids: batch.map((entry) => entry.listing_id),
        observation_ids: batch.map((entry) => entry.observation_id),
        market_listing_delta: 0,
        observation_delta: 4,
        reobserved_listing_delta: 4,
        completed_sold_delta: 0,
      };
    },
  });
  assert.equal(providerCalls, 4);
  assert.equal(rpcCalls, 1);
  assert.equal(result.provider_attempts, 4);
  assert.equal(result.postwrite.verified, true);
  assert.deepEqual(result.postwrite.deltas, { market_listings: 0, observations: 4, reobserved_listings: 4, completed_sold: 0 });
  assert.equal(harness.inserted.length, 4);
});

test("R2 v2 runner source has no workflow integration and is bound to the v2 RPC", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-r2-v2-canary.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /workflow_dispatch|cron:|schedule:/);
  assert.match(source, /MARKET_REOBSERVATION_R2_V2_RPC/);
  assert.match(source, /\/rest\/v1\/rpc\/\$\{MARKET_REOBSERVATION_R2_V2_RPC\}/);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds/);
  assert.match(source, /totalAttempts > 12/);
  assert.match(source, /provider !== "yahoo_shopping"/);
});
