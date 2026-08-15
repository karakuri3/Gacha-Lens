export const INGESTION_EXECUTION_SCHEMA_VERSION = 1;
export const INGESTION_WRITE_TASKS = Object.freeze(["official", "market", "stock"]);
export const INGESTION_EXECUTION_TYPES = Object.freeze([
  "read_only",
  "manual_dry_run",
  "manual_canary_write",
  "manual_full_write",
  "scheduled_write",
]);
export const INGESTION_SAFETY_REASON_CODES = Object.freeze([
  "automatic_ingestion_disabled",
  "not_main_branch",
  "head_sha_mismatch",
  "unknown_schedule",
  "schedule_task_mismatch",
  "unsupported_write_task",
  "manual_write_approval_missing",
  "manual_write_approval_mismatch",
  "concurrent_run_detected",
  "stale_running_record_detected",
  "recent_failure_circuit_open",
  "durable_run_store_unavailable",
  "production_snapshot_unavailable",
  "invalid_execution_contract",
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
]);

export const INGESTION_SCHEDULE_TASKS = Object.freeze({
  "7 * * * *": "official",
  "17,47 * * * *": "market",
  "37 * * * *": "stock",
});

const SHA = /^[0-9a-f]{40}$/;
const RUNNING_STALE_MS = 30 * 60 * 1000;

export function normalizeAutomaticWriteEnabled(value) {
  return String(value ?? "") === "true";
}

export function classifyIngestionExecution(input = {}) {
  const eventName = text(input.event_name || input.eventName);
  const mode = text(input.mode || "read-only").toLowerCase();
  if (mode === "read-only") return "read_only";
  if (eventName === "schedule") return "scheduled_write";
  if (eventName === "workflow_dispatch" && mode === "dry-run") return "manual_dry_run";
  if (eventName === "workflow_dispatch" && mode === "canary-write") return "manual_canary_write";
  if (eventName === "workflow_dispatch" && mode === "write") return "manual_full_write";
  return null;
}

export function expectedManualWriteApproval(task, headSha) {
  return `APPROVE_PRODUCTION_WRITE:${text(task)}:${text(headSha)}`;
}

export function evaluateIngestionConcurrency(rows = [], options = {}) {
  if (!Array.isArray(rows)) return unavailableCheck();
  const task = text(options.task);
  const now = validDate(options.now) ?? new Date();
  const matching = rows.filter((row) => text(row?.task) === task && text(row?.status) === "running");
  if (!matching.length) return { available: true, state: "clear", active_count: 0, stale_count: 0 };
  let activeCount = 0;
  let staleCount = 0;
  for (const row of matching) {
    const startedAt = validDate(row.started_at);
    if (!startedAt || now - startedAt > RUNNING_STALE_MS) staleCount += 1;
    else activeCount += 1;
  }
  return {
    available: true,
    state: activeCount > 0 ? "active" : "stale",
    active_count: activeCount,
    stale_count: staleCount,
  };
}

export function evaluateIngestionCircuitBreaker(rows = []) {
  if (!Array.isArray(rows)) return unavailableCheck();
  const completed = selectEligibleIngestionCircuitHistory(rows);
  const recentTwo = completed.slice(0, 2);
  const failedCount = completed.filter((row) => row.status === "failed").length;
  const consecutiveFailures = recentTwo.length === 2 && recentTwo.every((row) => row.status === "failed");
  const open = consecutiveFailures || failedCount >= 3;
  return {
    available: true,
    state: open ? "open" : "closed",
    completed_runs_checked: completed.length,
    failed_runs: failedCount,
    consecutive_failures: consecutiveFailures ? 2 : countLeadingFailures(completed),
  };
}

export function selectEligibleIngestionCircuitHistory(rows = [], options = {}) {
  if (!Array.isArray(rows)) return null;
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : 6;
  return rows
    .filter((row) => {
      if (!["succeeded", "failed"].includes(text(row?.status))) return false;
      const executionType = text(row?.summary?.execution_type);
      const mode = text(row?.summary?.mode);
      return !["read_only", "manual_dry_run"].includes(executionType) && !["read-only", "dry-run"].includes(mode);
    })
    .sort((left, right) => {
      const timeDifference = timestamp(right.finished_at || right.started_at) - timestamp(left.finished_at || left.started_at);
      if (timeDifference !== 0) return timeDifference;
      return text(right?.id).localeCompare(text(left?.id));
    })
    .slice(0, limit);
}

export function validateProductionSnapshot(snapshot) {
  const keys = [
    "market_listings",
    "market_listing_observations",
    "import_issues",
    "ingestion_runs",
    "review_required",
    "series",
    "variants",
    "stock_reports",
    "restock_events",
  ];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  return keys.every((key) => Number.isInteger(snapshot[key]) && snapshot[key] >= 0);
}

export function evaluateIngestionExecutionSafety(input = {}) {
  const executionType = classifyIngestionExecution(input);
  const task = text(input.task);
  const eventName = text(input.event_name || input.eventName);
  const ref = text(input.ref);
  const headSha = text(input.head_sha || input.headSha).toLowerCase();
  const originMainSha = text(input.origin_main_sha || input.originMainSha).toLowerCase();
  const schedule = text(input.schedule);
  const mode = text(input.mode || "read-only").toLowerCase();
  const sourceScope = text(input.source_scope || input.sourceScope);
  const executeSources = input.execute_sources === true || text(input.execute_sources) === "true";
  const automaticWriteEnabled = normalizeAutomaticWriteEnabled(input.automatic_write_enabled);
  const concurrency = sanitizeConcurrency(input.concurrency);
  const circuitBreaker = sanitizeCircuit(input.circuit_breaker || input.circuitBreaker);
  const durableRunStore = booleanAvailability(input.durable_run_store ?? input.durableRunStore);
  const productionSnapshot = booleanAvailability(input.production_snapshot ?? input.productionSnapshot);
  const manualApproval = text(input.manual_write_approval || input.manualWriteApproval).trim();
  const expectedApproval = expectedManualWriteApproval(task, headSha);
  const manualApprovalValid = executionType === "manual_full_write" && manualApproval === expectedApproval;

  const base = {
    schema_version: INGESTION_EXECUTION_SCHEMA_VERSION,
    ok: false,
    decision: "blocked",
    reason_code: null,
    execution_type: executionType || "read_only",
    task,
    mode,
    event_name: eventName,
    head_sha: headSha,
    main_sha_verified: SHA.test(headSha) && headSha === originMainSha,
    automatic_write_enabled: automaticWriteEnabled,
    manual_approval_valid: manualApprovalValid,
    concurrency,
    circuit_breaker: circuitBreaker,
    durable_run_store: durableRunStore,
    production_snapshot: productionSnapshot,
    database_writes: 0,
  };

  const blocked = (reasonCode) => ({ ...base, reason_code: reasonCode });
  const allowed = () => ({ ...base, ok: true, decision: "allowed", reason_code: null });

  if (!executionType || !INGESTION_EXECUTION_TYPES.includes(executionType)) return blocked("invalid_execution_contract");
  if (!INGESTION_WRITE_TASKS.includes(task)) return blocked("unsupported_write_task");
  if (!SHA.test(headSha) || !SHA.test(originMainSha)) return blocked("invalid_execution_contract");
  if (ref !== "refs/heads/main") return blocked("not_main_branch");
  if (headSha !== originMainSha) return blocked("head_sha_mismatch");

  if (executionType === "read_only" || executionType === "manual_dry_run" || executionType === "manual_canary_write") {
    return allowed();
  }

  if (mode !== "write") return blocked("invalid_execution_contract");
  if (!durableRunStore.available) return blocked("durable_run_store_unavailable");
  if (!productionSnapshot.available) return blocked("production_snapshot_unavailable");
  if (!concurrency.available) return blocked("durable_run_store_unavailable");
  if (concurrency.active_count > 0) return blocked("concurrent_run_detected");
  if (concurrency.stale_count > 0) return blocked("stale_running_record_detected");
  if (!circuitBreaker.available) return blocked("durable_run_store_unavailable");
  if (circuitBreaker.state === "open") return blocked("recent_failure_circuit_open");

  if (executionType === "scheduled_write") {
    if (!schedule || !Object.hasOwn(INGESTION_SCHEDULE_TASKS, schedule)) return blocked("unknown_schedule");
    if (INGESTION_SCHEDULE_TASKS[schedule] !== task) return blocked("schedule_task_mismatch");
    if (!automaticWriteEnabled) return blocked("automatic_ingestion_disabled");
    if (sourceScope !== "all" || !executeSources) return blocked("invalid_execution_contract");
    return allowed();
  }

  if (executionType === "manual_full_write") {
    if (!manualApproval) return blocked("manual_write_approval_missing");
    if (!manualApprovalValid) return blocked("manual_write_approval_mismatch");
    if (sourceScope !== "all" || !executeSources) return blocked("invalid_execution_contract");
    return allowed();
  }

  return blocked("invalid_execution_contract");
}

export function validateTaskDeltas(task, before, after) {
  if (!validateProductionSnapshot(before) || !validateProductionSnapshot(after)) {
    throw new Error("Production snapshot is unavailable.");
  }
  const deltas = Object.fromEntries(Object.keys(before).map((key) => [key, after[key] - before[key]]));
  const allowed = new Set({
    official: ["series", "variants", "import_issues", "ingestion_runs"],
    market: ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "review_required"],
    stock: ["stock_reports", "restock_events", "import_issues", "ingestion_runs", "review_required"],
  }[task] ?? []);
  const negative = Object.entries(deltas).filter(([, value]) => value < 0).map(([key]) => key);
  const unexpected = Object.entries(deltas).filter(([key, value]) => value > 0 && !allowed.has(key)).map(([key]) => key);
  return {
    deltas,
    negative_table_deltas: negative.sort(),
    unexpected_table_deltas: unexpected.sort(),
    ok: negative.length === 0 && unexpected.length === 0,
    database_writes: Object.values(deltas).filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
  };
}

function sanitizeConcurrency(value) {
  if (!value || typeof value !== "object") return unavailableCheck();
  return {
    available: value.available === true,
    state: ["clear", "active", "stale", "unavailable"].includes(value.state) ? value.state : "unavailable",
    active_count: nonnegative(value.active_count),
    stale_count: nonnegative(value.stale_count),
  };
}

function sanitizeCircuit(value) {
  if (!value || typeof value !== "object") return unavailableCheck();
  return {
    available: value.available === true,
    state: ["open", "closed", "unavailable"].includes(value.state) ? value.state : "unavailable",
    completed_runs_checked: nonnegative(value.completed_runs_checked),
    failed_runs: nonnegative(value.failed_runs),
    consecutive_failures: nonnegative(value.consecutive_failures),
  };
}

function booleanAvailability(value) {
  if (value && typeof value === "object") return { available: value.available === true };
  return { available: value === true };
}

function unavailableCheck() {
  return { available: false, state: "unavailable", active_count: 0, stale_count: 0 };
}

function countLeadingFailures(rows) {
  let count = 0;
  for (const row of rows) {
    if (row.status !== "failed") break;
    count += 1;
  }
  return count;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function timestamp(value) {
  return validDate(value)?.getTime() ?? 0;
}

function nonnegative(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function text(value) {
  return String(value ?? "").trim();
}
