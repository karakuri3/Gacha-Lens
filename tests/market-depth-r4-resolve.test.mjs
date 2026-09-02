import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketDepthR4BatchDigest,
  buildMarketDepthR4RpcBatch,
} from "../lib/domain/market-depth-r4-persistence.js";
import { resolveMarketDepthR4Commit } from "../scripts/market-depth-r4-resolve.mjs";

const HEAD = "b".repeat(40);
const ARTIFACT = "c".repeat(64);
const FINGERPRINT = "d".repeat(64);

function manifest() {
  return {
    schema_version: 1,
    kind: "market_depth_r4_manifest_v1",
    observation_key: "depth-r4-v1:test-01",
    source_r3_run_id: "33665350076",
    source_r3_main_sha: "a".repeat(40),
    source_r3_artifact_digest: ARTIFACT,
    source_r3_generated_at: "2026-09-02T18:08:53.303Z",
    candidates: [{
      candidate_key: "1091dce22a0bf29f",
      selection_fingerprint: FINGERPRINT,
      variant_id: "gashapon-4535123846069000-伏黒恵",
      series_id: "gashapon-4535123846069000",
      provider: "yahoo_shopping",
      source_listing_id: "suruga-ya_601199451001",
      public_url: "https://store.shopping.yahoo.co.jp/suruga-ya/601199451001.html",
      listing_id: "yahoo-suruga-ya-601199451001",
      title: "中古トレーディングフィギュア 伏黒恵",
      price: 980,
      status: "active",
      expected_existing_listing_ids: ["yahoo-suruga-ya-601192353001"],
    }],
  };
}

function resolutionManifest(overrides = {}) {
  const frozen = manifest();
  return {
    schema_version: 1,
    kind: "market_depth_r4_resolution_manifest",
    head_sha: HEAD,
    batch_digest: buildMarketDepthR4BatchDigest({ headSha: HEAD, manifest: frozen }),
    manifest: frozen,
    provider_requests: 0,
    automatic_retry: false,
    write_retry_authorized: false,
    ...overrides,
  };
}

function committedRows() {
  const frozen = manifest();
  const batch = buildMarketDepthR4RpcBatch({ manifest: frozen, headSha: HEAD });
  const candidate = batch.candidates[0];
  const marker = {
    observation_key: frozen.observation_key,
    source_r3_run_id: frozen.source_r3_run_id,
    source_r3_main_sha: frozen.source_r3_main_sha,
    source_r3_artifact_digest: frozen.source_r3_artifact_digest,
    source_r3_generated_at: frozen.source_r3_generated_at,
    candidate_key: candidate.candidate_key,
    selection_fingerprint: candidate.selection_fingerprint,
    batch_digest: batch.batch_digest,
  };
  return {
    listing: {
      id: candidate.listing_id,
      variant_id: candidate.variant_id,
      matched_variant_id: candidate.variant_id,
      series_id: candidate.series_id,
      title: candidate.title,
      listing_type: "single",
      market_review_type: "single",
      classification_reason: "variant_and_parent_evidence_confirmed",
      classification_confidence: 0.86,
      price: candidate.price,
      status: "active",
      source: "yahoo_shopping",
      source_type: "marketplace",
      source_url: candidate.public_url,
      listed_at: frozen.source_r3_generated_at,
      sold_at: null,
      last_observed_at: frozen.source_r3_generated_at,
      confidence: 0.86,
      review_required: false,
      raw: {
        provider: candidate.provider,
        source_listing_id: candidate.source_listing_id,
        public_url: candidate.public_url,
        market_depth_r4: marker,
      },
    },
    observation: {
      id: candidate.observation_id,
      listing_id: candidate.listing_id,
      variant_id: candidate.variant_id,
      series_id: candidate.series_id,
      price: candidate.price,
      status: "active",
      source: "yahoo_shopping",
      observed_at: frozen.source_r3_generated_at,
      raw: { market_depth_r4: marker },
    },
  };
}

test("R4 resolver returns not_committed with SELECT-only semantics", async () => {
  const result = await resolveMarketDepthR4Commit({
    loadEnv: false,
    resolutionManifest: resolutionManifest(),
    fetchRows: async () => [],
  });
  assert.equal(result.state, "not_committed");
  assert.equal(result.provider_requests, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.production_writes, 0);
  assert.equal(result.automatic_retry, false);
});

test("R4 resolver returns committed only for exact deterministic pair", async () => {
  const rows = committedRows();
  const result = await resolveMarketDepthR4Commit({
    loadEnv: false,
    resolutionManifest: resolutionManifest(),
    fetchRows: async (table) => table === "market_listings" ? [rows.listing] : [rows.observation],
  });
  assert.equal(result.state, "committed");
  assert.equal(result.verified_pairs, 1);
});

test("R4 resolver rejects a tampered resolution batch digest before SELECT interpretation", async () => {
  await assert.rejects(resolveMarketDepthR4Commit({
    loadEnv: false,
    resolutionManifest: resolutionManifest({ batch_digest: "e".repeat(64) }),
    fetchRows: async () => [],
  }), /batch digest is invalid/);
});

test("R4 resolver returns inconsistent for partial or mismatched state", async () => {
  const rows = committedRows();
  const partial = await resolveMarketDepthR4Commit({
    loadEnv: false,
    resolutionManifest: resolutionManifest(),
    fetchRows: async (table) => table === "market_listings" ? [rows.listing] : [],
  });
  assert.equal(partial.state, "inconsistent");

  const mismatched = structuredClone(rows.observation);
  mismatched.price = 981;
  const result = await resolveMarketDepthR4Commit({
    loadEnv: false,
    resolutionManifest: resolutionManifest(),
    fetchRows: async (table) => table === "market_listings" ? [rows.listing] : [mismatched],
  });
  assert.equal(result.state, "inconsistent");
});
