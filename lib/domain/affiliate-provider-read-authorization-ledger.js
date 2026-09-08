import crypto from "node:crypto";

import { validateAffiliateDemandProviderReadInvocation } from "./affiliate-demand-provider-read.js";

export const AFFILIATE_PROVIDER_READ_AUTHORIZATION_KIND = "affiliate_demand_provider_read_authorization_v1";
export const AFFILIATE_PROVIDER_READ_MAX_TARGETS = 10;
export const AFFILIATE_PROVIDER_READ_PHASES = Object.freeze(["discovery", "affiliate_enrichment"]);
export const AFFILIATE_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE = 3;
export const AFFILIATE_PROVIDER_READ_ATTEMPT_OUTCOMES = Object.freeze([
  "success",
  "retryable_failure",
  "terminal_failure",
  "ambiguous",
]);
export const AFFILIATE_PROVIDER_READ_TERMINAL_STATES = Object.freeze([
  "completed",
  "failed_before_request",
  "partial_or_ambiguous",
]);

const AUTHORIZATION_ID = /^affiliate-provider-read-auth-[0-9a-f]{32}$/;
const REQUEST_KEY = /^affiliate-read-[0-9a-f]{20}$/;
const SHA_40 = /^[0-9a-f]{40}$/;
const SHA_64 = /^[0-9a-f]{64}$/;
const TERMINAL_REASONS = Object.freeze({
  completed: new Set(["completed"]),
  failed_before_request: new Set([
    "configuration_preflight_failed",
    "executor_preflight_failed",
    "operator_cancelled_after_claim",
  ]),
  partial_or_ambiguous: new Set([
    "provider_terminal_failure",
    "ambiguous_transport",
    "retry_exhausted",
    "partial_batch",
    "operator_stopped_after_attempt",
  ]),
});

export function buildAffiliateProviderReadAuthorizationClaim(invocationInput = {}) {
  const invocation = validateAffiliateDemandProviderReadInvocation(invocationInput);
  if (invocation.provider_read_authorized !== true) {
    throw new Error("Affiliate provider-read authorization claim requires provider-read mode.");
  }

  const approval = clean(invocationInput.approval, 400);
  if (!approval) throw new Error("Affiliate provider-read authorization approval is missing.");

  const requestKeys = invocation.read_plan.requests.map((request) => normalizeRequestKey(request.request_key));
  unique(requestKeys, "request key");
  if (requestKeys.length < 1 || requestKeys.length > AFFILIATE_PROVIDER_READ_MAX_TARGETS) {
    throw new Error("Affiliate provider-read authorization target count is invalid.");
  }

  const targetCount = requestKeys.length;
  const logicalRequests = targetCount * AFFILIATE_PROVIDER_READ_PHASES.length;
  const maxAttempts = logicalRequests * AFFILIATE_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE;
  if (invocation.target_count !== targetCount
    || invocation.logical_provider_http_requests !== logicalRequests
    || invocation.max_http_attempts !== maxAttempts
    || invocation.production_writes !== 0
    || invocation.rpc_calls !== 0
    || invocation.workflow_dispatches !== 0
    || invocation.secrets_or_variables_changes !== 0
    || invocation.persistence_authorized !== false
    || invocation.batch_retry_authorized !== false
    || invocation.approval_reusable !== false) {
    throw new Error("Affiliate provider-read authorization invocation budget drifted.");
  }

  return {
    p_plan_kind: invocation.read_plan.kind,
    p_head_sha: normalizeSha40(invocation.head_sha),
    p_batch_digest: normalizeSha64(invocation.batch_digest),
    p_approval_fingerprint: sha256(approval),
    p_target_count: targetCount,
    p_logical_provider_http_requests: logicalRequests,
    p_max_http_attempts: maxAttempts,
    p_request_keys: requestKeys,
  };
}

export function expectedAffiliateProviderReadAuthorizationId({ headSha, batchDigest } = {}) {
  const head = normalizeSha40(headSha);
  const digest = normalizeSha64(batchDigest);
  return `affiliate-provider-read-auth-${sha256(["gacha-lens", AFFILIATE_PROVIDER_READ_AUTHORIZATION_KIND, head, digest].join("\u001f")).slice(0, 32)}`;
}

export function buildAffiliateProviderReadAttemptReservation({
  authorizationId,
  requestKey,
  phase,
  attemptNo,
} = {}) {
  const authorization = normalizeAuthorizationId(authorizationId);
  const request = normalizeRequestKey(requestKey);
  const normalizedPhase = clean(phase, 40);
  const attempt = Number(attemptNo);
  if (!AFFILIATE_PROVIDER_READ_PHASES.includes(normalizedPhase)
    || !Number.isInteger(attempt)
    || attempt < 1
    || attempt > AFFILIATE_PROVIDER_READ_MAX_ATTEMPTS_PER_PHASE) {
    throw new Error("Affiliate provider-read attempt reservation is invalid.");
  }
  return {
    p_authorization_id: authorization,
    p_request_key: request,
    p_phase: normalizedPhase,
    p_attempt_no: attempt,
  };
}

export function buildAffiliateProviderReadAttemptCompletion({
  authorizationId,
  requestKey,
  phase,
  attemptNo,
  outcome,
  responseFingerprint = null,
} = {}) {
  const reservation = buildAffiliateProviderReadAttemptReservation({ authorizationId, requestKey, phase, attemptNo });
  const normalizedOutcome = clean(outcome, 40);
  if (!AFFILIATE_PROVIDER_READ_ATTEMPT_OUTCOMES.includes(normalizedOutcome)) {
    throw new Error("Affiliate provider-read attempt outcome is invalid.");
  }
  const fingerprint = responseFingerprint == null || responseFingerprint === ""
    ? null
    : normalizeSha64(responseFingerprint);
  return {
    ...reservation,
    p_outcome: normalizedOutcome,
    p_response_fingerprint: fingerprint,
  };
}

export function buildAffiliateProviderReadAuthorizationFinalization({
  authorizationId,
  terminalState,
  reasonCode,
} = {}) {
  const authorization = normalizeAuthorizationId(authorizationId);
  const state = clean(terminalState, 40);
  const reason = clean(reasonCode, 80);
  if (!AFFILIATE_PROVIDER_READ_TERMINAL_STATES.includes(state) || !TERMINAL_REASONS[state]?.has(reason)) {
    throw new Error("Affiliate provider-read authorization finalization is invalid.");
  }
  return {
    p_authorization_id: authorization,
    p_terminal_state: state,
    p_reason_code: reason,
  };
}

export function fingerprintAffiliateProviderReadResponse(value) {
  return sha256(canonicalJson(value));
}

function normalizeAuthorizationId(value) {
  const normalized = clean(value, 96).toLowerCase();
  if (!AUTHORIZATION_ID.test(normalized)) throw new Error("Affiliate provider-read authorization id is invalid.");
  return normalized;
}

function normalizeRequestKey(value) {
  const normalized = clean(value, 80).toLowerCase();
  if (!REQUEST_KEY.test(normalized)) throw new Error("Affiliate provider-read request key is invalid.");
  return normalized;
}

function normalizeSha40(value) {
  const normalized = clean(value, 40).toLowerCase();
  if (!SHA_40.test(normalized)) throw new Error("Affiliate provider-read authorization head SHA is invalid.");
  return normalized;
}

function normalizeSha64(value) {
  const normalized = clean(value, 64).toLowerCase();
  if (!SHA_64.test(normalized)) throw new Error("Affiliate provider-read authorization SHA-256 value is invalid.");
  return normalized;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Affiliate provider-read duplicate ${label}.`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b, "en"))
    .map((key) => [key, sortCanonical(value[key])]));
}

function clean(value, limit = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
