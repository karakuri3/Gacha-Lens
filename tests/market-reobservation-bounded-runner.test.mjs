import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import {
  buildMarketReobservationBoundedCohortDigest,
  expectedMarketReobservationBoundedApproval,
} from "../lib/domain/market-reobservation-bounded-persistence.js";
import {
  runMarketReobservationBoundedCanary,
} from "../scripts/market-reobservation-bounded-canary.mjs";

const HEAD = "02fb1f502b75ddd4d723f40dd4ff5eab838268cc";
const KEY = "reobs-v1:bounded-20260903-01";

function listingFixture(index, provider = index % 2 === 0 ? "rakuten_ichiba" : "yahoo_shopping") {
  const rakuten = provider === "rakuten_ichiba";
  const sourceListingId = rakuten ? `runner-${index}:20${index}` : `runner-${index}_20${index}`;
  const publicUrl = rakuten
    ? `https://item.rakuten.co.jp/runner-${index}/item-${index}/`
    : `https://store.shopping.yahoo.co.jp/runner-${index}/item-${index}.html`;
  const source = rakuten ? "rakuten" : "yahoo_shopping";
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl }),
    variant_id: `runner-variant-${index}`,
    matched_variant_id: `runner-variant-${index}`,
    series_id: `runner-series-${index}`,
    title: `Runner ${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 700 + index * 10,
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

function createHarness(priorCounts = [1, 2, 1]) {
  const currentListings = priorCounts.map((_, index) => listingFixture(index));
  const baseObservations = [];
  for (let index = 0; index < currentListings.length; index += 1) {
    const listing = currentListings[index];
    for (let count = 0; count < priorCounts[index]; count += 1) {
      baseObservations.push({
        id: `runner-base-${index}-${count}`,
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
  const unrelatedBaseline = {
    id: "unrelated-base",
    listing_id: "unrelated-listing",
    variant_id: "unrelated-variant",
    series_id: "unrelated-series",
    price: 999,
    status: "active",
    source: "yahoo_shopping",
    observed_at: "2026-09-01T00:00:00.000Z",
    raw: {},
    created_at: "2026-09-01T00:00:00.000Z",
  };
  const inserted = [];
  let committed = false;

  return {
    currentListings,
    inserted,
    priorCounts,
    get committed() { return committed; },
    async fetchRows(table, options = {}) {
      if (table === "market_listings") return structuredClone(currentListings);
      if (table === "import_issues") return [];
      if (table !== "market_listing_observations") throw new Error(`unexpected table ${table}`);
      const concurrent = committed ? [{
        ...unrelatedBaseline,
        id: "unrelated-concurrent",
        observed_at: "2026-09-03T10:00:01.000Z",
        created_at: "2026-09-03T10:00:01.000Z",
      }] : [];
      const rows = [...baseObservations, unrelatedBaseline, ...inserted, ...concurrent];
      const idFilter = String(options.params?.id ?? "");
      const listingFilter = String(options.params?.listing_id ?? "");
      if (idFilter) return structuredClone(rows.filter((row) => idFilter.includes(row.id)));
      if (listingFilter) return structuredClone(rows.filter((row) => listingFilter.includes(row.listing_id)));
      return structuredClone(rows);
    },
    async fetchRowCount(table, params = {}) {
      if (table === "market_listings" && params.status === "eq.sold") return 0;
      if (table === "market_listings") return committed ? 114 : 113;
      if (table === "market_listing_observations") return committed ? 117 + inserted.length + 1 : 117;
      throw new Error(`unexpected count table ${table}`);
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
      committed = true;
    },
  };
}

function providerRead(listing, overrides = {}) {
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

function approvalFor(harness) {
  const cohort = harness.currentListings.map((listing, index) => ({
    listing,
    prior_observation_count: harness.priorCounts[index],
  }));
  const digest = buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort });
  return expectedMarketReobservationBoundedApproval({ headSha: HEAD, cohortDigest: digest });
}

function successRpc(batch, harness) {
  harness.commitBatch(batch);
  return {
    schema_version: 1,
    kind: "market_reobservation_bounded_atomic_v1",
    applied_count: batch.length,
    observation_key: KEY,
    listing_ids: batch.map((entry) => entry.listing_id),
    observation_ids: batch.map((entry) => entry.observation_id),
    market_listing_delta: 0,
    observation_delta: batch.length,
    newly_reobserved_delta: batch.filter((entry) => entry.expected_prior_observation_count === 1).length,
    completed_sold_delta: 0,
  };
}

test("bounded dry-run is DB-read-only and makes zero provider/RPC/manifest writes", async () => {
  const harness = createHarness();
  let providerCalls = 0;
  let rpcCalls = 0;
  let manifestWrites = 0;
  const artifact = await runMarketReobservationBoundedCanary({
    mode: "dry-run",
    headSha: HEAD,
    expectedMainSha: HEAD,
    observationKey: KEY,
    listingIds: harness.currentListings.map((row) => row.id),
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    providerRead: async () => { providerCalls += 1; throw new Error("must not run"); },
    rpcCall: async () => { rpcCalls += 1; throw new Error("must not run"); },
    persistResolutionManifest: async () => { manifestWrites += 1; },
  });
  assert.equal(providerCalls, 0);
  assert.equal(rpcCalls, 0);
  assert.equal(manifestWrites, 0);
  assert.equal(artifact.provider_requests, 0);
  assert.equal(artifact.rpc_calls, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.expected_newly_reobserved_delta, 2);
  assert.match(artifact.required_approval, /^APPROVE_MARKET_REOBSERVATION_BOUNDED_V1:/);
});

test("bounded write mode refuses to begin provider execution without a durable resolver-manifest path", async () => {
  const harness = createHarness();
  const approval = approvalFor(harness);
  let providerCalls = 0;
  await assert.rejects(() => runMarketReobservationBoundedCanary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    observationKey: KEY,
    listingIds: harness.currentListings.map((row) => row.id),
    approval,
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    providerRead: async () => { providerCalls += 1; return providerRead(harness.currentListings[0]); },
  }), /requires a resolution manifest output path before RPC/);
  assert.equal(providerCalls, 0);
});

test("bounded runner stops before RPC on an unsafe provider result and preserves attempt accounting", async () => {
  const harness = createHarness();
  const approval = approvalFor(harness);
  let providerCalls = 0;
  let rpcCalls = 0;
  let manifestWrites = 0;
  await assert.rejects(() => runMarketReobservationBoundedCanary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    observationKey: KEY,
    listingIds: harness.currentListings.map((row) => row.id),
    approval,
    resolutionManifestPath: "artifacts/test-bounded-manifest.json",
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => {
      providerCalls += 1;
      if (providerCalls === 3) return providerRead(listing, { outcome: "not_found", reason: "exact_item_not_returned", attempt_count: 2, retry_count: 1 });
      return providerRead(listing);
    },
    persistResolutionManifest: async () => { manifestWrites += 1; },
    rpcCall: async () => { rpcCalls += 1; throw new Error("must not run"); },
  }), /attempts=2; total_attempts=4/);
  assert.equal(providerCalls, 3);
  assert.equal(manifestWrites, 0);
  assert.equal(rpcCalls, 0);
  assert.equal(harness.inserted.length, 0);
});

test("bounded mixed-provider pacing is enforced independently per provider", async () => {
  const harness = createHarness([1, 1, 1, 1]);
  const approval = approvalFor(harness);
  let now = 0;
  const sleeps = [];
  await runMarketReobservationBoundedCanary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    observationKey: KEY,
    listingIds: harness.currentListings.map((row) => row.id),
    approval,
    resolutionManifestPath: "artifacts/test-pacing-manifest.json",
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    clock: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    providerRead: async (listing) => providerRead(listing),
    persistResolutionManifest: async () => {},
    rpcCall: async (batch) => successRpc(batch, harness),
  });
  assert.deepEqual(sleeps.sort((a, b) => a - b), [1000, 1200]);
});

test("bounded success preserves resolver manifest before RPC and tolerates unrelated concurrent growth", async () => {
  const harness = createHarness([1, 2, 1]);
  const approval = approvalFor(harness);
  let providerCalls = 0;
  let rpcCalls = 0;
  let manifestPreserved = false;
  let preservedManifest = null;
  const result = await runMarketReobservationBoundedCanary({
    mode: "canary-write",
    headSha: HEAD,
    expectedMainSha: HEAD,
    observationKey: KEY,
    listingIds: harness.currentListings.map((row) => row.id),
    approval,
    resolutionManifestPath: "artifacts/test-success-manifest.json",
    loadEnv: false,
    fetchRows: harness.fetchRows,
    fetchRowCount: harness.fetchRowCount,
    sleep: async () => {},
    clock: () => providerCalls * 2000,
    providerRead: async (listing) => { providerCalls += 1; return providerRead(listing); },
    persistResolutionManifest: async (manifest, outputPath) => {
      assert.equal(outputPath, "artifacts/test-success-manifest.json");
      preservedManifest = structuredClone(manifest);
      manifestPreserved = true;
    },
    rpcCall: async (batch) => {
      rpcCalls += 1;
      assert.equal(manifestPreserved, true);
      assert.deepEqual(preservedManifest.batch.map((entry) => entry.observation_id), batch.map((entry) => entry.observation_id));
      return successRpc(batch, harness);
    },
  });
  assert.equal(providerCalls, 3);
  assert.equal(rpcCalls, 1);
  assert.equal(result.resolution_manifest_preserved, true);
  assert.equal(result.postwrite.verified, true);
  assert.deepEqual(result.postwrite.exact_lane_deltas, {
    market_listings: 0,
    observations: 3,
    reobserved_listings: 2,
    completed_sold: 0,
  });
  assert.equal(result.postwrite.observed_global_deltas.market_listings, 1);
  assert.equal(result.postwrite.observed_global_deltas.observations, 4);
  assert.equal(result.postwrite.observed_global_deltas.reobserved_listings, 3);
  assert.equal(harness.inserted.length, 3);
});

test("bounded runner source has no workflow/schedule integration and keeps max30 contract", () => {
  const source = fs.readFileSync(new URL("../scripts/market-reobservation-bounded-canary.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /workflow_dispatch|cron:|schedule:/);
  assert.match(source, /MARKET_REOBSERVATION_BOUNDED_MAX_ATTEMPTS/);
  assert.match(source, /resolution manifest output path before RPC/);
  assert.match(source, /persistResolutionManifest/);
  assert.doesNotMatch(source, /upsertRows|deleteRowsByIds/);
});
