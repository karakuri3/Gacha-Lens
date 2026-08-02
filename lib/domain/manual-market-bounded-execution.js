const SHA256 = /^[0-9a-f]{64}$/;
const HEAD_SHA = /^[0-9a-f]{40}$/;
const NONCE = /^[0-9a-f]{32,64}$/;

export const MANUAL_MARKET_BOUNDED_CONFIRMATION = "APPROVE_ONE_MANUAL_MARKET_BOUNDED_RUN";
export const MANUAL_MARKET_BOUNDED_LIMITS = Object.freeze({
  candidates: 2,
  market_listings: 2,
  market_listing_observations: 2,
  ingestion_runs: 1,
  total_writes: 5,
  review_required: 0,
});

export function expectedManualMarketBoundedApproval(policyDigest, headSha, nonce) {
  return `APPROVE_MARKET_BOUNDED_MANUAL:${policyDigest}:${headSha}:${nonce}`;
}

export function validateManualMarketBoundedArmingGate(input = {}) {
  const expectedMainSha = normalized(input.expected_main_sha);
  const headSha = normalized(input.head_sha);
  const originMainSha = normalized(input.origin_main_sha);
  const expectedPolicyDigest = normalized(input.expected_policy_digest);
  const policyDigest = normalized(input.policy_digest);
  const configuredPolicyDigest = normalized(input.configured_policy_digest);
  const nonce = normalized(input.approval_nonce);
  const approval = String(input.bounded_approval ?? "").trim();
  let reasonCode = null;

  if (input.event_name !== "workflow_dispatch" || input.ref !== "refs/heads/main") {
    reasonCode = "manual_bounded_event_invalid";
  } else if (input.task !== "market" || input.stage !== "market-bounded") {
    reasonCode = "manual_bounded_contract_invalid";
  } else if (input.confirmation !== MANUAL_MARKET_BOUNDED_CONFIRMATION) {
    reasonCode = "manual_bounded_confirmation_invalid";
  } else if (!NONCE.test(nonce)) {
    reasonCode = "manual_bounded_nonce_invalid";
  } else if (!HEAD_SHA.test(expectedMainSha) || !HEAD_SHA.test(headSha) || !HEAD_SHA.test(originMainSha)
    || input.main_sha_verified !== true || expectedMainSha !== headSha || headSha !== originMainSha) {
    reasonCode = "manual_bounded_main_mismatch";
  } else if (!SHA256.test(expectedPolicyDigest) || !SHA256.test(policyDigest) || !SHA256.test(configuredPolicyDigest)
    || expectedPolicyDigest !== policyDigest || policyDigest !== configuredPolicyDigest) {
    reasonCode = "manual_bounded_policy_mismatch";
  } else if (String(input.automatic_write_enabled) !== "true"
    || String(input.bounded_persistence_enabled) !== "true") {
    reasonCode = "manual_bounded_persistence_disabled";
  } else if (!approval) {
    reasonCode = "manual_bounded_approval_missing";
  } else if (approval !== expectedManualMarketBoundedApproval(policyDigest, headSha, nonce)) {
    reasonCode = "manual_bounded_approval_mismatch";
  }

  return {
    ok: reasonCode === null,
    reason_code: reasonCode,
    bounded_approval_valid: reasonCode === null,
    persistence_authorized: reasonCode === null,
  };
}

export function validateManualMarketBoundedOutcome({ candidates = 0, operations = {}, database_writes = 0, deltas = {} } = {}) {
  const listingWrites = writeCount(operations, "listing");
  const observationWrites = writeCount(operations, "observation");
  const durableWrites = operations.durable_run && operations.durable_run !== "unchanged" ? 1 : 0;
  const totalWrites = Number(database_writes);
  const listingDelta = Number(deltas.market_listings ?? 0);
  const observationDelta = Number(deltas.market_listing_observations ?? 0);
  const durableDelta = Number(deltas.ingestion_runs ?? 0);
  const forbiddenDeltaKeys = ["import_issues", "review_required", "series", "variants", "stock_reports", "restock_events"];
  const allowed = Number.isInteger(Number(candidates))
    && Number(candidates) >= 0
    && Number(candidates) <= MANUAL_MARKET_BOUNDED_LIMITS.candidates
    && listingWrites <= MANUAL_MARKET_BOUNDED_LIMITS.market_listings
    && observationWrites <= MANUAL_MARKET_BOUNDED_LIMITS.market_listing_observations
    && durableWrites <= MANUAL_MARKET_BOUNDED_LIMITS.ingestion_runs
    && Number.isInteger(totalWrites)
    && totalWrites === listingWrites + observationWrites + durableWrites
    && totalWrites <= MANUAL_MARKET_BOUNDED_LIMITS.total_writes
    && Number.isInteger(listingDelta) && listingDelta >= 0 && listingDelta <= MANUAL_MARKET_BOUNDED_LIMITS.market_listings
    && Number.isInteger(observationDelta) && observationDelta >= 0 && observationDelta <= MANUAL_MARKET_BOUNDED_LIMITS.market_listing_observations
    && Number.isInteger(durableDelta) && durableDelta >= 0 && durableDelta <= MANUAL_MARKET_BOUNDED_LIMITS.ingestion_runs
    && forbiddenDeltaKeys.every((key) => Number(deltas[key] ?? 0) === 0);
  if (!allowed) throw new Error("Manual bounded write budget verification failed closed.");
  return {
    ok: true,
    candidate_count: Number(candidates),
    listing_writes: listingWrites,
    observation_writes: observationWrites,
    durable_run_writes: durableWrites,
    total_database_write_operations: totalWrites,
    review_required_writes: 0,
  };
}

function writeCount(operations, prefix) {
  const entries = operations?.[`${prefix}s`];
  if (Array.isArray(entries)) {
    return entries.filter((entry) => entry?.operation && entry.operation !== "unchanged").length;
  }
  const inserts = Number(operations?.[`${prefix}_inserts`] ?? 0);
  const updates = Number(operations?.[`${prefix}_updates`] ?? 0);
  if (![inserts, updates].every((value) => Number.isInteger(value) && value >= 0)) return Number.NaN;
  return inserts + updates;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}
