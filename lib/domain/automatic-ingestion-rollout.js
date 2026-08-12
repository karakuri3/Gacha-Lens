import crypto from "node:crypto";
import fs from "node:fs";

export const AUTOMATIC_INGESTION_ROLLOUT_SCHEMA_VERSION = 1;
export const AUTOMATIC_INGESTION_ROLLOUT_STAGES = Object.freeze([
  "disabled",
  "market-shadow",
  "market-bounded",
]);
export const AUTOMATIC_INGESTION_ROLLOUT_REASON_CODES = Object.freeze([
  "rollout_stage_disabled",
  "rollout_stage_invalid",
  "rollout_policy_invalid",
  "rollout_policy_digest_missing",
  "rollout_policy_digest_mismatch",
  "rollout_task_not_enabled",
  "rollout_schedule_mismatch",
  "rollout_throttled",
  "rollout_daily_budget_exhausted",
  "rollout_candidate_not_safe",
  "rollout_budget_exceeded",
  "rollout_plan_incomplete",
  "rollout_shadow_only",
  "bounded_persistence_not_enabled",
  "bounded_approval_missing",
  "bounded_approval_mismatch",
  "bounded_audit_missing",
  "bounded_audit_digest_mismatch",
  "bounded_plan_missing",
  "bounded_plan_digest_mismatch",
  "bounded_plan_expired",
  "bounded_candidate_set_mismatch",
  "bounded_candidate_not_safe",
  "bounded_candidate_identity_mismatch",
  "bounded_preflight_changed",
  "bounded_idempotency_conflict",
  "bounded_listing_write_failed",
  "bounded_observation_write_failed",
  "bounded_verification_failed",
  "bounded_rollback_failed",
]);

const CANDIDATE_KEY = /^[0-9a-f]{16}$/;
const MAIN_SHA = /^[0-9a-f]{40}$/;
const PROVIDERS = new Set(["rakuten_ichiba", "yahoo_shopping"]);
const MAX_RUNNING_AGE_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MARKET_SHADOW_THROTTLE_MARKER_PREFIX = "ingestion-rollout-throttle-market-shadow-market-";
const EXPECTED_NOOP_REASONS = new Set(["rollout_throttled", "rollout_daily_budget_exhausted"]);

export class AutomaticIngestionRolloutError extends Error {
  constructor(reasonCode, message = reasonCode) {
    super(message);
    this.name = "AutomaticIngestionRolloutError";
    this.reason_code = reasonCode;
  }
}

export function loadAutomaticIngestionRolloutPolicy(filePath) {
  let source;
  let policy;
  try {
    source = fs.readFileSync(filePath);
    policy = JSON.parse(source.toString("utf8"));
  } catch {
    throw fail("rollout_policy_invalid", "Rollout policy could not be loaded.");
  }
  validateAutomaticIngestionRolloutPolicy(policy);
  return { policy, digest: calculateAutomaticIngestionRolloutPolicyDigest(source) };
}

export function calculateAutomaticIngestionRolloutPolicyDigest(source) {
  const bytes = Buffer.isBuffer(source)
    ? source
    : Buffer.from(typeof source === "string" ? source : stableJson(source), "utf8");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function validateAutomaticIngestionRolloutPolicy(policy) {
  if (!plainObject(policy) || policy.schema_version !== AUTOMATIC_INGESTION_ROLLOUT_SCHEMA_VERSION) {
    throw fail("rollout_policy_invalid", "Rollout policy schema is invalid.");
  }
  if (policy.default_stage !== "disabled" || !plainObject(policy.stages)) {
    throw fail("rollout_policy_invalid", "Rollout policy default stage is invalid.");
  }
  const keys = Object.keys(policy.stages).sort();
  if (keys.join(",") !== [...AUTOMATIC_INGESTION_ROLLOUT_STAGES].sort().join(",")) {
    throw fail("rollout_policy_invalid", "Rollout policy stages are invalid.");
  }
  const disabled = policy.stages.disabled;
  if (disabled.automatic_runs_allowed !== false || disabled.production_writes_allowed !== false) {
    throw fail("rollout_policy_invalid", "Disabled stage must prohibit automatic work.");
  }
  validateMarketStage(policy.stages["market-shadow"], {
    mode: "dry-run",
    writes: false,
  });
  validateMarketStage(policy.stages["market-bounded"], {
    mode: "bounded-write",
    writes: true,
    bounded: true,
  });
  return true;
}

export function resolveAutomaticIngestionRolloutStage(value, policy) {
  validateAutomaticIngestionRolloutPolicy(policy);
  const stage = String(value ?? "").trim();
  if (!stage) return policy.default_stage;
  if (!AUTOMATIC_INGESTION_ROLLOUT_STAGES.includes(stage)) {
    throw fail("rollout_stage_invalid", "Unknown automatic ingestion rollout stage.");
  }
  return stage;
}

export function evaluateAutomaticIngestionRollout(input = {}) {
  let stage;
  try {
    validateAutomaticIngestionRolloutPolicy(input.policy);
    stage = resolveAutomaticIngestionRolloutStage(input.stage, input.policy);
  } catch (error) {
    return blocked(error.reason_code || "rollout_policy_invalid", "invalid", null);
  }
  const contract = input.policy.stages[stage];
  if (stage === "disabled") return blocked("rollout_stage_disabled", stage, contract);
  if (String(input.task) !== "market") return blocked("rollout_task_not_enabled", stage, contract);
  if (!input.simulation && String(input.event_name) !== "schedule") {
    return blocked("rollout_task_not_enabled", stage, contract);
  }
  if (!input.simulation && String(input.schedule) !== contract.allowed_schedule) {
    return blocked("rollout_schedule_mismatch", stage, contract);
  }
  if (input.simulation && input.schedule && String(input.schedule) !== contract.allowed_schedule) {
    return blocked("rollout_schedule_mismatch", stage, contract);
  }
  if (input.durable_run_store_available !== true) {
    return blocked("durable_run_store_unavailable", stage, contract);
  }
  if (input.production_snapshot_available !== true) {
    return blocked("production_snapshot_unavailable", stage, contract);
  }
  if (input.concurrency?.available !== true) {
    return blocked("durable_run_store_unavailable", stage, contract);
  }
  if (Number(input.concurrency.active_count) > 0) {
    return blocked("concurrent_run_detected", stage, contract);
  }
  if (Number(input.concurrency.stale_count) > 0) {
    return blocked("stale_running_record_detected", stage, contract);
  }
  if (input.circuit_breaker?.available !== true) {
    return blocked("durable_run_store_unavailable", stage, contract);
  }
  if (input.circuit_breaker.state !== "closed") {
    return blocked("recent_failure_circuit_open", stage, contract);
  }
  const throttle = evaluateAutomaticIngestionThrottle({
    stage,
    task: "market",
    policy: contract,
    history_rows: input.history_rows,
    running_rows: input.running_rows,
    github_rows: input.github_rows,
    now: input.now,
  });
  if (!throttle.ok) {
    return blocked(
      throttle.reason_code,
      stage,
      contract,
      throttle,
      isExpectedAutomaticRolloutNoop(input, throttle.reason_code),
    );
  }

  if (stage === "market-bounded") {
    const configuredDigest = String(input.configured_policy_digest ?? "").trim().toLowerCase();
    const actualDigest = String(input.policy_digest ?? "").trim().toLowerCase();
    if (!configuredDigest) return blocked("rollout_policy_digest_missing", stage, contract, throttle);
    if (configuredDigest !== actualDigest) return blocked("rollout_policy_digest_mismatch", stage, contract, throttle);
    if (!input.prediction_only && String(input.automatic_write_enabled) !== "true") {
      return blocked("automatic_ingestion_disabled", stage, contract, throttle);
    }
    if (!input.simulation) {
      if (String(input.bounded_persistence_enabled) !== "true") {
        return blocked("bounded_persistence_not_enabled", stage, contract, throttle);
      }
      const approval = String(input.bounded_approval ?? "").trim();
      if (!approval) return blocked("bounded_approval_missing", stage, contract, throttle);
      const expected = `APPROVE_MARKET_BOUNDED:${actualDigest}:${String(input.head_sha ?? "").toLowerCase()}`;
      if (approval !== expected) return blocked("bounded_approval_mismatch", stage, contract, throttle);
    }
  }

  return {
    ok: true,
    decision: "allowed",
    reason_code: null,
    stage,
    action: stage === "market-shadow" ? "shadow" : "bounded-plan",
    contract: sanitizeContract(contract),
    throttle,
    production_writes_allowed: false,
    bounded_persistence_enabled: stage === "market-bounded" && String(input.bounded_persistence_enabled) === "true",
    bounded_approval_valid: stage === "market-bounded" && !input.simulation,
    persistence_authorized: stage === "market-bounded" && !input.simulation,
    expected_noop: false,
    expected_noop_reason: null,
  };
}

export function isExpectedAutomaticRolloutNoop(input = {}, reasonCode) {
  return input.simulation !== true
    && String(input.event_name) === "schedule"
    && String(input.task) === "market"
    && Array.isArray(input.history_rows)
    && Array.isArray(input.running_rows)
    && Array.isArray(input.github_rows)
    && EXPECTED_NOOP_REASONS.has(String(reasonCode));
}

export function buildGithubThrottleHistoryRows(artifacts, { stage, task } = {}) {
  if (stage !== "market-shadow" || task !== "market" || !Array.isArray(artifacts)) return [];
  const prefix = MARKET_SHADOW_THROTTLE_MARKER_PREFIX;
  return artifacts
    .filter((artifact) => !artifact?.expired && new RegExp(`^${prefix}\\d+$`).test(String(artifact?.name ?? "")))
    .map((artifact) => ({
      id: String(artifact.workflow_run?.id ?? artifact.id),
      task: "market",
      status: "succeeded",
      finished_at: artifact.created_at,
      summary: { rollout_stage: "market-shadow" },
    }));
}

export function evaluateAutomaticIngestionThrottle(input = {}) {
  const githubRows = input.github_rows === undefined ? [] : input.github_rows;
  if (!Array.isArray(input.history_rows) || !Array.isArray(input.running_rows) || !Array.isArray(githubRows)) {
    return throttleBlocked("rollout_throttled", "unavailable");
  }
  const now = validDate(input.now) ?? new Date();
  const task = String(input.task ?? "");
  const stage = String(input.stage ?? "");
  const running = input.running_rows.filter((row) => String(row?.task) === task && String(row?.status) === "running");
  let active = 0;
  let stale = 0;
  for (const row of running) {
    const startedAt = validDate(row.started_at);
    if (!startedAt || now - startedAt > MAX_RUNNING_AGE_MS) stale += 1;
    else active += 1;
  }
  if (active || stale) {
    return {
      ...throttleBlocked("rollout_throttled", stale ? "stale" : "running"),
      active_running_count: active,
      stale_running_count: stale,
    };
  }
  const completed = [...input.history_rows, ...githubRows].filter((row) => {
    const summary = row?.summary ?? {};
    return String(row?.task) === task
      && ["succeeded", "failed"].includes(String(row?.status))
      && String(summary.rollout_stage ?? "") === stage;
  });
  const times = completed.map((row) => validDate(row.finished_at || row.started_at)).filter(Boolean);
  const minimumInterval = positiveInteger(input.policy?.minimum_interval_minutes) * 60 * 1000;
  const recentInterval = times.filter((date) => now - date >= 0 && now - date < minimumInterval).length;
  const last24Hours = times.filter((date) => now - date >= 0 && now - date < DAY_MS).length;
  if (recentInterval > 0) return throttleBlocked("rollout_throttled", "minimum_interval", completed.length, last24Hours);
  if (last24Hours >= positiveInteger(input.policy?.max_runs_per_24_hours)) {
    return throttleBlocked("rollout_daily_budget_exhausted", "daily_budget", completed.length, last24Hours);
  }
  return {
    ok: true,
    state: "clear",
    reason_code: null,
    history_count: completed.length,
    runs_in_last_24_hours: last24Hours,
    active_running_count: 0,
    stale_running_count: 0,
  };
}

export function evaluateAutomaticMarketCandidate(candidate = {}) {
  const checks = candidate.checks ?? {};
  const assessment = candidate.assessment ?? {};
  const listing = candidate.listing ?? {};
  const provider = String(candidate.source?.provider ?? "");
  const reasons = [];
  if (!CANDIDATE_KEY.test(String(candidate.candidate_key ?? ""))) reasons.push("candidate_key_invalid");
  if (!PROVIDERS.has(provider)) reasons.push("provider_not_allowed");
  if (assessment.accepted !== true || assessment.review_required !== false) reasons.push("candidate_not_accepted");
  if (assessment.reason !== "variant_and_parent_evidence_confirmed") reasons.push("reason_not_confirmed");
  if (!Number.isFinite(Number(assessment.confidence)) || Number(assessment.confidence) < 0.86) reasons.push("confidence_below_threshold");
  if (listing.listing_type !== "single") reasons.push("listing_type_not_single");
  if (String(listing.status).toLowerCase() !== "active") reasons.push("status_not_active");
  if (!Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) reasons.push("price_invalid");
  if (!candidate.target?.variant_id) reasons.push("variant_missing");
  if (!candidate.target?.series_id) reasons.push("series_missing");
  if (checks.variant_evidence_present !== true) reasons.push("variant_evidence_missing");
  if (checks.parent_series_evidence_present !== true) reasons.push("parent_evidence_missing");
  for (const [key, reason] of [
    ["set_signal_detected", "set_signal_detected"],
    ["multiple_variant_candidates", "multiple_variant_candidates"],
    ["explicit_variant_conflict", "explicit_variant_conflict"],
    ["explicit_label_other_variant_match", "explicit_label_other_variant_match"],
    ["explicit_label_unresolved", "explicit_label_unresolved"],
    ["parent_series_edition_conflict", "parent_series_edition_conflict"],
  ]) if (checks[key] === true) reasons.push(reason);
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}

export function buildAutomaticMarketRolloutPlan(input = {}) {
  const policy = input.policy;
  validateAutomaticIngestionRolloutPolicy(policy);
  const stage = resolveAutomaticIngestionRolloutStage(input.stage, policy);
  if (!['market-shadow', 'market-bounded'].includes(stage)) {
    throw fail("rollout_stage_disabled", "A market rollout stage is required.");
  }
  const audit = input.audit;
  if (!completeAudit(audit)) throw fail("rollout_plan_incomplete", "Market candidate audit is incomplete.");
  const candidates = audit.candidates;
  const candidateKeys = candidates.map((candidate) => String(candidate.candidate_key ?? ""));
  if (candidateKeys.some((key) => !CANDIDATE_KEY.test(key)) || new Set(candidateKeys).size !== candidateKeys.length) {
    throw fail("rollout_plan_incomplete", "Market candidate keys are invalid or duplicated.");
  }
  const evaluations = candidates.map((candidate) => ({
    candidate_key: candidate.candidate_key,
    ...evaluateAutomaticMarketCandidate(candidate),
  }));
  const eligibleKeys = evaluations.filter((entry) => entry.eligible).map((entry) => entry.candidate_key).sort();
  const excluded = evaluations.filter((entry) => !entry.eligible).sort((a, b) => a.candidate_key.localeCompare(b.candidate_key));
  const limits = policy.stages["market-bounded"];
  const selectedCount = Number(audit.selection.selected_variant_count);
  const listingWritesPlanned = Math.max(eligibleKeys.length, nonnegative(input.planned_counts?.listings));
  const observationWritesPlanned = Math.max(eligibleKeys.length, nonnegative(input.planned_counts?.observations));
  const reviewWritesPlanned = nonnegative(input.planned_counts?.review_required);
  const budgetChecks = {
    selected_variants_within_limit: selectedCount <= limits.max_selected_variants,
    candidates_within_limit: candidates.length <= limits.max_candidates,
    eligible_candidates_within_limit: eligibleKeys.length <= limits.max_accepted_candidates,
    listing_writes_within_limit: listingWritesPlanned <= limits.max_listing_writes,
    observation_writes_within_limit: observationWritesPlanned <= limits.max_observation_writes,
    review_required_writes_zero: reviewWritesPlanned === 0 && limits.max_review_required_writes === 0,
  };
  const budgetOk = Object.values(budgetChecks).every(Boolean);
  const plan = {
    schema_version: 1,
    generated_at: validDate(input.generated_at)?.toISOString() ?? new Date().toISOString(),
    policy_digest: String(input.policy_digest ?? "").toLowerCase(),
    stage,
    source_run_id: text(input.source_run_id || audit.workflow?.run_id, 40),
    head_sha: text(input.head_sha || audit.workflow?.head_sha, 40).toLowerCase(),
    selected_variant_count: selectedCount,
    candidate_count: candidates.length,
    auto_eligible_count: eligibleKeys.length,
    excluded_count: excluded.length,
    selected_candidate_keys: eligibleKeys,
    excluded_candidate_keys: excluded.map((entry) => entry.candidate_key),
    excluded_candidates: excluded.map((entry) => ({ candidate_key: entry.candidate_key, reasons: entry.reasons })),
    listing_writes_planned: listingWritesPlanned,
    observation_writes_planned: observationWritesPlanned,
    review_required_writes_planned: reviewWritesPlanned,
    budget_checks: { ...budgetChecks, state: budgetOk ? "within_budget" : "exceeded" },
    throttle_checks: sanitizeThrottle(input.throttle),
    database_writes: 0,
    persistence_authorized: false,
    prediction_only: true,
  };
  if (!MAIN_SHA.test(plan.head_sha) || !/^[0-9a-f]{64}$/.test(plan.policy_digest)) {
    throw fail("rollout_plan_incomplete", "Rollout plan identity is incomplete.");
  }
  if (!budgetOk) throw Object.assign(fail("rollout_budget_exceeded", "Rollout budget was exceeded."), { plan });
  return plan;
}

export function buildSanitizedRolloutReport(input = {}) {
  const plan = input.plan;
  if (!plainObject(plan) || plan.database_writes !== 0) throw fail("rollout_plan_incomplete");
  return {
    schema_version: 1,
    generated_at: plan.generated_at,
    workflow: {
      run_id: text(input.run_id, 40),
      run_attempt: text(input.run_attempt, 10),
      head_sha: plan.head_sha,
      event_name: text(input.event_name, 40),
      ref: text(input.ref, 120),
    },
    stage: plan.stage,
    policy_digest: plan.policy_digest,
    task: "market",
    schedule: input.schedule ? text(input.schedule, 80) : null,
    main_sha_verified: input.main_sha_verified === true,
    throttle_state: plan.throttle_checks.state,
    request_diagnostics: sanitizeDiagnostics(input.request_diagnostics),
    candidate_counts: {
      selected_variants: plan.selected_variant_count,
      candidates: plan.candidate_count,
      auto_eligible: plan.auto_eligible_count,
      excluded: plan.excluded_count,
    },
    would_write_candidate_keys: [...plan.selected_candidate_keys],
    would_write_listing_count: plan.listing_writes_planned,
    would_write_observation_count: plan.observation_writes_planned,
    excluded_candidate_counts: summarizeExclusions(plan.excluded_candidates),
    budget_state: plan.budget_checks.state,
    prediction_only: true,
    approval_granted: false,
    database_writes: 0,
  };
}

export function renderAutomaticMarketRolloutPlanMarkdown(plan) {
  return [
    "# Market bounded-write prediction plan",
    "",
    `- Stage: ${plan.stage}`,
    `- Policy digest: ${plan.policy_digest}`,
    `- Source Run: ${plan.source_run_id || "local"}`,
    `- Head SHA: ${plan.head_sha}`,
    `- Selected variants: ${plan.selected_variant_count}`,
    `- Candidates: ${plan.candidate_count}`,
    `- Auto eligible: ${plan.auto_eligible_count}`,
    `- Excluded: ${plan.excluded_count}`,
    `- Listing writes predicted: ${plan.listing_writes_planned}`,
    `- Observation writes predicted: ${plan.observation_writes_planned}`,
    `- Budget: ${plan.budget_checks.state}`,
    "- Prediction only: true",
    "- Approval granted: false",
    "- Production writes: 0",
    "",
  ].join("\n");
}

export function renderAutomaticIngestionShadowReportMarkdown(report) {
  return [
    "# Automatic ingestion rollout simulation",
    "",
    `- Run: ${report.workflow.run_id || "local"}`,
    `- Stage: ${report.stage}`,
    `- Policy digest: ${report.policy_digest}`,
    `- Task: ${report.task}`,
    `- Head SHA: ${report.workflow.head_sha}`,
    `- Main SHA verified: ${report.main_sha_verified}`,
    `- Throttle: ${report.throttle_state}`,
    `- Candidates: ${report.candidate_counts.candidates}`,
    `- Would write candidates: ${report.candidate_counts.auto_eligible}`,
    `- Budget: ${report.budget_state}`,
    "- Would-write values are predictions, not approvals or persistence results.",
    "- Production writes: 0",
    "",
  ].join("\n");
}

export function findAutomaticIngestionRolloutSecretLeaks(files = [], secretValues = []) {
  const values = [...new Set(secretValues.map(String).filter((value) => value.length >= 8))];
  const pattern = /(?:authorization\s*:|cookie\s*:|bearer\s+[a-z0-9._~-]{12,}|\bgh[pousr]_[a-z0-9_]{12,}\b|\bsb_secret_[a-z0-9._-]{12,}\b)/i;
  return files.filter((file) => {
    const value = String(file?.text ?? "");
    return pattern.test(value) || values.some((secret) => value.includes(secret));
  }).map((file) => String(file.name || "report")).sort();
}

export function collectAutomaticIngestionSecretValues(env = {}) {
  return Object.entries(env)
    .filter(([name]) => /(?:KEY|TOKEN|SECRET|PASSWORD|APPLICATION_ID|AFFILIATE(?:_TRACKING)?_ID)$/i.test(name))
    .map(([, value]) => String(value ?? ""))
    .filter(Boolean);
}

function validateMarketStage(stage, expected) {
  if (!plainObject(stage)
    || stage.automatic_runs_allowed !== true
    || stage.production_writes_allowed !== expected.writes
    || stage.allowed_task !== "market"
    || stage.allowed_schedule !== "17,47 * * * *"
    || stage.mode !== expected.mode
    || stage.limit !== 5
    || stage.priority !== "1"
    || stage.release !== "released"
    || stage.source_scope !== "planner-apis"
    || stage.execute_sources !== true
    || stage.minimum_interval_minutes !== 720
    || stage.max_runs_per_24_hours !== 1) {
    throw fail("rollout_policy_invalid", "Market rollout contract is invalid.");
  }
  if (expected.bounded && (
    stage.max_selected_variants !== 5
    || stage.max_candidates !== 20
    || stage.max_accepted_candidates !== 2
    || stage.max_listing_writes !== 2
    || stage.max_observation_writes !== 2
    || stage.max_review_required_writes !== 0
  )) throw fail("rollout_policy_invalid", "Bounded rollout limits are unsafe.");
}

function completeAudit(audit) {
  if (!plainObject(audit) || !Array.isArray(audit.candidates) || !Array.isArray(audit.selection?.selected_variants)) return false;
  if (audit.mode !== "dry-run" || audit.source_scope !== "planner-apis") return false;
  if (audit.result?.report_complete !== true || Number(audit.result?.truncated_count) !== 0) return false;
  if (Number(audit.result?.candidate_count) !== audit.candidates.length) return false;
  if (Number(audit.result?.accepted_count) !== audit.candidates.filter((candidate) => candidate.assessment?.accepted === true).length) return false;
  if (Number(audit.result?.review_count) !== audit.candidates.filter((candidate) => candidate.assessment?.review_required === true).length) return false;
  if (Number(audit.selection?.selected_variant_count) !== audit.selection.selected_variants.length) return false;
  if (Number(audit.selection?.query_count) !== audit.selection.selected_variants.length) return false;
  return hasExactZeroCounts(audit.database_writes, ["listings", "observations", "ingestion_runs"]);
}

function hasExactZeroCounts(value, keys) {
  return plainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key) && Number(value[key]) === 0);
}

function blocked(reasonCode, stage, contract, throttle = null, expectedNoop = false) {
  return {
    ok: false,
    decision: "blocked",
    reason_code: reasonCode,
    stage,
    action: "blocked",
    contract: sanitizeContract(contract),
    throttle: throttle ?? throttleBlocked(reasonCode, "blocked"),
    production_writes_allowed: false,
    persistence_authorized: false,
    expected_noop: expectedNoop,
    expected_noop_reason: expectedNoop ? reasonCode : null,
  };
}

function throttleBlocked(reasonCode, state, historyCount = 0, dayCount = 0) {
  return {
    ok: false,
    state,
    reason_code: reasonCode,
    history_count: historyCount,
    runs_in_last_24_hours: dayCount,
    active_running_count: 0,
    stale_running_count: 0,
  };
}

function sanitizeContract(contract) {
  if (!plainObject(contract)) return null;
  const allowed = [
    "automatic_runs_allowed", "production_writes_allowed", "allowed_task", "allowed_schedule",
    "mode", "limit", "priority", "release", "source_scope", "execute_sources",
    "minimum_interval_minutes", "max_runs_per_24_hours", "max_selected_variants",
    "max_candidates", "max_accepted_candidates", "max_listing_writes",
    "max_observation_writes", "max_review_required_writes",
  ];
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(contract, key)).map((key) => [key, contract[key]]));
}

function sanitizeThrottle(value) {
  return {
    state: text(value?.state || "unavailable", 40),
    history_count: nonnegative(value?.history_count),
    runs_in_last_24_hours: nonnegative(value?.runs_in_last_24_hours),
    active_running_count: nonnegative(value?.active_running_count),
    stale_running_count: nonnegative(value?.stale_running_count),
  };
}

function sanitizeDiagnostics(value) {
  if (!plainObject(value)) return null;
  const aggregate = value.aggregate ?? {};
  const allowed = [
    "requests_attempted", "requests_succeeded", "requests_failed", "requests_retried",
    "retry_attempts_total", "transient_failures_recovered", "requests_timed_out",
    "requests_rate_limited", "requests_permanently_failed", "duplicate_queries_skipped",
  ];
  return { aggregate: Object.fromEntries(allowed.map((key) => [key, nonnegative(aggregate[key])])) };
}

function summarizeExclusions(excluded) {
  const result = {};
  for (const entry of excluded ?? []) for (const reason of entry.reasons ?? []) result[reason] = (result[reason] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fail(reasonCode, message) {
  return new AutomaticIngestionRolloutError(reasonCode, message);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function nonnegative(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function text(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
