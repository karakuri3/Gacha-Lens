export const MANUAL_MARKET_BOUNDED_CHECKPOINTS = Object.freeze([
  "policy_load",
  "arming_gate_revalidation",
  "safety_state_revalidation",
  "production_snapshot_revalidation",
  "audit_load",
  "preview_revalidation",
  "plan_identity_revalidation",
  "bounded_rows_build",
  "existing_rows_snapshot",
  "existing_listings_snapshot",
  "existing_observations_snapshot",
  "existing_durable_run_snapshot",
  "approval_fingerprint",
  "bounded_persistence",
  "bounded_outcome_validation",
  "production_after_snapshot",
  "exact_delta_validation",
  "result_build",
  "rollback",
  "unknown",
]);

const CHECKPOINTS = new Set(MANUAL_MARKET_BOUNDED_CHECKPOINTS);
const ERROR_CATEGORIES = new Set([
  "safety_gate",
  "identity",
  "budget",
  "idempotency",
  "listing_write",
  "observation_write",
  "verification",
  "rollback",
  "durable_log",
  "database",
  "unknown",
]);
const SAFE_REASON_CODE = /^[a-z0-9_]{1,100}$/;

export function normalizeManualMarketBoundedCheckpoint(value) {
  return CHECKPOINTS.has(value) ? value : "unknown";
}

export function manualMarketBoundedCheckpointReasonCode(value) {
  return `manual_bounded_${normalizeManualMarketBoundedCheckpoint(value)}_failed`;
}

export function buildManualMarketBoundedFailureDiagnostic(input = {}) {
  const checkpoint = normalizeManualMarketBoundedCheckpoint(input.checkpoint);
  const upstreamReason = String(input.upstream_reason_code ?? "");
  const category = String(input.error_category ?? "unknown");
  return {
    checkpoint,
    checkpoint_reason_code: manualMarketBoundedCheckpointReasonCode(checkpoint),
    upstream_reason_code: SAFE_REASON_CODE.test(upstreamReason) ? upstreamReason : null,
    error_category: ERROR_CATEGORIES.has(category) ? category : "unknown",
    persistence_invoked: input.persistence_invoked === true,
    rollback_attempted: input.rollback_attempted === true,
    rollback_verified: input.rollback_verified === true,
  };
}
