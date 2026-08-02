import {
  INGESTION_EXECUTION_SCHEMA_VERSION,
  INGESTION_EXECUTION_TYPES,
  INGESTION_SAFETY_REASON_CODES,
  INGESTION_WRITE_TASKS,
  validateProductionSnapshot,
} from "./ingestion-execution-safety.js";

const STATUSES = new Set(["allowed", "blocked", "running", "succeeded", "failed"]);
const ERROR_CATEGORIES = new Set([null, "safety_gate", "configuration", "durable_log", "concurrency", "circuit_breaker", "source", "database", "verification", "unknown"]);
const FORBIDDEN_FIELD = /(approval|authorization|cookie|headers?|environment|token|secret|password|service.?role|raw|credential|stack|api.?url)/i;
const SECRET_PATTERN = /(?:bearer\s+[a-z0-9._~-]{12,}|\bgh[pousr]_[a-z0-9_]{12,}\b|\bsb_secret_[a-z0-9._-]{12,}\b|\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\b)/i;
const SHA = /^[0-9a-f]{40}$/;
const PRODUCTION_SNAPSHOT_KEYS = Object.freeze([
  "market_listings",
  "market_listing_observations",
  "import_issues",
  "ingestion_runs",
  "review_required",
  "series",
  "variants",
  "stock_reports",
  "restock_events",
]);

export function buildSanitizedIngestionRunReport(input = {}) {
  const preflight = sanitizePreflight(input.preflight);
  const before = sanitizeSnapshot(input.database?.before);
  const after = sanitizeSnapshot(input.database?.after);
  const deltas = sanitizeDeltas(input.database?.deltas);
  const report = {
    schema_version: INGESTION_EXECUTION_SCHEMA_VERSION,
    generated_at: validIso(input.generated_at) ?? new Date().toISOString(),
    workflow: {
      run_id: boundedText(input.workflow?.run_id, 40),
      run_attempt: boundedText(input.workflow?.run_attempt, 10),
      head_sha: boundedText(input.workflow?.head_sha, 40).toLowerCase(),
      origin_main_sha: nullableSha(input.workflow?.origin_main_sha),
      event_name: boundedText(input.workflow?.event_name, 40),
      ref: boundedText(input.workflow?.ref, 120),
    },
    execution: {
      task: boundedText(input.execution?.task, 20),
      mode: boundedText(input.execution?.mode, 20),
      execution_type: boundedText(input.execution?.execution_type, 40),
      source_scope: nullableText(input.execution?.source_scope, 40),
      execute_sources: input.execution?.execute_sources === true,
      schedule: nullableText(input.execution?.schedule, 80),
      automatic_write_enabled: input.execution?.automatic_write_enabled === true,
      manual_approval_valid: input.execution?.manual_approval_valid === true,
    },
    preflight,
    database: {
      before,
      after,
      deltas,
      unexpected_table_deltas: stringArray(input.database?.unexpected_table_deltas),
      negative_table_deltas: stringArray(input.database?.negative_table_deltas),
    },
    result: {
      status: boundedText(input.result?.status || (preflight.ok ? "allowed" : "blocked"), 20),
      started_ingestion: input.result?.started_ingestion === true,
      completed_ingestion: input.result?.completed_ingestion === true,
      cleanup_started: input.result?.cleanup_started === true,
      failed_step: nullableText(input.result?.failed_step, 80),
      error_category: normalizeErrorCategory(input.result?.error_category),
      error_message: sanitizeErrorMessage(input.result?.error_message),
      durable_run_log_failure: input.result?.durable_run_log_failure === true,
    },
    database_writes: nonnegativeInteger(input.database_writes),
  };
  validateIngestionRunReport(report);
  return report;
}

export function finalizeReadOnlyIngestionRunReport(input = {}) {
  const existing = input.report;
  const after = input.after_snapshot;
  const requestedOriginSha = strictSha(input.origin_main_sha);
  const storedOriginSha = strictSha(existing?.workflow?.origin_main_sha);
  const headSha = strictSha(existing?.workflow?.head_sha);
  const before = existing?.database?.before;
  const requiredFieldsPresent = Boolean(
    existing?.workflow && Object.hasOwn(existing.workflow, "origin_main_sha")
    && existing?.execution && Object.hasOwn(existing.execution, "source_scope")
    && Object.hasOwn(existing.execution, "execute_sources")
    && existing?.result && Object.hasOwn(existing.result, "cleanup_started")
  );
  const snapshotsComplete = validateProductionSnapshot(before) && validateProductionSnapshot(after);
  const deltas = snapshotsComplete
    ? Object.fromEntries(PRODUCTION_SNAPSHOT_KEYS.map((key) => [key, after[key] - before[key]]))
    : {};
  const zeroDeltaVerified = snapshotsComplete
    && PRODUCTION_SNAPSHOT_KEYS.every((key) => deltas[key] === 0);
  const contractValid = Boolean(
    existing?.preflight?.ok === true
    && existing?.execution?.task === "market"
    && existing?.execution?.mode === "read-only"
    && existing?.execution?.source_scope === "none"
    && existing?.execution?.execute_sources === false
    && existing?.result?.started_ingestion === false
    && existing?.result?.cleanup_started === false
    && existing?.database_writes === 0
  );
  const shaValid = Boolean(
    headSha && requestedOriginSha && storedOriginSha
    && headSha === requestedOriginSha
    && headSha === storedOriginSha
  );
  const ok = requiredFieldsPresent && contractValid && shaValid && zeroDeltaVerified;

  return buildSanitizedIngestionRunReport({
    ...existing,
    workflow: {
      ...existing?.workflow,
      origin_main_sha: requestedOriginSha || storedOriginSha,
    },
    database: {
      before,
      after,
      deltas,
      unexpected_table_deltas: Object.entries(deltas).filter(([, delta]) => delta > 0).map(([key]) => key),
      negative_table_deltas: Object.entries(deltas).filter(([, delta]) => delta < 0).map(([key]) => key),
    },
    result: {
      ...existing?.result,
      status: ok ? "succeeded" : "failed",
      started_ingestion: false,
      completed_ingestion: false,
      cleanup_started: false,
      failed_step: ok ? null : "read_only_finalize",
      error_category: ok ? null : "verification",
      error_message: ok ? null : "Read-only safety verification failed.",
    },
    database_writes: 0,
  });
}

export function validateIngestionRunReport(report) {
  assertNoForbiddenFields(report);
  if (report.schema_version !== 1) throw new Error("Unsupported ingestion run report schema.");
  if (!/^\d+$/.test(report.workflow.run_id)) throw new Error("Ingestion report Run ID is invalid.");
  if (!/^[0-9a-f]{40}$/.test(report.workflow.head_sha)) throw new Error("Ingestion report head SHA is invalid.");
  if (report.workflow.origin_main_sha !== null && !SHA.test(report.workflow.origin_main_sha)) throw new Error("Ingestion report origin main SHA is invalid.");
  if (!INGESTION_WRITE_TASKS.includes(report.execution.task)) throw new Error("Ingestion report task is invalid.");
  if (!INGESTION_EXECUTION_TYPES.includes(report.execution.execution_type)) throw new Error("Ingestion report execution type is invalid.");
  if (!STATUSES.has(report.result.status)) throw new Error("Ingestion report status is invalid.");
  if (!ERROR_CATEGORIES.has(report.result.error_category)) throw new Error("Ingestion report error category is invalid.");
  if (report.preflight.reason_code !== null && !INGESTION_SAFETY_REASON_CODES.includes(report.preflight.reason_code)) {
    throw new Error("Ingestion report reason code is invalid.");
  }
  if (report.preflight.ok !== (report.preflight.decision === "allowed")) throw new Error("Ingestion report preflight decision is inconsistent.");
  if (report.preflight.decision === "blocked" && report.database_writes !== 0) throw new Error("Blocked ingestion report must record zero writes.");
  if (!ERROR_CATEGORIES.has(report.result.error_category)) throw new Error("Ingestion report error category is invalid.");
  if (report.result.error_message && report.result.error_message.length > 300) throw new Error("Ingestion report error message is too long.");
  if (report.database.before && !validateProductionSnapshot(report.database.before)) throw new Error("Ingestion report before snapshot is invalid.");
  if (report.database.after && !validateProductionSnapshot(report.database.after)) throw new Error("Ingestion report after snapshot is invalid.");
  if (report.database.unexpected_table_deltas.some((key) => !Object.hasOwn(report.database.deltas, key))) throw new Error("Unexpected delta key is invalid.");
  return true;
}

export function renderIngestionRunReportMarkdown(report) {
  validateIngestionRunReport(report);
  const lines = [
    "# Ingestion Run Safety Report",
    "",
    `- Run: ${report.workflow.run_id}`,
    `- Head SHA: ${report.workflow.head_sha}`,
    `- Origin main SHA: ${report.workflow.origin_main_sha ?? "unavailable"}`,
    `- Event: ${report.workflow.event_name}`,
    `- Task: ${report.execution.task}`,
    `- Mode: ${report.execution.mode}`,
    `- Source scope: ${report.execution.source_scope ?? "unavailable"}`,
    `- Execute sources: ${report.execution.execute_sources}`,
    `- Execution type: ${report.execution.execution_type}`,
    `- Status: ${report.result.status}`,
    `- Preflight: ${report.preflight.decision}`,
    `- Reason code: ${report.preflight.reason_code ?? "none"}`,
    `- Automatic write enabled: ${report.execution.automatic_write_enabled}`,
    `- Manual approval valid: ${report.execution.manual_approval_valid}`,
    `- Database writes: ${report.database_writes}`,
    `- Cleanup started: ${report.result.cleanup_started}`,
    "",
    "## Safety checks",
    "",
    `- Main SHA verified: ${report.preflight.main_sha_verified}`,
    `- Concurrency: ${report.preflight.concurrency.state}`,
    `- Circuit breaker: ${report.preflight.circuit_breaker.state}`,
    `- Durable run store: ${report.preflight.durable_run_store.available ? "available" : "unavailable"}`,
    `- Production snapshot: ${report.preflight.production_snapshot.available ? "available" : "unavailable"}`,
    "",
    "## Database deltas",
    "",
    "| Table | Before | After | Delta |",
    "|---|---:|---:|---:|",
    ...Object.keys(report.database.deltas).sort().map((key) => `| ${key} | ${report.database.before?.[key] ?? "unavailable"} | ${report.database.after?.[key] ?? "unavailable"} | ${report.database.deltas[key]} |`),
    "",
    `- Unexpected positive deltas: ${report.database.unexpected_table_deltas.join(", ") || "none"}`,
    `- Negative deltas: ${report.database.negative_table_deltas.join(", ") || "none"}`,
    `- Failed step: ${report.result.failed_step ?? "none"}`,
    `- Error category: ${report.result.error_category ?? "none"}`,
    `- Error: ${escapeMarkdown(report.result.error_message ?? "none")}`,
    "",
  ];
  return lines.join("\n");
}

export function findIngestionRunReportSecretLeaks(files = [], secretValues = []) {
  const values = [...new Set(secretValues.map(String).filter((value) => value.length >= 8))];
  return files.filter((file) => {
    const text = String(file?.text ?? "");
    return SECRET_PATTERN.test(text) || values.some((value) => text.includes(value));
  }).map((file) => String(file.name || "report")).sort();
}

function sanitizePreflight(value = {}) {
  return {
    ok: value.ok === true,
    decision: value.decision === "allowed" ? "allowed" : "blocked",
    reason_code: value.reason_code == null ? null : boundedText(value.reason_code, 80),
    main_sha_verified: value.main_sha_verified === true,
    concurrency: {
      available: value.concurrency?.available === true,
      state: boundedText(value.concurrency?.state || "unavailable", 20),
      active_count: nonnegativeInteger(value.concurrency?.active_count),
      stale_count: nonnegativeInteger(value.concurrency?.stale_count),
    },
    circuit_breaker: {
      available: value.circuit_breaker?.available === true,
      state: boundedText(value.circuit_breaker?.state || "unavailable", 20),
      completed_runs_checked: nonnegativeInteger(value.circuit_breaker?.completed_runs_checked),
      failed_runs: nonnegativeInteger(value.circuit_breaker?.failed_runs),
      consecutive_failures: nonnegativeInteger(value.circuit_breaker?.consecutive_failures),
    },
    durable_run_store: { available: value.durable_run_store?.available === true },
    production_snapshot: { available: value.production_snapshot?.available === true },
  };
}

function sanitizeSnapshot(value) {
  if (!value || typeof value !== "object" || !validateProductionSnapshot(value)) return null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, nonnegativeInteger(value[key])]));
}

function sanitizeDeltas(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, delta]) => {
    const number = Number(delta);
    if (!Number.isInteger(number)) throw new Error(`Invalid database delta: ${key}.`);
    return [boundedText(key, 80), number];
  }));
}

function sanitizeErrorMessage(value) {
  if (value == null || value === "") return null;
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "[url removed]")
    .replace(/(?:bearer\s+)?[a-z0-9._~-]{24,}/gi, "[value removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function assertNoForbiddenFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(key) && !["manual_approval_valid", "durable_run_log_failure"].includes(key)) {
      throw new Error(`Forbidden ingestion report field: ${key}`);
    }
    assertNoForbiddenFields(child);
  }
}

function normalizeErrorCategory(value) {
  if (value == null || value === "") return null;
  const category = String(value).trim().toLowerCase();
  return ERROR_CATEGORIES.has(category) ? category : "unknown";
}

function nonnegativeInteger(value) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => boundedText(entry, 80)).filter(Boolean))].sort();
}

function nullableText(value, max) {
  const result = boundedText(value, max);
  return result || null;
}

function nullableSha(value) {
  const raw = String(value ?? "");
  return raw || null;
}

function strictSha(value) {
  const normalized = String(value ?? "");
  return SHA.test(normalized) ? normalized : null;
}

function boundedText(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validIso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/[\\|`*_[\]{}()<>#+\-.!~]/g, "\\$&");
}
