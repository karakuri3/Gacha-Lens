import crypto from "node:crypto";

import { canonicalJson, resolveBoundedMarketplaceIdentity } from "./market-bounded-write.js";
import { marketReobservationObservationId } from "./market-reobservation.js";

export const MARKET_REOBSERVATION_R2_BATCH_SIZE = 4;
export const MARKET_REOBSERVATION_R2_RPC = "apply_market_reobservation_r2_canary_v1";
export const MARKET_REOBSERVATION_R2_CONFIRMATION = "APPROVE_MARKET_REOBSERVATION_R2_CANARY_V1";
export const MARKET_REOBSERVATION_R2_SUCCESS_OUTCOMES = Object.freeze([
  "unchanged",
  "price_changed",
  "status_changed",
]);

const HEAD_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OBSERVATION_ID = /^market-reobservation-[0-9a-f]{32}$/;
const ALLOWED_LISTING_CHANGE_KEYS = Object.freeze(["last_observed_at", "price", "status", "updated_at"]);

export function buildMarketReobservationR2CohortDigest({ headSha, observationKey, listings = [] } = {}) {
  const head = clean(headSha).toLowerCase();
  const key = safeObservationKey(observationKey);
  if (!HEAD_SHA.test(head) || !key || !Array.isArray(listings) || listings.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE) {
    throw new Error("R2 cohort identity is incomplete.");
  }

  const frozen = listings.map(frozenListingIdentity).sort((left, right) => left.id.localeCompare(right.id, "en"));
  if (new Set(frozen.map((row) => row.id)).size !== MARKET_REOBSERVATION_R2_BATCH_SIZE) {
    throw new Error("R2 cohort listing IDs must be unique.");
  }

  return crypto.createHash("sha256").update(canonicalJson({
    version: 1,
    kind: "market_reobservation_r2_canary",
    head_sha: head,
    observation_key: key,
    listings: frozen,
  }), "utf8").digest("hex");
}

export function expectedMarketReobservationR2Approval({ headSha, cohortDigest } = {}) {
  const head = clean(headSha).toLowerCase();
  const digest = clean(cohortDigest).toLowerCase();
  if (!HEAD_SHA.test(head) || !SHA256.test(digest)) throw new Error("R2 approval identity is invalid.");
  return `${MARKET_REOBSERVATION_R2_CONFIRMATION}:${head}:${digest}`;
}

export function validateMarketReobservationR2Invocation(input = {}) {
  const mode = clean(input.mode);
  const head = clean(input.head_sha).toLowerCase();
  const expectedMain = clean(input.expected_main_sha).toLowerCase();
  const digest = clean(input.cohort_digest).toLowerCase();
  if (!new Set(["dry-run", "canary-write"]).has(mode)
    || !HEAD_SHA.test(head)
    || expectedMain !== head
    || !SHA256.test(digest)) {
    throw new Error("R2 invocation is not bound to exact current main and cohort.");
  }
  if (mode === "dry-run") {
    if (clean(input.approval)) throw new Error("R2 dry-run must not include write approval.");
    return { mode, write_authorized: false, head_sha: head, cohort_digest: digest };
  }
  if (input.approval !== expectedMarketReobservationR2Approval({ headSha: head, cohortDigest: digest })) {
    throw new Error("R2 canary-write approval is invalid.");
  }
  return { mode, write_authorized: true, head_sha: head, cohort_digest: digest };
}

export function buildMarketReobservationR2RpcBatch({ listings = [], plans = [], observationKey } = {}) {
  const key = safeObservationKey(observationKey);
  if (!key || !Array.isArray(listings) || !Array.isArray(plans)
    || listings.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || plans.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE) {
    throw new Error("R2 RPC batch requires exactly four listings and four plans.");
  }

  const listingsById = new Map(listings.map((listing) => [clean(listing?.id), listing]));
  if (listingsById.size !== MARKET_REOBSERVATION_R2_BATCH_SIZE || listingsById.has("")) {
    throw new Error("R2 RPC batch listing identities are invalid.");
  }

  const batch = plans.map((plan) => buildRpcEntry({ listing: listingsById.get(clean(plan?.listing_id)), plan, observationKey: key }));
  const listingIds = batch.map((entry) => entry.listing_id);
  const observationIds = batch.map((entry) => entry.observation_id);
  if (new Set(listingIds).size !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || new Set(observationIds).size !== MARKET_REOBSERVATION_R2_BATCH_SIZE) {
    throw new Error("R2 RPC batch identities must be unique.");
  }
  return batch.sort((left, right) => left.listing_id.localeCompare(right.listing_id, "en"));
}

export function buildMarketReobservationR2DryRunArtifact({ headSha, cohortDigest, observationKey, batch } = {}) {
  const head = clean(headSha).toLowerCase();
  const digest = clean(cohortDigest).toLowerCase();
  const key = safeObservationKey(observationKey);
  if (!HEAD_SHA.test(head) || !SHA256.test(digest) || !key
    || !Array.isArray(batch) || batch.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE) {
    throw new Error("R2 dry-run artifact input is invalid.");
  }
  return {
    schema_version: 1,
    kind: "market_reobservation_r2_atomic_preflight",
    head_sha: head,
    cohort_digest: digest,
    observation_key: key,
    listing_ids: batch.map((entry) => entry.listing_id),
    observation_ids: batch.map((entry) => entry.observation_id),
    projected_writes: {
      market_listing_inserts: 0,
      market_listing_updates: MARKET_REOBSERVATION_R2_BATCH_SIZE,
      observation_inserts: MARKET_REOBSERVATION_R2_BATCH_SIZE,
      deletes: 0,
      completed_sold: 0,
    },
    rpc: MARKET_REOBSERVATION_R2_RPC,
    production_actions: 0,
    write_authorized: false,
  };
}

export function validateMarketReobservationR2RpcResult(result = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)
    || Number(result.schema_version) !== 1
    || result.kind !== "market_reobservation_r2_atomic_canary"
    || Number(result.applied_count) !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || Number(result.market_listing_delta) !== 0
    || Number(result.observation_delta) !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || Number(result.reobserved_listing_delta) !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || Number(result.completed_sold_delta) !== 0
    || !safeObservationKey(result.observation_key)
    || !Array.isArray(result.listing_ids)
    || !Array.isArray(result.observation_ids)
    || result.listing_ids.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || result.observation_ids.length !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || new Set(result.listing_ids.map(clean)).size !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || new Set(result.observation_ids.map(clean)).size !== MARKET_REOBSERVATION_R2_BATCH_SIZE
    || result.observation_ids.some((id) => !OBSERVATION_ID.test(clean(id)))) {
    throw new Error("R2 atomic RPC result failed closed verification.");
  }
  return {
    verified: true,
    applied_count: MARKET_REOBSERVATION_R2_BATCH_SIZE,
    market_listing_delta: 0,
    observation_delta: MARKET_REOBSERVATION_R2_BATCH_SIZE,
    reobserved_listing_delta: MARKET_REOBSERVATION_R2_BATCH_SIZE,
    completed_sold_delta: 0,
    observation_key: result.observation_key,
    listing_ids: [...result.listing_ids].map(clean).sort((a, b) => a.localeCompare(b, "en")),
    observation_ids: [...result.observation_ids].map(clean).sort((a, b) => a.localeCompare(b, "en")),
  };
}

function buildRpcEntry({ listing, plan, observationKey }) {
  if (!listing || !plan || !MARKET_REOBSERVATION_R2_SUCCESS_OUTCOMES.includes(plan.outcome)
    || plan.observation_key !== observationKey
    || clean(plan.listing_id) !== clean(listing.id)
    || !plan.writes?.observation_insert
    || !plan.writes?.listing_update) {
    throw new Error("R2 requires four successful exact-provider seen plans before persistence.");
  }

  const identity = resolveBoundedMarketplaceIdentity(listing);
  if (!identity.complete || identity.derivedId !== listing.id) throw new Error("R2 persisted listing identity is invalid.");

  const observation = plan.writes.observation_insert;
  const listingUpdate = plan.writes.listing_update;
  const changeKeys = Object.keys(listingUpdate.changes ?? {}).sort((a, b) => a.localeCompare(b, "en"));
  if (listingUpdate.id !== listing.id || canonicalJson(changeKeys) !== canonicalJson([...ALLOWED_LISTING_CHANGE_KEYS].sort())) {
    throw new Error("R2 listing update is outside the allowlist.");
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
    throw new Error("R2 planned observation/listing update identity drifted.");
  }

  const observedAt = validIso(observation.observed_at);
  const expectedLastObservedAt = validIso(listing.last_observed_at);
  const expectedPrice = positiveInteger(listing.price);
  const newPrice = positiveInteger(observation.price);
  const expectedStatus = clean(listing.status);
  const newStatus = clean(observation.status);
  if (!observedAt || !expectedLastObservedAt || observedAt <= expectedLastObservedAt
    || expectedPrice === null || newPrice === null
    || !new Set(["active", "sold_out"]).has(expectedStatus)
    || !new Set(["active", "sold_out"]).has(newStatus)) {
    throw new Error("R2 planned scalar values are invalid or stale.");
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
  };
}

function frozenListingIdentity(listing) {
  const identity = resolveBoundedMarketplaceIdentity(listing);
  const price = positiveInteger(listing?.price);
  const status = clean(listing?.status);
  const lastObservedAt = validIso(listing?.last_observed_at);
  const reviewSafe = listing?.listing_type === "single"
    && listing?.market_review_type === "single"
    && listing?.review_required !== true
    && listing?.source_type === "marketplace"
    && listing?.sold_at == null
    && listing?.matched_variant_id === listing?.variant_id;
  if (!listing?.id || !identity.complete || identity.derivedId !== listing.id
    || !listing.variant_id || !listing.series_id || price === null || !lastObservedAt
    || !new Set(["active", "sold_out"]).has(status)
    || !reviewSafe) {
    throw new Error("R2 frozen listing contract is invalid.");
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
  };
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
