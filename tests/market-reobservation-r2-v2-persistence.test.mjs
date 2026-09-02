import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  buildMarketReobservationR2V2CohortDigest,
  buildMarketReobservationR2V2DryRunArtifact,
  buildMarketReobservationR2V2RpcBatch,
  expectedMarketReobservationR2V2Approval,
  MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY,
  validateMarketReobservationR2V2Invocation,
  validateMarketReobservationR2V2RpcResult,
} from "../lib/domain/market-reobservation-r2-v2-persistence.js";

const HEAD = "e43a7c146d329bc3f5e5436b62b3e8d634cb1292";
const KEY = MARKET_REOBSERVATION_R2_V2_OBSERVATION_KEY;

function listingFixture(index) {
  const provider = "yahoo_shopping";
  const sourceListingId = `shop-${index}_item-${index}`;
  const publicUrl = `https://store.shopping.yahoo.co.jp/shop-${index}/item-${index}.html`;
  return {
    id: buildMarketplaceListingId({ provider, sourceListingId, publicUrl }),
    variant_id: `variant-${index}`,
    matched_variant_id: `variant-${index}`,
    series_id: `series-${index}`,
    title: `Example ${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 500 + index * 10,
    status: "active",
    source: "yahoo_shopping",
    source_type: "marketplace",
    source_url: publicUrl,
    sold_at: null,
    review_required: false,
    last_observed_at: "2026-09-01T00:00:00.000Z",
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
  };
}

function seenPlan(listing, index, overrides = {}) {
  return planMarketReobservation({
    listing,
    providerResult: {
      outcome: "seen",
      provider: listing.raw.provider,
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.raw.public_url,
      price: overrides.price ?? listing.price,
      status: overrides.status ?? listing.status,
    },
    observedAt: overrides.observedAt ?? `2026-09-02T0${index}:00:00.000Z`,
    observationKey: KEY,
  });
}

function fourYahooListings() {
  return [0, 1, 2, 3].map(listingFixture);
}

test("R2 v2 cohort digest is Yahoo-only, stable across order, and approval is V2-specific", () => {
  const listings = fourYahooListings();
  const first = buildMarketReobservationR2V2CohortDigest({ headSha: HEAD, observationKey: KEY, listings });
  const reordered = buildMarketReobservationR2V2CohortDigest({ headSha: HEAD, observationKey: KEY, listings: [...listings].reverse() });
  assert.equal(first, reordered);
  assert.match(first, /^[0-9a-f]{64}$/);

  const approval = expectedMarketReobservationR2V2Approval({ headSha: HEAD, cohortDigest: first });
  assert.match(approval, /^APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:/);
  assert.deepEqual(validateMarketReobservationR2V2Invocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: first,
    approval,
  }), { mode: "canary-write", write_authorized: true, head_sha: HEAD, cohort_digest: first });

  assert.throws(() => validateMarketReobservationR2V2Invocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: first,
    approval: `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:${HEAD}:${first}`,
  }), /approval is invalid/);

  const rakuten = { ...listings[0], source: "rakuten", raw: { ...listings[0].raw, provider: "rakuten_ichiba" } };
  assert.throws(() => buildMarketReobservationR2V2CohortDigest({
    headSha: HEAD,
    observationKey: KEY,
    listings: [rakuten, ...listings.slice(1)],
  }), /frozen Yahoo listing contract is invalid/);
});

test("R2 v2 refuses the old observation key and dry-run write authorization", () => {
  const listings = fourYahooListings();
  assert.throws(() => buildMarketReobservationR2V2CohortDigest({
    headSha: HEAD,
    observationKey: "reobs-v1:r2-20260902-01",
    listings,
  }), /wrong observation key/);
  const digest = buildMarketReobservationR2V2CohortDigest({ headSha: HEAD, observationKey: KEY, listings });
  assert.deepEqual(validateMarketReobservationR2V2Invocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval: "",
  }), { mode: "dry-run", write_authorized: false, head_sha: HEAD, cohort_digest: digest });
  assert.throws(() => validateMarketReobservationR2V2Invocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval: "anything",
  }), /must not include write approval/);
});

test("R2 v2 builds exactly four deterministic Yahoo RPC entries from successful plans", () => {
  const listings = fourYahooListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index, index === 1 ? { price: listing.price + 20 } : {}));
  const batch = buildMarketReobservationR2V2RpcBatch({ listings, plans, observationKey: KEY });
  assert.equal(batch.length, 4);
  assert.ok(batch.every((entry) => entry.provider === "yahoo_shopping" && entry.source === "yahoo_shopping"));
  assert.equal(new Set(batch.map((entry) => entry.listing_id)).size, 4);
  assert.equal(new Set(batch.map((entry) => entry.observation_id)).size, 4);
  assert.ok(batch.every((entry) => entry.observation_key === KEY));
  assert.ok(batch.every((entry) => /^market-reobservation-[0-9a-f]{32}$/.test(entry.observation_id)));
  assert.deepEqual(batch.map((entry) => entry.listing_id), [...batch.map((entry) => entry.listing_id)].sort((a, b) => a.localeCompare(b, "en")));
});

test("R2 v2 refuses partial/failure plans and out-of-allowlist listing changes", () => {
  const listings = fourYahooListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index));
  plans[2] = {
    outcome: "not_found",
    listing_id: listings[2].id,
    observation_key: KEY,
    writes: { observation_insert: null, listing_update: null },
  };
  assert.throws(() => buildMarketReobservationR2V2RpcBatch({ listings, plans, observationKey: KEY }), /requires four successful/);

  const safePlans = listings.map((listing, index) => seenPlan(listing, index));
  safePlans[0] = structuredClone(safePlans[0]);
  safePlans[0].writes.listing_update.changes.sold_at = "2026-09-02T00:00:00.000Z";
  assert.throws(() => buildMarketReobservationR2V2RpcBatch({ listings, plans: safePlans, observationKey: KEY }), /outside the allowlist/);
});

test("R2 v2 dry-run artifact advertises +4 history and zero Production actions", () => {
  const listings = fourYahooListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index));
  const batch = buildMarketReobservationR2V2RpcBatch({ listings, plans, observationKey: KEY });
  const digest = buildMarketReobservationR2V2CohortDigest({ headSha: HEAD, observationKey: KEY, listings });
  const artifact = buildMarketReobservationR2V2DryRunArtifact({ headSha: HEAD, cohortDigest: digest, observationKey: KEY, batch });
  assert.equal(artifact.schema_version, 2);
  assert.equal(artifact.projected_writes.market_listing_inserts, 0);
  assert.equal(artifact.projected_writes.market_listing_updates, 4);
  assert.equal(artifact.projected_writes.observation_inserts, 4);
  assert.equal(artifact.projected_writes.deletes, 0);
  assert.equal(artifact.projected_writes.completed_sold, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.write_authorized, false);
});

test("R2 v2 RPC result verification is exact", () => {
  const listingIds = ["l4", "l2", "l1", "l3"];
  const observationIds = [1, 2, 3, 4].map((value) => `market-reobservation-${String(value).repeat(32)}`);
  const result = validateMarketReobservationR2V2RpcResult({
    schema_version: 2,
    kind: "market_reobservation_r2_atomic_canary_v2",
    applied_count: 4,
    observation_key: KEY,
    listing_ids: listingIds,
    observation_ids: observationIds,
    market_listing_delta: 0,
    observation_delta: 4,
    reobserved_listing_delta: 4,
    completed_sold_delta: 0,
  });
  assert.equal(result.verified, true);
  assert.deepEqual(result.listing_ids, ["l1", "l2", "l3", "l4"]);
  assert.throws(() => validateMarketReobservationR2V2RpcResult({ ...result, observation_delta: 3 }), /failed closed verification/);
  assert.throws(() => validateMarketReobservationR2V2RpcResult({ ...result, observation_key: "reobs-v1:r2-20260902-01" }), /failed closed verification/);
});

test("R2 v2 migration is Yahoo-only, invoker-only, service-role-only and atomic while v1 remains intact", () => {
  const v1 = fs.readFileSync(new URL("../supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql", import.meta.url), "utf8");
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql", import.meta.url), "utf8");
  assert.match(v1, /apply_market_reobservation_r2_canary_v1/);
  assert.doesNotMatch(v1, /apply_market_reobservation_r2_canary_v2/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /lock table public\.market_listing_observations in share row exclusive mode/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /jsonb_array_length\(p_batch\) <> 4/i);
  assert.match(migration, /v_provider <> 'yahoo_shopping'/i);
  assert.match(migration, /v_source <> 'yahoo_shopping'/i);
  assert.doesNotMatch(migration, /rakuten_ichiba/i);
  assert.match(migration, /reobs-v1:r2-20260902-02/);
  assert.match(migration, /r2_v2_prior_observation_count_changed/);
  assert.match(migration, /r2_v2_observation_id_collision/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /revoke execute on function public\.apply_market_reobservation_r2_canary_v2\(jsonb\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_market_reobservation_r2_canary_v2\(jsonb\) to service_role/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,160}sold_at\s*=/i);
  assert.doesNotMatch(migration, /status\s*=\s*['"]sold['"]/i);
});
