import crypto from "node:crypto";
import { buildMarketBoundedDurableRunId } from "./market-bounded-write.js";

const SHA256 = /^[0-9a-f]{64}$/;
const HEAD_SHA = /^[0-9a-f]{40}$/;
const NONCE = /^[0-9a-f]{32,64}$/;
const MANUAL_APPROVAL = /^APPROVE_MARKET_BOUNDED_MANUAL:([0-9a-f]{64}):([0-9a-f]{40}):([0-9a-f]{32,64})$/;
const MANUAL_APPROVAL_PARTS = /^APPROVE_MARKET_BOUNDED_MANUAL:([^:]*):([^:]*):([^:]*)$/;

export const MANUAL_MARKET_BOUNDED_CONFIRMATION = "APPROVE_ONE_MANUAL_MARKET_BOUNDED_RUN";
export const MANUAL_MARKET_BOUNDED_CLAIM_PREFIX = "manual-bounded-approval-claim-";
export const MANUAL_MARKET_BOUNDED_WORKFLOWS = Object.freeze([
  "Gacha ingestion",
  "Gacha Market Bounded Manual Production",
]);
export const KNOWN_ORPHANED_RUN_ID = "30688709185";
export const MANUAL_MARKET_BOUNDED_LIMITS = Object.freeze({
  candidates: 2,
  market_listings: 2,
  market_listing_observations: 2,
  ingestion_runs: 1,
  total_writes: 5,
  review_required: 0,
});

export function buildManualMarketBoundedDurableRunId({
  workflow_run_id,
  workflow_run_attempt,
  plan_digest,
} = {}) {
  return buildMarketBoundedDurableRunId({
    execution_path: "manual",
    workflow_run_id,
    workflow_run_attempt,
    plan_digest,
  });
}

export function expectedManualMarketBoundedApproval(policyDigest, headSha, nonce) {
  return `APPROVE_MARKET_BOUNDED_MANUAL:${policyDigest}:${headSha}:${nonce}`;
}

export function parseManualMarketBoundedApproval(value) {
  const raw = String(value ?? "");
  const match = MANUAL_APPROVAL.exec(raw);
  if (!match || match[0] !== raw) {
    const parts = MANUAL_APPROVAL_PARTS.exec(raw);
    const error = new Error("Manual bounded approval is invalid.");
    error.reason_code = parts && parts[0] === raw && !NONCE.test(parts[3])
      ? "manual_bounded_nonce_invalid"
      : raw ? "manual_bounded_approval_mismatch" : "manual_bounded_approval_missing";
    throw error;
  }
  return { policy_digest: match[1], head_sha: match[2], approval_nonce: match[3] };
}

export function validateManualMarketBoundedArmingGate(input = {}) {
  const expectedMainSha = normalized(input.expected_main_sha);
  const headSha = normalized(input.head_sha);
  const originMainSha = normalized(input.origin_main_sha);
  const expectedPolicyDigest = normalized(input.expected_policy_digest);
  const policyDigest = normalized(input.policy_digest);
  const configuredPolicyDigest = normalized(input.configured_policy_digest);
  const configuredStage = String(input.configured_stage ?? "").trim();
  let parsedApproval = null;
  let approvalError = null;
  try {
    parsedApproval = parseManualMarketBoundedApproval(input.bounded_approval);
  } catch (error) {
    approvalError = error;
  }
  let reasonCode = null;

  if (input.event_name !== "workflow_dispatch" || input.ref !== "refs/heads/main") {
    reasonCode = "manual_bounded_event_invalid";
  } else if (input.task !== "market" || input.stage !== "market-bounded" || configuredStage !== "market-bounded") {
    reasonCode = "manual_bounded_contract_invalid";
  } else if (String(input.run_attempt) !== "1") {
    reasonCode = "manual_bounded_run_attempt_invalid";
  } else if (input.confirmation !== MANUAL_MARKET_BOUNDED_CONFIRMATION) {
    reasonCode = "manual_bounded_confirmation_invalid";
  } else if (!HEAD_SHA.test(expectedMainSha) || !HEAD_SHA.test(headSha) || !HEAD_SHA.test(originMainSha)
    || input.main_sha_verified !== true || expectedMainSha !== headSha || headSha !== originMainSha) {
    reasonCode = "manual_bounded_main_mismatch";
  } else if (!SHA256.test(expectedPolicyDigest) || !SHA256.test(policyDigest) || !SHA256.test(configuredPolicyDigest)
    || expectedPolicyDigest !== policyDigest || policyDigest !== configuredPolicyDigest) {
    reasonCode = "manual_bounded_policy_mismatch";
  } else if (String(input.automatic_write_enabled) !== "true"
    || String(input.bounded_persistence_enabled) !== "true") {
    reasonCode = "manual_bounded_persistence_disabled";
  } else if (approvalError) {
    reasonCode = approvalError.reason_code;
  } else if (parsedApproval.policy_digest !== policyDigest) {
    reasonCode = "manual_bounded_policy_mismatch";
  } else if (parsedApproval.head_sha !== headSha) {
    reasonCode = "manual_bounded_main_mismatch";
  }

  return {
    ok: reasonCode === null,
    reason_code: reasonCode,
    bounded_approval_valid: reasonCode === null,
    persistence_authorized: reasonCode === null,
  };
}

export function approvalNonceSha256(nonce) {
  const rawNonce = String(nonce ?? "");
  if (!NONCE.test(rawNonce)) throw new Error("Manual bounded approval nonce is invalid.");
  return crypto.createHash("sha256").update(rawNonce, "utf8").digest("hex");
}

export function buildManualApprovalClaim({ nonce, workflow_run_id, workflow_run_attempt, head_sha, policy_digest, created_at = new Date() } = {}) {
  const nonceFingerprint = approvalNonceSha256(nonce);
  const runId = String(workflow_run_id ?? "");
  const runAttempt = String(workflow_run_attempt ?? "");
  const headSha = normalized(head_sha);
  const policyDigest = normalized(policy_digest);
  const createdAt = new Date(created_at);
  if (!runId || runAttempt !== "1" || !HEAD_SHA.test(headSha) || !SHA256.test(policyDigest) || Number.isNaN(createdAt.getTime())) {
    throw new Error("Manual bounded approval claim is invalid.");
  }
  return validateManualApprovalClaimShape({
    schema_version: 1,
    approval_nonce_sha256: nonceFingerprint,
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    head_sha: headSha,
    policy_digest: policyDigest,
    created_at: createdAt.toISOString(),
  });
}

export function validateManualApprovalClaimShape(claim) {
  const allowedKeys = [
    "approval_nonce_sha256",
    "created_at",
    "head_sha",
    "policy_digest",
    "schema_version",
    "workflow_run_attempt",
    "workflow_run_id",
  ];
  const actualKeys = Object.keys(claim ?? {}).sort((left, right) => left.localeCompare(right, "en"));
  const createdAt = new Date(claim?.created_at);
  if (JSON.stringify(actualKeys) !== JSON.stringify(allowedKeys)
    || claim?.schema_version !== 1
    || !SHA256.test(String(claim?.approval_nonce_sha256 ?? ""))
    || !String(claim?.workflow_run_id ?? "")
    || String(claim?.workflow_run_attempt ?? "") !== "1"
    || !HEAD_SHA.test(normalized(claim?.head_sha))
    || !SHA256.test(normalized(claim?.policy_digest))
    || Number.isNaN(createdAt.getTime())) {
    throw new Error("Manual bounded approval claim contains unexpected or invalid fields.");
  }
  return Object.fromEntries(allowedKeys.map((key) => [key, claim[key]]));
}

export function validateManualApprovalClaimReuse({ artifacts, approval_nonce_sha256, current_run_id, current_run_attempt, require_current = false } = {}) {
  if (!Array.isArray(artifacts) || !SHA256.test(String(approval_nonce_sha256 ?? ""))) {
    throw new Error("Manual bounded approval claim history is unavailable.");
  }
  const claimName = `${MANUAL_MARKET_BOUNDED_CLAIM_PREFIX}${approval_nonce_sha256}`;
  const matches = artifacts.filter((artifact) => artifact?.name === claimName);
  const currentMatches = matches.filter((artifact) => String(artifact?.workflow_run?.id ?? "") === String(current_run_id)
    && String(artifact?.workflow_run?.run_attempt ?? artifact?.run_attempt ?? "1") === String(current_run_attempt));
  const foreignMatches = matches.filter((artifact) => !currentMatches.includes(artifact));
  if (foreignMatches.length || currentMatches.length > 1) {
    const error = new Error("Manual bounded approval has already been consumed.");
    error.reason_code = "manual_bounded_approval_already_consumed";
    throw error;
  }
  if (require_current && currentMatches.length !== 1) {
    const error = new Error("Manual bounded approval claim is missing.");
    error.reason_code = "manual_bounded_approval_claim_missing";
    throw error;
  }
  return { ok: true, claim_name: claimName, current_claim_count: currentMatches.length, prior_claim_count: foreignMatches.length };
}

export function buildManualApprovalAttemptRows({ artifacts, current_run_id } = {}) {
  if (!Array.isArray(artifacts)) throw new Error("Manual bounded approval attempt history is unavailable.");
  const attempts = new Map();
  for (const artifact of artifacts) {
    if (!String(artifact?.name ?? "").startsWith(MANUAL_MARKET_BOUNDED_CLAIM_PREFIX)) continue;
    const runId = String(artifact?.workflow_run?.id ?? "");
    const createdAt = new Date(artifact?.created_at);
    if (!runId || Number.isNaN(createdAt.getTime())) {
      const error = new Error("Manual bounded approval attempt history is incomplete.");
      error.reason_code = "manual_bounded_github_state_unavailable";
      throw error;
    }
    if (runId === String(current_run_id)) continue;
    const existing = attempts.get(runId);
    const finishedAt = createdAt.toISOString();
    if (!existing || finishedAt < existing.finished_at) {
      attempts.set(runId, {
        id: runId,
        task: "market",
        status: "succeeded",
        finished_at: finishedAt,
        summary: { rollout_stage: "market-bounded" },
      });
    }
  }
  return [...attempts.values()].sort((left, right) => left.finished_at.localeCompare(right.finished_at, "en") || left.id.localeCompare(right.id, "en"));
}

export function validateManualActiveRuns({ runs, current_run_id } = {}) {
  if (!Array.isArray(runs)) throw new Error("GitHub Actions active Run state is unavailable.");
  const activeStatuses = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);
  const blockers = runs.filter((run) => MANUAL_MARKET_BOUNDED_WORKFLOWS.includes(String(run?.name ?? ""))
    && activeStatuses.has(String(run?.status ?? ""))
    && String(run?.id ?? run?.databaseId ?? "") !== String(current_run_id)
    && String(run?.id ?? run?.databaseId ?? "") !== KNOWN_ORPHANED_RUN_ID);
  if (blockers.length) {
    const error = new Error("Another Production ingestion Run is active.");
    error.reason_code = "manual_bounded_active_run_detected";
    throw error;
  }
  return { ok: true, checked_run_count: runs.length, blocking_run_count: 0, known_orphan_excluded: true };
}

export function validateManualMarketBoundedExactDeltas({ operations = {}, persisted_deltas = {}, snapshot_deltas = {} } = {}) {
  const expected = {
    market_listings: operationCount(operations, "listing", "insert"),
    market_listing_observations: operationCount(operations, "observation", "insert"),
    ingestion_runs: operations.durable_run === "insert" ? 1 : 0,
    import_issues: 0,
    review_required: 0,
    series: 0,
    variants: 0,
    stock_reports: 0,
    restock_events: 0,
  };
  const keys = Object.keys(expected);
  if (keys.some((key) => !Number.isInteger(Number(persisted_deltas[key]))
    || !Number.isInteger(Number(snapshot_deltas[key]))
    || Number(persisted_deltas[key]) !== expected[key]
    || Number(snapshot_deltas[key]) !== expected[key])) {
    throw new Error("Manual bounded Production deltas do not exactly match operations.");
  }
  return { ok: true, expected_deltas: expected };
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

function operationCount(operations, prefix, operation) {
  const entries = operations?.[`${prefix}s`];
  if (Array.isArray(entries)) return entries.filter((entry) => entry?.operation === operation).length;
  const suffix = operation === "unchanged" ? "unchanged" : `${operation}s`;
  const count = Number(operations?.[`${prefix}_${suffix}`] ?? 0);
  return Number.isInteger(count) && count >= 0 ? count : Number.NaN;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}
