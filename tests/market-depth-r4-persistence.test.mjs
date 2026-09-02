import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  MARKET_DEPTH_R4_CONFIRMATION,
  MARKET_DEPTH_R4_RPC,
  buildMarketDepthR4BatchDigest,
  buildMarketDepthR4RpcBatch,
  expectedMarketDepthR4Approval,
  marketDepthR4ObservationId,
  normalizeMarketDepthR4Manifest,
  preflightMarketDepthR4,
  validateMarketDepthR4Invocation,
  verifyMarketDepthR4Committed,
} from "../lib/domain/market-depth-r4-persistence.js";

const HEAD = "b".repeat(40);
const R3_HEAD = "a".repeat(40);
const ARTIFACT = "c".repeat(64);
const FINGERPRINT = "d".repeat(64);
const NOW = new Date("2026-09-02T18:10:00.000Z");

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    kind: "market_depth_r4_manifest_v1",
    observation_key: "depth-r4-v1:test-01",
    source_r3_run_id: "33665350076",
    source_r3_main_sha: R3_HEAD,
    source_r3_artifact_digest: `sha256:${ARTIFACT}`,
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
    ...overrides,
  };
}

function existingListing() {
  return {
    id: "yahoo-suruga-ya-601192353001",
    variant_id: "gashapon-4535123846069000-伏黒恵",
    matched_variant_id: "gashapon-4535123846069000-伏黒恵",
    series_id: "gashapon-4535123846069000",
    status: "active",
    listing_type: "single",
    review_required: false,
    source: "yahoo_shopping",
    source_url: "https://store.shopping.yahoo.co.jp/suruga-ya/601192353001.html",
    last_observed_at: "2026-08-25T19:02:02.008Z",
    raw: {
      provider: "yahoo_shopping",
      source_listing_id: "suruga-ya_601192353001",
      public_url: "https://store.shopping.yahoo.co.jp/suruga-ya/601192353001.html",
    },
  };
}

test("R4 manifest canonicalization produces stable exact-main digest and approval", () => {
  const frozen = normalizeMarketDepthR4Manifest(manifest());
  assert.equal(frozen.source_r3_artifact_digest, ARTIFACT);
  const left = buildMarketDepthR4BatchDigest({ headSha: HEAD, manifest: frozen });
  const right = buildMarketDepthR4BatchDigest({ headSha: HEAD, manifest: manifest() });
  assert.match(left, /^[0-9a-f]{64}$/);
  assert.equal(left, right);
  assert.equal(expectedMarketDepthR4Approval({ headSha: HEAD, manifest: frozen }), `${MARKET_DEPTH_R4_CONFIRMATION}:${HEAD}:${left}`);
});

test("R4 write approval cannot be reused across main or digest", () => {
  const value = manifest();
  const approval = expectedMarketDepthR4Approval({ headSha: HEAD, manifest: value });
  assert.equal(validateMarketDepthR4Invocation({
    mode: "canary-write", approval, head_sha: HEAD, expected_main_sha: HEAD, manifest: value,
  }).write_authorized, true);
  assert.throws(() => validateMarketDepthR4Invocation({
    mode: "canary-write", approval, head_sha: "e".repeat(40), expected_main_sha: "e".repeat(40), manifest: value,
  }), /approval is invalid/);
  const changed = manifest({ observation_key: "depth-r4-v1:test-02" });
  assert.throws(() => validateMarketDepthR4Invocation({
    mode: "canary-write", approval, head_sha: HEAD, expected_main_sha: HEAD, manifest: changed,
  }), /approval is invalid/);
});

test("R4 dry-run rejects write authority and builds deterministic RPC identities", () => {
  assert.throws(() => validateMarketDepthR4Invocation({
    mode: "dry-run", approval: "unexpected", head_sha: HEAD, expected_main_sha: HEAD, manifest: manifest(),
  }), /must not include write authorization/);
  const batch = buildMarketDepthR4RpcBatch({ manifest: manifest(), headSha: HEAD });
  assert.equal(batch.candidates.length, 1);
  assert.equal(batch.candidates[0].observation_id, marketDepthR4ObservationId({
    observationKey: "depth-r4-v1:test-01",
    candidateKey: "1091dce22a0bf29f",
    listingId: "yahoo-suruga-ya-601199451001",
  }));
  assert.equal(batch.candidates[0].expected_existing_listing_ids[0], "yahoo-suruga-ya-601192353001");
});

test("R4 preflight binds exact catalog, depth snapshot, unresolved issues and collision absence", () => {
  const result = preflightMarketDepthR4({
    manifest: manifest(),
    variants: [{ id: "gashapon-4535123846069000-伏黒恵", series_id: "gashapon-4535123846069000", variant_type: "single", review_required: false }],
    series: [{ id: "gashapon-4535123846069000" }],
    importIssues: [],
    listings: [existingListing()],
    observations: [{ id: "legacy-observation" }],
    now: NOW,
  });
  assert.equal(result.production_writes, 0);
  assert.equal(result.rpc_calls, 0);
  assert.equal(result.candidates[0].projected_depth_after, 2);
});

test("R4 preflight fails closed on depth drift, unresolved issue, listing collision and source identity collision", () => {
  const common = {
    manifest: manifest(),
    variants: [{ id: "gashapon-4535123846069000-伏黒恵", series_id: "gashapon-4535123846069000", variant_type: "single", review_required: false }],
    series: [{ id: "gashapon-4535123846069000" }],
    importIssues: [],
    listings: [existingListing()],
    observations: [],
    now: NOW,
  };
  assert.throws(() => preflightMarketDepthR4({ ...common, listings: [] }), /existing-depth snapshot drift/);
  assert.throws(() => preflightMarketDepthR4({
    ...common,
    importIssues: [{ id: "i1", table_name: "variants", record_id: "gashapon-4535123846069000-伏黒恵", resolved: false }],
  }), /unresolved catalog issue drift/);
  assert.throws(() => preflightMarketDepthR4({
    ...common,
    listings: [...common.listings, {
      ...existingListing(),
      id: "yahoo-suruga-ya-601199451001",
      source_url: "https://store.shopping.yahoo.co.jp/other/1.html",
      raw: { provider: "yahoo_shopping", source_listing_id: "other_1", public_url: "https://store.shopping.yahoo.co.jp/other/1.html" },
    }],
  }), /candidate collision/);
  assert.throws(() => preflightMarketDepthR4({
    ...common,
    listings: [...common.listings, {
      ...existingListing(),
      id: "other-id",
      source_url: "https://store.shopping.yahoo.co.jp/other/2.html",
      raw: { provider: "yahoo_shopping", source_listing_id: "suruga-ya_601199451001", public_url: "https://store.shopping.yahoo.co.jp/other/2.html" },
    }],
  }), /candidate collision/);
});

test("R4 resolver distinguishes not_committed, committed and inconsistent", () => {
  const frozen = normalizeMarketDepthR4Manifest(manifest());
  assert.equal(verifyMarketDepthR4Committed({ manifest: frozen, listings: [], observations: [] }).state, "not_committed");
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
  const listing = {
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
  };
  const observation = {
    id: candidate.observation_id,
    listing_id: candidate.listing_id,
    variant_id: candidate.variant_id,
    series_id: candidate.series_id,
    price: candidate.price,
    status: "active",
    source: "yahoo_shopping",
    observed_at: frozen.source_r3_generated_at,
    raw: { market_depth_r4: marker },
  };
  assert.equal(verifyMarketDepthR4Committed({
    manifest: frozen,
    listings: [listing],
    observations: [observation],
    batchDigest: batch.batch_digest,
  }).state, "committed");
  assert.equal(verifyMarketDepthR4Committed({ manifest: frozen, listings: [listing], observations: [] }).state, "inconsistent");
});

test("R4 migration is atomic insert-only, invoker-only and service-role-only", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260903033000_market_depth_r4_atomic_v1.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.apply_market_depth_r4_atomic_v1\(p_batch jsonb\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /lock table public\.market_listings in share row exclusive mode/i);
  assert.match(migration, /insert into public\.market_listings/i);
  assert.match(migration, /insert into public\.market_listing_observations/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.market_listings\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\./i);
  assert.match(migration, /revoke execute on function public\.apply_market_depth_r4_atomic_v1\(jsonb\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_market_depth_r4_atomic_v1\(jsonb\) to service_role/i);
  assert.match(migration, /extensions\.digest/);
  assert.equal(MARKET_DEPTH_R4_RPC, "apply_market_depth_r4_atomic_v1");
});
