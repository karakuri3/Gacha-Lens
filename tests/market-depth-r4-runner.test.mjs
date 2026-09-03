import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketDepthR4RpcBatch,
  expectedMarketDepthR4Approval,
} from "../lib/domain/market-depth-r4-persistence.js";
import {
  runMarketDepthR4Canary,
} from "../scripts/market-depth-r4-canary.mjs";

const HEAD = "b".repeat(40);
const FINGERPRINT = "d".repeat(64);
const ARTIFACT = "c".repeat(64);
const NOW = new Date("2026-09-02T18:10:00.000Z");

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

function oldListing() {
  return {
    id: "yahoo-suruga-ya-601192353001",
    variant_id: "gashapon-4535123846069000-伏黒恵",
    matched_variant_id: "gashapon-4535123846069000-伏黒恵",
    series_id: "gashapon-4535123846069000",
    title: "existing",
    listing_type: "single",
    market_review_type: "single",
    price: 1670,
    status: "active",
    source: "yahoo_shopping",
    source_type: "marketplace",
    source_url: "https://store.shopping.yahoo.co.jp/suruga-ya/601192353001.html",
    last_observed_at: "2026-08-25T19:02:02.008Z",
    review_required: false,
    raw: {
      provider: "yahoo_shopping",
      source_listing_id: "suruga-ya_601192353001",
      public_url: "https://store.shopping.yahoo.co.jp/suruga-ya/601192353001.html",
    },
  };
}

function insertedPair() {
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
    batch,
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
      classification_details: {},
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
      created_at: frozen.source_r3_generated_at,
      updated_at: frozen.source_r3_generated_at,
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
      created_at: frozen.source_r3_generated_at,
    },
  };
}

function harness() {
  let committed = false;
  let rpcCalls = 0;
  const pair = insertedPair();
  const fetchRows = async (table, options = {}) => {
    const op = options.operationName ?? "";
    if (table === "variants") return [{ id: "gashapon-4535123846069000-伏黒恵", series_id: "gashapon-4535123846069000", variant_type: "single", review_required: false }];
    if (table === "series") return [{ id: "gashapon-4535123846069000" }];
    if (table === "import_issues") return [];
    if (table === "market_listings") {
      if (op === "market_depth_r4.post_listings") return committed ? [pair.listing] : [];
      if (op === "market_depth_r4.post_depth") return committed ? [oldListing(), pair.listing] : [oldListing()];
      return committed ? [oldListing(), pair.listing] : [oldListing()];
    }
    if (table === "market_listing_observations") {
      if (op === "market_depth_r4.post_observations") return committed ? [pair.observation] : [];
      return committed ? [{ id: "legacy-observation" }, pair.observation] : [{ id: "legacy-observation" }];
    }
    throw new Error(`unexpected table ${table}`);
  };
  const fetchRowCount = async (table, params = {}) => {
    if (table === "market_listings" && params.status === "eq.sold") return 0;
    if (table === "market_listings") return committed ? 116 : 115;
    if (table === "market_listing_observations") return committed ? 128 : 127;
    throw new Error(`unexpected count ${table}`);
  };
  const invokeRpc = async (batch) => {
    rpcCalls += 1;
    committed = true;
    return {
      schema_version: 1,
      kind: "market_depth_r4_atomic_v1",
      inserted_count: 1,
      listing_ids: [batch.candidates[0].listing_id],
      observation_ids: [batch.candidates[0].observation_id],
      target_depths: [{ variant_id: batch.candidates[0].variant_id, before: 1, inserted: 1, after: 2 }],
    };
  };
  return { fetchRows, fetchRowCount, invokeRpc, get rpcCalls() { return rpcCalls; } };
}

test("R4 runner dry-run performs SELECT-only preflight with provider0/RPC0/write0", async () => {
  const h = harness();
  const result = await runMarketDepthR4Canary({
    loadEnv: false,
    mode: "dry-run",
    approval: "",
    headSha: HEAD,
    expectedMainSha: HEAD,
    manifest: manifest(),
    fetchRows: h.fetchRows,
    fetchRowCount: h.fetchRowCount,
    now: NOW,
  });
  assert.equal(result.provider_requests, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.production_writes, 0);
  assert.equal(h.rpcCalls, 0);
  assert.equal(result.preflight.candidate_count, 1);
});

test("R4 runner write mode invokes exactly one RPC and verifies +1/+1", async () => {
  const h = harness();
  const frozen = manifest();
  const approval = expectedMarketDepthR4Approval({ headSha: HEAD, manifest: frozen });
  const result = await runMarketDepthR4Canary({
    loadEnv: false,
    mode: "canary-write",
    approval,
    headSha: HEAD,
    expectedMainSha: HEAD,
    manifest: frozen,
    fetchRows: h.fetchRows,
    fetchRowCount: h.fetchRowCount,
    invokeRpc: h.invokeRpc,
    resolutionManifestOut: "/tmp/r4-resolution-test.json",
    persistResolutionManifest: async () => {},
    now: NOW,
  });
  assert.equal(h.rpcCalls, 1);
  assert.equal(result.rpc_calls, 1);
  assert.equal(result.production_writes, 2);
  assert.equal(result.exact_lane_deltas.market_listings, 1);
  assert.equal(result.exact_lane_deltas.observations, 1);
  assert.equal(result.resolution.state, "committed");
  assert.equal(result.target_depths[0].after, 2);
});

test("R4 runner never automatically retries an ambiguous RPC", async () => {
  const h = harness();
  let calls = 0;
  const approval = expectedMarketDepthR4Approval({ headSha: HEAD, manifest: manifest() });
  await assert.rejects(runMarketDepthR4Canary({
    loadEnv: false,
    mode: "canary-write",
    approval,
    headSha: HEAD,
    expectedMainSha: HEAD,
    manifest: manifest(),
    fetchRows: h.fetchRows,
    fetchRowCount: h.fetchRowCount,
    invokeRpc: async () => {
      calls += 1;
      const error = new Error("network");
      error.commit_ambiguous = true;
      throw error;
    },
    resolutionManifestOut: "/tmp/r4-resolution-ambiguous-test.json",
    persistResolutionManifest: async () => {},
    now: NOW,
  }), /SELECT-only resolver/);
  assert.equal(calls, 1);
});

test("R4 runner fails before RPC when target depth drifted", async () => {
  const h = harness();
  let rpcCalls = 0;
  const approval = expectedMarketDepthR4Approval({ headSha: HEAD, manifest: manifest() });
  const driftFetch = async (table, options) => {
    if (table === "market_listings" && options?.operationName === "market_depth_r4.preflight_listings") return [];
    return h.fetchRows(table, options);
  };
  await assert.rejects(runMarketDepthR4Canary({
    loadEnv: false,
    mode: "canary-write",
    approval,
    headSha: HEAD,
    expectedMainSha: HEAD,
    manifest: manifest(),
    fetchRows: driftFetch,
    fetchRowCount: h.fetchRowCount,
    invokeRpc: async () => { rpcCalls += 1; },
    resolutionManifestOut: "/tmp/r4-resolution-drift-test.json",
    persistResolutionManifest: async () => {},
    now: NOW,
  }), /existing-depth snapshot drift/);
  assert.equal(rpcCalls, 0);
});

test("R4 runner write mode requires resolver manifest preservation before RPC", async () => {
  const h = harness();
  let rpcCalls = 0;
  const approval = expectedMarketDepthR4Approval({ headSha: HEAD, manifest: manifest() });
  await assert.rejects(runMarketDepthR4Canary({
    loadEnv: false,
    mode: "canary-write",
    approval,
    headSha: HEAD,
    expectedMainSha: HEAD,
    manifest: manifest(),
    fetchRows: h.fetchRows,
    fetchRowCount: h.fetchRowCount,
    invokeRpc: async () => { rpcCalls += 1; },
    now: NOW,
  }), /requires a resolution manifest output path before RPC/);
  assert.equal(rpcCalls, 0);
});
