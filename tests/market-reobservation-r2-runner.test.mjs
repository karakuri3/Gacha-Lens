import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  buildMarketReobservationR2CohortDigest,
  expectedMarketReobservationR2Approval,
} from "../lib/domain/market-reobservation-r2-persistence.js";
import {
  R2_FROZEN_LISTING_IDS,
  R2_OBSERVATION_KEY,
  runMarketReobservationR2Canary,
} from "../scripts/market-reobservation-r2-canary.mjs";

const HEAD = "82ef2532253a99b1ba1c46b48a22442281c27442";

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

function createReadHarness({ listings = frozenListings(), afterCommit = false } = {}) {
  const baseObservations = listings.map((listing, index) => ({
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
        const source = [...baseObservations, ...inserted];
        if (idFilter) return structuredClone(source.filter((row) => idFilter.includes(row.id)));
        if (listingFilter) return structuredClone(source.filter((row) => listingFilter.includes(row.listing_id)));
        return structuredClone(source);
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
      if (!afterCommit && inserted.length) throw new Error("duplicate commit");
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
          raw: { market_reobservation: { observation_key: entry.observation_key } },
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
      provider: listing.raw.provider,
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

test("R2 dry-run is DB-read-only and makes zero provider/RPC calls", async () => {
  const harness = createReadHarness();
  let providerCalls = 0;
  let rpcCalls = 0;
  const artifact = await runMarketReobservationR2Canary({
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
  assert.equal(artifact.provider_requests, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.write_authorized, false);
  assert.equal(artifact.current_counts.observations, 113);
  assert.equal(artifact.current_counts.reobserved_listings, 0);
  assert.equal(artifact.observation_id_collisions, 0);
  assert.match(artifact.required_approval, /^APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:/);
});

test("R2 canary-write stops before RPC when any provider result is not seen", async () => {
  const harness = createReadHarness();
  const listings = harness.currentListings;
  const digest = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: R2_OBSERVATION_KEY, listings });
  const approval = expectedMarketReobservationR2Approval({ headSha: HEAD, cohortDigest: digest });
  let providerCalls = 0;
  let rpcCalls = 0;
  await assert.rejects(() => runMarketReobservationR2Canary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    approval,
    now: new Date("2026-09-02T07:00:00.000Z"),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => {
      providerCalls += 1;
      return providerCalls === 3 ? exactProviderRead(listing, { outcome: "not_found", reason: "exact_item_not_returned" }) : exactProviderRead(listing);
    },
    rpcCall: async () => { rpcCalls += 1; throw new Error("must not run"); },
  }), /all-or-nothing provider preflight failed/);
  assert.equal(providerCalls, 3);
  assert.equal(rpcCalls, 0);
  assert.equal(harness.inserted.length, 0);
});

test("R2 canary-write performs exactly one atomic RPC after four successful plans and verifies +4 history", async () => {
  const harness = createReadHarness();
  const listings = harness.currentListings;
  const digest = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: R2_OBSERVATION_KEY, listings });
  const approval = expectedMarketReobservationR2Approval({ headSha: HEAD, cohortDigest: digest });
  let providerCalls = 0;
  let rpcCalls = 0;
  const result = await runMarketReobservationR2Canary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    approval,
    now: new Date("2026-09-02T07:00:00.000Z"),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => {
      providerCalls += 1;
      return exactProviderRead(listing);
    },
    rpcCall: async (batch) => {
      rpcCalls += 1;
      harness.commitBatch(batch);
      return {
        schema_version: 1,
        kind: "market_reobservation_r2_atomic_canary",
        applied_count: 4,
        observation_key: R2_OBSERVATION_KEY,
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

test("R2 runner source has no workflow dispatch/schedule integration and fixed RPC path only", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-r2-canary.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /workflow_dispatch|cron:|schedule:/);
  assert.match(source, /MARKET_REOBSERVATION_R2_RPC/);
  assert.match(source, /\/rest\/v1\/rpc\/\$\{MARKET_REOBSERVATION_R2_RPC\}/);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds/);
  assert.match(source, /totalAttempts > 12/);
});
