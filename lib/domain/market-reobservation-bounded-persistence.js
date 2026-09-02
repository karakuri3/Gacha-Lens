import crypto from "node:crypto";

import { canonicalJson, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";
import { canonicalMarketplaceSource } from "./market-canary-write.js";
import { marketReobservationObservationId } from "./market-reobservation.js";

export const MARKET_REOBSERVATION_BOUNDED_MIN_BATCH = 1;
export const MARKET_REOBSERVATION_BOUNDED_MAX_BATCH = 10;
export const MARKET_REOBSERVATION_BOUNDED_MAX_ATTEMPTS = MARKET_REOBSERVATION_BOUNDED_MAX_BATCH * 3;
export const MARKET_REOBSERVATION_BOUNDED_RPC = "apply_market_reobservation_bounded_v1";
export const MARKET_REOBSERVATION_BOUNDED_CONFIRMATION = "APPROVE_MARKET_REOBSERVATION_BOUNDED_V1";
export const MARKET_REOBSERVATION_BOUNDED_SUCCESS_OUTCOMES = Object.freeze([
  "unchanged",
  "price_changed",
  "status_changed",
]);

const HEAD_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OBSERVATION_ID = /^market-reobservation-[0-9a-f]{32}$/;
const ALLOWED_LISTING_CHANGE_KEYS = Object.freeze(["last_observed_at", "price", "status", "updated_at"]);
const ALLOWED_PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);
const ALLOWED_STATUSES = new Set(["active", "sold_out"]);

export function buildMarketReobservationBoundedCohortDigest({ headSha, observationKey, cohort = [] } = {}) {
  const head = clean(headSha).toLowerCase();
  const key = safeObservationKey(observationKey);
  if (!HEAD_SHA.test(head) || !key || !validBatchLength(cohort)) {
    throw new Error("Bounded re-observation cohort identity is incomplete.");
  }

  const frozen = cohort.map(frozenCohortEntry).sort((left, right) => left.id.localeCompare(right.id, "en"));
  if (new Set(frozen.map((row) => row.id)).size !== frozen.length) {
    throw new Error("Bounded re-observation cohort listing IDs must be unique.");
  }

  return crypto.createHash("sha256").update(canonicalJson({
    version: 1,
    kind: "market_reobservation_bounded_v1",
    head_sha: head,
    observation_key: key,
    listings: frozen,
  }), "utf8").digest("hex");
}

export function expectedMarketReobservationBoundedApproval({ headSha, cohortDigest } = {}) {
  const head = clean(headSha).toLowerCase();
  const digest = clean(cohortDigest).toLowerCase();
  if (!HEAD_SHA.test(head) || !SHA256.test(digest)) throw new Error("Bounded re-observation approval identity is invalid.");
  return `${MARKET_REOBSERVATION_BOUNDED_CONFIRMATION}:${head}:${digest}`;
}

export function validateMarketReobservationBoundedInvocation(input = {}) {
  const mode = clean(input.mode);
  const head = clean(input.head_sha).toLowerCase();
  const expectedMain = clean(input.expected_main_sha).toLowerCase();
  const digest = clean(input.cohort_digest).toLowerCase();
  if (!new Set(["dry-run", "canary-write"]).has(mode)
    || !HEAD_SHA.test(head)
    || expectedMain !== head
    || !SHA256.test(digest)) {
    throw new Error("Bounded re-observation invocation is not bound to exact current main and cohort.");
  }
  if (mode === "dry-run") {
    if (clean(input.approval)) throw new Error("Bounded re-observation dry-run must not include write approval.");
    return { mode, write_authorized: false, head_sha: head, cohort_digest: digest };
  }
  if (input.approval !== expectedMarketReobservationBoundedApproval({ headSha: head, cohortDigest: digest })) {
    throw new Error("Bounded re-observation canary-write approval is invalid.");
  }
  return { mode, write_authorized: true, head_sha: head, cohort_digest: digest };
}

export function buildMarketReobservationBoundedRpcBatch({ cohort = [], plans = [], observationKey } = {}) {
  const key = safeObservationKey(observationKey);
  if (!key || !validBatchLength(cohort) || !Array.isArray(plans) || plans.length !== cohort.length) {
    throw new Error("Bounded re-observation RPC batch requires a 1-10 entry frozen cohort and matching plans.");
  }

  const byId = new Map(cohort.map((entry) => [clean(entry?.listing?.id), entry]));
  if (byId.size !== cohort.length || byId.has("")) throw new Error("Bounded re-observation cohort identities are invalid.");

  const batch = plans.map((plan) => buildRpcEntry({
    cohortEntry: byId.get(clean(plan?.listing_id)),
    plan,
    observationKey: key,
  }));
  const listingIds = batch.map((entry) => entry.listing_id);
  const observationIds = batch.map((entry) => entry.observation_id);
  if (new Set(listingIds).size !== batch.length || new Set(observationIds).size !== batch.length) {
    throw new Error("Bounded re-observation RPC identities must be unique.");
  }
  return batch.sort((left, right) => left.listing_id.localeCompare(right.listing_id, "en"));
}

export function buildMarketReobservationBoundedDryRunArtifact({ headSha, cohortDigest, observationKey, batch } = {}) {
  const head = clean(headSha).toLowerCase();
  const digest = clean(cohortDigest).toLowerCase();
  const key = safeObservationKey(observationKey);
  if (!HEAD_SHA.test(head) || !SHA256.test(digest) || !key || !validBatchLength(batch)) {
    throw new Error("Bounded re-observation dry-run artifact input is invalid.");
  }
  const newlyReobserved = batch.filter((entry) => Number(entry.expected_prior_observation_count) === 1).length;
  return {
    schema_version: 1,
    kind: "market_reobservation_bounded_atomic_preflight",
    head_sha: head,
    cohort_digest: digest,
    observation_key: key,
    batch_size: batch.length,
    listing_ids: batch.map((entry) => entry.listing_id),
    observation_ids: batch.map((entry) => entry.observation_id),
    prior_observation_counts: Object.fromEntries(batch.map((entry) => [entry.listing_id, entry.expected_prior_observation_count])),
    expected_newly_reobserved_delta: newlyReobserved,
    projected_writes: {
      market_listing_inserts: 0,
      market_listing_updates: batch.length,
      observation_inserts: batch.length,
      deletes: 0,
      completed_sold: 0,
    },
    rpc: MARKET_REOBSERVATION_BOUNDED_RPC,
    provider_requests: 0,
    rpc_calls: 0,
    production_actions: 0,
    write_authorized: false,
  };
}

export function validateMarketReobservationBoundedRpcResult(result = {}, expected = {}) {
  const batchSize = Number(expected.batchSize);
  const newlyReobserved = Number(expected.newlyReobservedDelta);
  const key = safeObservationKey(expected.observationKey);
  if (!Number.isInteger(batchSize)
    || batchSize < MARKET_REOBSERVATION_BOUNDED_MIN_BATCH
    || batchSize > MARKET_REOBSERVATION_BOUNDED_MAX_BATCH
    || !Number.isInteger(newlyReobserved)
    || newlyReobserved < 0
    || newlyReobserved > batchSize
    || !key
    || !result
    || typeof result !== "object"
    || Array.isArray(result)
    || Number(result.schema_version) !== 1
    || result.kind !== "market_reobservation_bounded_atomic_v1"
    || Number(result.applied_count) !== batchSize
    || Number(result.market_listing_delta) !== 0
    || Number(result.observation_delta) !== batchSize
    || Number(result.newly_reobserved_delta) !== newlyReobserved
    || Number(result.completed_sold_delta) !== 0
    || result.observation_key !== key
    || !Array.isArray(result.listing_ids)
    || !Array.isArray(result.observation_ids)
    || result.listing_ids.length !== batchSize
    || result.observation_ids.length !== batchSize
    || new Set(result.listing_ids.map(clean)).size !== batchSize
    || new Set(result.observation_ids.map(clean)).size !== batchSize
    || result.observation_ids.some((id) => !OBSERVATION_ID.test(clean(id)))) {
    throw new Error("Bounded re-observation atomic RPC result failed closed verification.");
  }
  return {
    verified: true,
    applied_count: batchSize,
    market_listing_delta: 0,
    observation_delta: batchSize,
    newly_reobserved_delta: newlyReobserved,
    completed_sold_delta: 0,
    observation_key: key,
    listing_ids: [...result.listing_ids].map(clean).sort((a, b) => a.localeCompare(b, "en")),
    observation_ids: [...result.observation_ids].map(clean).sort((a, b) => a.localeCompare(b, "en")),
  };
}

export function freezeMarketReobservationBoundedCohortEntry(entry) {
  return frozenCohortEntry(entry);
}

function buildRpcEntry({ cohortEntry, plan, observationKey }) {
  const listing = cohortEntry?.listing;
  const priorCount = positiveInteger(cohortEntry?.prior_observation_count);
  if (!listing || priorCount === null || !plan
    || !MARKET_REOBSERVATION_BOUNDED_SUCCESS_OUTCOMES.includes(plan.outcome)
    || plan.observation_key !== observationKey
    || clean(plan.listing_id) !== clean(listing.id)
    || !plan.writes?.observation_insert
    || !plan.writes?.listing_update) {
    throw new Error("Bounded re-observation requires successful exact-provider seen plans for every frozen listing.");
  }

  const identity = resolveBoundedMarketplaceIdentity(listing);
  const expectedSource = identity.provider ? canonicalMarketplaceSource(identity.provider) : "";
  if (!identity.complete
    || identity.derivedId !== listing.id
    || !ALLOWED_PROVIDERS.has(identity.provider)
    || listing.source !== expectedSource) {
    throw new Error("Bounded re-observation persisted marketplace identity is invalid.");
  }

  const observation = plan.writes.observation_insert;
  const listingUpdate = plan.writes.listing_update;
  const changeKeys = Object.keys(listingUpdate.changes ?? {}).sort((a, b) => a.localeCompare(b, "en"));
  if (listingUpdate.id !== listing.id || canonicalJson(changeKeys) !== canonicalJson([...ALLOWED_LISTING_CHANGE_KEYS].sort())) {
    throw new Error("Bounded re-observation listing update is outside the allowlist.");
  }

  const expectedObservationId = marketReobservationObservationId({
    listingId: listing.id,
    provider: identity.provider,
    observationKey,
  });
  if (observation.id !== expectedObservationId
    || observation.listing_id !== listing.id
    || observation.variant_id !== listing.variant_id
    || observation.series_id !== listing.series_id
    || observation.source !== listing.source
    || clean(observation.status) !== clean(listingUpdate.changes.status)
    || Number(observation.price) !== Number(listingUpdate.changes.price)
    || clean(observation.observed_at) !== clean(listingUpdate.changes.last_observed_at)
    || clean(listingUpdate.changes.last_observed_at) !== clean(listingUpdate.changes.updated_at)) {
    throw new Error("Bounded re-observation planned observation/listing update identity drifted.");
  }

  const observedAt = validIso(observation.observed_at);
  const expectedLastObservedAt = validIso(listing.last_observed_at);
  const expectedPrice = positiveInteger(listing.price);
  const newPrice = positiveInteger(observation.price);
  const expectedStatus = clean(listing.status);
  const newStatus = clean(observation.status);
  if (!observedAt || !expectedLastObservedAt || observedAt <= expectedLastObservedAt
    || expectedPrice === null || newPrice === null
    || !ALLOWED_STATUSES.has(expectedStatus)
    || !ALLOWED_STATUSES.has(newStatus)) {
    throw new Error("Bounded re-observation planned scalar values are invalid or stale.");
  }

  return {
    listing_id: listing.id,
    observation_id: observation.id,
    provider: identity.provider,
    source_listing_id: identity.sourceListingId,
    public_url: identity.publicUrl,
    variant_id: listing.variant_id,
    series_id: listing.series_id,
    source: listing.source,
    observation_key: observationKey,
    observed_at: observedAt,
    price: newPrice,
    status: newStatus,
    expected_price: expectedPrice,
    expected_status: expectedStatus,
    expected_last_observed_at: expectedLastObservedAt,
    expected_prior_observation_count: priorCount,
  };
}

function frozenCohortEntry(entry) {
  const listing = entry?.listing;
  const priorCount = positiveInteger(entry?.prior_observation_count);
  const identity = resolveBoundedMarketplaceIdentity(listing);
  const price = positiveInteger(listing?.price);
  const status = clean(listing?.status);
  const lastObservedAt = validIso(listing?.last_observed_at);
  let expectedSource = "";
  try {
    expectedSource = identity.provider ? canonicalMarketplaceSource(identity.provider) : "";
  } catch {
    expectedSource = "";
  }
  const reviewSafe = listing?.listing_type === "single"
    && listing?.market_review_type === "single"
    && listing?.review_required !== true
    && listing?.source_type === "marketplace"
    && listing?.sold_at == null
    && listing?.matched_variant_id === listing?.variant_id;
  if (!listing?.id
    || priorCount === null
    || !identity.complete
    || identity.derivedId !== listing.id
    || !ALLOWED_PROVIDERS.has(identity.provider)
    || listing.source !== expectedSource
    || !listing.variant_id
    || !listing.series_id
    || price === null
    || !lastObservedAt
    || !ALLOWED_STATUSES.has(status)
    || !reviewSafe) {
    throw new Error("Bounded re-observation frozen cohort contract is invalid.");
  }
  return {
    id: listing.id,
    variant_id: listing.variant_id,
    series_id: listing.series_id,
    source: listing.source,
    provider: identity.provider,
    source_listing_id: identity.sourceListingId,
    public_url: identity.publicUrl,
    price,
    status,
    last_observed_at: lastObservedAt,
    prior_observation_count: priorCount,
  };
}

function validBatchLength(value) {
  return Array.isArray(value)
    && value.length >= MARKET_REOBSERVATION_BOUNDED_MIN_BATCH
    && value.length <= MARKET_REOBSERVATION_BOUNDED_MAX_BATCH;
}

function validIso(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function positiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function safeObservationKey(value) {
  const key = clean(value);
  return key && key.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : "";
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
