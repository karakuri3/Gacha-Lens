import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMarketplaceListingId } from "../lib/domain/market-canary-write.js";
import { planMarketReobservation } from "../lib/domain/market-reobservation.js";
import {
  buildMarketReobservationBoundedCohortDigest,
  buildMarketReobservationBoundedDryRunArtifact,
  buildMarketReobservationBoundedRpcBatch,
  expectedMarketReobservationBoundedApproval,
  validateMarketReobservationBoundedInvocation,
  validateMarketReobservationBoundedRpcResult,
} from "../lib/domain/market-reobservation-bounded-persistence.js";

const HEAD = "02fb1f502b75ddd4d723f40dd4ff5eab838268cc";
const KEY = "reobs-v1:bounded-20260903-01";

function listingFixture(index, provider = index % 2 === 0 ? "rakuten_ichiba" : "yahoo_shopping") {
  const rakuten = provider === "rakuten_ichiba";
  const sourceListingId = rakuten ? `shop-${index}:10${index}` : `shop-${index}_10${index}`;
  const publicUrl = rakuten
    ? `https://item.rakuten.co.jp/shop-${index}/item-${index}/`
    : `https://store.shopping.yahoo.co.jp/shop-${index}/item-${index}.html`;
  const source = rakuten ? "rakuten" : "yahoo_shopping";
  const id = buildMarketplaceListingId({ provider, sourceListingId, publicUrl });
  return {
    id,
    variant_id: `variant-${index}`,
    matched_variant_id: `variant-${index}`,
    series_id: `series-${index}`,
    title: `Bounded ${index}`,
    listing_type: "single",
    market_review_type: "single",
    price: 500 + index * 10,
    status: "active",
    source,
    source_type: "marketplace",
    source_url: publicUrl,
    sold_at: null,
    review_required: false,
    last_observed_at: "2026-09-02T00:00:00.000Z",
    raw: { provider, source_listing_id: sourceListingId, public_url: publicUrl },
  };
}

function cohortOf(count, priorCounts = []) {
  return Array.from({ length: count }, (_, index) => ({
    listing: listingFixture(index),
    prior_observation_count: priorCounts[index] ?? 1,
  }));
}

function seenPlan(entry, index) {
  const listing = entry.listing;
  return planMarketReobservation({
    listing,
    providerResult: {
      outcome: "seen",
      provider: listing.raw.provider,
      source_listing_id: listing.raw.source_listing_id,
      public_url: listing.raw.public_url,
      price: listing.price,
      status: listing.status,
    },
    observedAt: `2026-09-03T0${index}:00:00.000Z`,
    observationKey: KEY,
  });
}

test("bounded cohort digest is order-stable, prior-count-sensitive and approval namespace is isolated", () => {
  const cohort = cohortOf(3, [1, 2, 4]);
  const digest = buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort });
  const reversed = buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: [...cohort].reverse() });
  assert.equal(digest, reversed);
  assert.match(digest, /^[0-9a-f]{64}$/);

  const changedPrior = structuredClone(cohort);
  changedPrior[1].prior_observation_count = 3;
  assert.notEqual(buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: changedPrior }), digest);

  const approval = expectedMarketReobservationBoundedApproval({ headSha: HEAD, cohortDigest: digest });
  assert.match(approval, /^APPROVE_MARKET_REOBSERVATION_BOUNDED_V1:/);
  assert.deepEqual(validateMarketReobservationBoundedInvocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval,
  }), { mode: "canary-write", write_authorized: true, head_sha: HEAD, cohort_digest: digest });

  assert.throws(() => validateMarketReobservationBoundedInvocation({
    mode: "canary-write",
    head_sha: HEAD,
    expected_main_sha: HEAD,
    cohort_digest: digest,
    approval: `APPROVE_MARKET_REOBSERVATION_R2_CANARY_V2:${HEAD}:${digest}`,
  }), /approval is invalid/);
});

test("bounded cohort accepts 1 and 10 entries, rejects 0/11/duplicates and invalid provider-source identity", () => {
  assert.match(buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: cohortOf(1) }), /^[0-9a-f]{64}$/);
  assert.match(buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: cohortOf(10) }), /^[0-9a-f]{64}$/);
  assert.throws(() => buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: [] }), /incomplete/);
  assert.throws(() => buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: cohortOf(11) }), /incomplete/);

  const duplicate = cohortOf(2);
  duplicate[1] = { ...duplicate[1], listing: structuredClone(duplicate[0].listing) };
  assert.throws(() => buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: duplicate }), /unique/);

  const badSource = cohortOf(1);
  badSource[0].listing.source = "yahoo_shopping";
  assert.throws(() => buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort: badSource }), /contract is invalid/);
});

test("bounded RPC batch supports mixed providers and prior observation counts greater than one", () => {
  const cohort = cohortOf(4, [1, 2, 3, 1]);
  const plans = cohort.map(seenPlan);
  const batch = buildMarketReobservationBoundedRpcBatch({ cohort, plans, observationKey: KEY });
  assert.equal(batch.length, 4);
  assert.deepEqual(new Set(batch.map((entry) => entry.provider)), new Set(["rakuten_ichiba", "yahoo_shopping"]));
  assert.deepEqual(batch.map((entry) => entry.expected_prior_observation_count).sort((a, b) => a - b), [1, 1, 2, 3]);
  assert.ok(batch.every((entry) => entry.source === (entry.provider === "rakuten_ichiba" ? "rakuten" : "yahoo_shopping")));
  assert.ok(batch.every((entry) => /^market-reobservation-[0-9a-f]{32}$/.test(entry.observation_id)));
});

test("bounded dry-run validates deterministic identities and exposes zero external actions", () => {
  const cohort = cohortOf(2, [1, 3]);
  const plans = cohort.map(seenPlan);
  const batch = buildMarketReobservationBoundedRpcBatch({ cohort, plans, observationKey: KEY });
  const digest = buildMarketReobservationBoundedCohortDigest({ headSha: HEAD, observationKey: KEY, cohort });
  const artifact = buildMarketReobservationBoundedDryRunArtifact({ headSha: HEAD, cohortDigest: digest, observationKey: KEY, batch });
  assert.equal(artifact.batch_size, 2);
  assert.equal(artifact.expected_newly_reobserved_delta, 1);
  assert.equal(artifact.provider_requests, 0);
  assert.equal(artifact.rpc_calls, 0);
  assert.equal(artifact.production_actions, 0);
  assert.equal(artifact.write_authorized, false);
  assert.throws(() => buildMarketReobservationBoundedDryRunArtifact({
    headSha: HEAD,
    cohortDigest: digest,
    observationKey: KEY,
    batch: [{ listing_id: "x", observation_id: "bad", expected_prior_observation_count: 1 }],
  }), /batch identity is invalid/);
});

test("bounded RPC result must match the exact expected listing and observation ID sets", () => {
  const cohort = cohortOf(2, [1, 2]);
  const plans = cohort.map(seenPlan);
  const batch = buildMarketReobservationBoundedRpcBatch({ cohort, plans, observationKey: KEY });
  const expected = {
    batchSize: batch.length,
    newlyReobservedDelta: 1,
    observationKey: KEY,
    listingIds: batch.map((entry) => entry.listing_id),
    observationIds: batch.map((entry) => entry.observation_id),
  };
  const raw = {
    schema_version: 1,
    kind: "market_reobservation_bounded_atomic_v1",
    applied_count: 2,
    observation_key: KEY,
    listing_ids: [...expected.listingIds].reverse(),
    observation_ids: [...expected.observationIds].reverse(),
    market_listing_delta: 0,
    observation_delta: 2,
    newly_reobserved_delta: 1,
    completed_sold_delta: 0,
  };
  const verified = validateMarketReobservationBoundedRpcResult(raw, expected);
  assert.equal(verified.verified, true);
  assert.deepEqual(verified.listing_ids, [...expected.listingIds].sort((a, b) => a.localeCompare(b, "en")));
  assert.throws(() => validateMarketReobservationBoundedRpcResult({ ...raw, listing_ids: [raw.listing_ids[0], "other"] }, expected), /failed closed verification/);
  assert.throws(() => validateMarketReobservationBoundedRpcResult({ ...raw, observation_ids: [raw.observation_ids[0], "market-reobservation-ffffffffffffffffffffffffffffffff"] }, expected), /failed closed verification/);
});

test("bounded migration is generic 1-10, atomic, invoker-only, service-role-only and never writes completed sold", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/20260902213000_market_reobservation_bounded_v1.sql", import.meta.url), "utf8");
  const r2v1 = fs.readFileSync(new URL("../supabase/migrations/20260902150500_r2_atomic_reobservation_canary.sql", import.meta.url), "utf8");
  const r2v2 = fs.readFileSync(new URL("../supabase/migrations/20260902180000_r2_yahoo_only_reobservation_canary_v2.sql", import.meta.url), "utf8");
  assert.match(r2v1, /apply_market_reobservation_r2_canary_v1/);
  assert.match(r2v2, /apply_market_reobservation_r2_canary_v2/);
  assert.match(migration, /apply_market_reobservation_bounded_v1/);
  assert.match(migration, /v_batch_size < 1 or v_batch_size > 10/i);
  assert.match(migration, /rakuten_ichiba[\s\S]{0,100}v_source = 'rakuten'/i);
  assert.match(migration, /yahoo_shopping[\s\S]{0,100}v_source = 'yahoo_shopping'/i);
  assert.match(migration, /expected_prior_observation_count/i);
  assert.match(migration, /v_post_observation_count <> v_expected_prior_observation_count \+ 1/i);
  assert.match(migration, /lock table public\.market_listing_observations in share row exclusive mode/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,160}sold_at\s*=/i);
  assert.doesNotMatch(migration, /status\s*=\s*['"]sold['"]/i);
});
