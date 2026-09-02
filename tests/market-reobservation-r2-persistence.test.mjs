import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  buildMarketReobservationR2CohortDigest,
  buildMarketReobservationR2DryRunArtifact,
  buildMarketReobservationR2RpcBatch,
  expectedMarketReobservationR2Approval,
  validateMarketReobservationR2Invocation,
  validateMarketReobservationR2RpcResult,
} from "../lib/domain/market-reobservation-r2-persistence.js";

const HEAD = "82ef2532253a99b1ba1c46b48a22442281c27442";
const KEY = "reobs-v1:r2-20260902-01";

function listingFixture(index, provider = index < 2 ? "rakuten_ichiba" : "yahoo_shopping") {
  const rakuten = provider === "rakuten_ichiba";
  const sourceListingId = rakuten ? `shop-${index}:item-${index}` : `shop-${index}_item-${index}`;
  const publicUrl = rakuten
    ? `https://item.rakuten.co.jp/shop-${index}/item-${index}`
    : `https://store.shopping.yahoo.co.jp/shop-${index}/item-${index}.html`;
  const source = rakuten ? "rakuten" : "yahoo_shopping";
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
    source,
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

function fourListings() {
  return [
    listingFixture(0, "rakuten_ichiba"),
    listingFixture(1, "rakuten_ichiba"),
    listingFixture(2, "yahoo_shopping"),
    listingFixture(3, "yahoo_shopping"),
  ];
}

test("R2 cohort digest is stable across listing order and approval binds exact head+digest", () => {
  const listings = fourListings();
  const first = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings });
  const reordered = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings: [...listings].reverse() });
  assert.equal(first, reordered);
  assert.match(first, /^[0-9a-f]{64}$/);

  const approval = expectedMarketReobservationR2Approval({ headSha: HEAD, cohortDigest: first });
  assert.match(approval, /^APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1:/);
  assert.deepEqual(validateMarketReobservationR2Invocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: first,
    approval,
  }), { mode: "canary-write", write_authorized: true, head_sha: HEAD, cohort_digest: first });

  assert.throws(() => validateMarketReobservationR2Invocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: first,
    approval: `${approval}-wrong`,
  }), /approval is invalid/);
});

test("R2 dry-run cannot carry write authorization", () => {
  const digest = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings: fourListings() });
  assert.deepEqual(validateMarketReobservationR2Invocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval: "",
  }), { mode: "dry-run", write_authorized: false, head_sha: HEAD, cohort_digest: digest });
  assert.throws(() => validateMarketReobservationR2Invocation({
    mode: "dry-run",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval: "anything",
  }), /must not include write approval/);
});

test("R2 builds exactly four deterministic atomic RPC entries from successful seen plans", () => {
  const listings = fourListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index, index === 1 ? { price: listing.price + 20 } : {}));
  const batch = buildMarketReobservationR2RpcBatch({ listings, plans, observationKey: KEY });
  assert.equal(batch.length, 4);
  assert.equal(new Set(batch.map((entry) => entry.listing_id)).size, 4);
  assert.equal(new Set(batch.map((entry) => entry.observation_id)).size, 4);
  assert.ok(batch.every((entry) => entry.observation_key === KEY));
  assert.ok(batch.every((entry) => /^market-reobservation-[0-9a-f]{32}$/.test(entry.observation_id)));
  assert.deepEqual(batch.map((entry) => entry.listing_id), [...batch.map((entry) => entry.listing_id)].sort((a, b) => a.localeCompare(b, "en")));
  assert.equal(batch.find((entry) => entry.listing_id === listings[1].id).price, listings[1].price + 20);
  assert.equal(batch.find((entry) => entry.listing_id === listings[1].id).expected_price, listings[1].price);
});

test("R2 refuses partial/failure plans and out-of-allowlist listing changes", () => {
  const listings = fourListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index));
  plans[2] = {
    outcome: "not_found",
    listing_id: listings[2].id,
    observation_key: KEY,
    writes: { observation_insert: null, listing_update: null },
  };
  assert.throws(() => buildMarketReobservationR2RpcBatch({ listings, plans, observationKey: KEY }), /requires four successful/);

  const safePlans = listings.map((listing, index) => seenPlan(listing, index));
  safePlans[0] = structuredClone(safePlans[0]);
  safePlans[0].writes.listing_update.changes.sold_at = "2026-09-02T00:00:00.000Z";
  assert.throws(() => buildMarketReobservationR2RpcBatch({ listings, plans: safePlans, observationKey: KEY }), /outside the allowlist/);
});

test("R2 dry-run artifact advertises the bounded +4 history delta and zero Production actions", () => {
  const listings = fourListings();
  const plans = listings.map((listing, index) => seenPlan(listing, index));
  const batch = buildMarketReobservationR2RpcBatch({ listings, plans, observationKey: KEY });
  const digest = buildMarketReobservationR2CohortDigest({ headSha: HEAD, observationKey: KEY, listings });
  const artifact = buildMarketReobservationR2DryRunArtifact({ headSha: HEAD, cohortDigest: digest, observationKey: KEY, batch });
  assert.equal(artifact.projected_writes.market_listing_inserts, 0);
  assert.equal(artifact.projected_writes.market_listing_updates, 4);
  assert.equal(artifact.projected_writes.observation_inserts, 4);
  assert.equal(artifact.projected_writes.deletes, 0);
  assert.equal(artifact.projected_writes.completed_sold, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.write_authorized, false);
});

test("R2 RPC result verification is exact and fails closed on unexpected deltas", () => {
  const listingIds = ["l4", "l2", "l1", "l3"];
  const observationIds = [1, 2, 3, 4].map((value) => `market-reobservation-${String(value).repeat(32)}`);
  const result = validateMarketReobservationR2RpcResult({
    schema_version: 1,
    kind: "market_reobservation_r2_atomic_canary",
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
  assert.throws(() => validateMarketReobservationR2RpcResult({
    ...result,
    observation_delta: 3,
  }), /failed closed verification/);
});

test("R2 migration is invoker-only, service-role-only, atomic and does not create completed sold", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql", import.meta.url), "utf8");
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /lock table public\.market_listing_observations in share row exclusive mode/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /jsonb_array_length\(p_batch\) <> 4/i);
  assert.match(migration, /r2_prior_observation_count_changed/);
  assert.match(migration, /r2_observation_id_collision/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /revoke execute on function public\.apply_market_reobservation_r2_canary_v1\(jsonb\) from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_market_reobservation_r2_canary_v1\(jsonb\) to service_role/i);
  assert.match(migration, /status = v_status/);
  assert.match(migration, /last_observed_at = v_observed_at/);
  assert.doesNotMatch(migration, /set[\s\S]{0,160}sold_at\s*=/i);
  assert.doesNotMatch(migration, /status\s*=\s*['"]sold['"]/i);
});
