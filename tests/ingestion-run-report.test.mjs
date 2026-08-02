import assert from "node:assert/strict";
import test from "node:test";
import { buildSanitizedIngestionRunReport, finalizeReadOnlyIngestionRunReport, findIngestionRunReportSecretLeaks, renderIngestionRunReportMarkdown, validateIngestionRunReport } from "../lib/domain/ingestion-run-report.js";

const sha = "a".repeat(40);
const snapshot = Object.freeze({ market_listings: 1, market_listing_observations: 2, import_issues: 3, ingestion_runs: 4, review_required: 5, series: 6, variants: 7, stock_reports: 8, restock_events: 9 });
function report(overrides = {}) { return buildSanitizedIngestionRunReport({ workflow: { run_id: "42", run_attempt: "1", head_sha: sha, event_name: "schedule", ref: "refs/heads/main" }, execution: { task: "market", mode: "write", execution_type: "scheduled_write", automatic_write_enabled: false, manual_approval_valid: false }, preflight: { ok: false, decision: "blocked", reason_code: "automatic_ingestion_disabled", main_sha_verified: true, concurrency: { available: true, state: "clear" }, circuit_breaker: { available: true, state: "closed" }, durable_run_store: { available: true }, production_snapshot: { available: true } }, result: { status: "blocked", failed_step: "preflight", error_category: "safety_gate" }, database_writes: 0, ...overrides }); }
function readOnlyReport(overrides = {}) {
  const value = buildSanitizedIngestionRunReport({
    workflow: { run_id: "42", run_attempt: "1", head_sha: sha, origin_main_sha: sha, event_name: "workflow_dispatch", ref: "refs/heads/main", ...overrides.workflow },
    execution: { task: "market", mode: "read-only", execution_type: "read_only", source_scope: "none", execute_sources: false, automatic_write_enabled: false, manual_approval_valid: false, ...overrides.execution },
    preflight: { ok: true, decision: "allowed", reason_code: null, main_sha_verified: true, concurrency: { available: true, state: "clear" }, circuit_breaker: { available: true, state: "closed" }, durable_run_store: { available: true }, production_snapshot: { available: true }, ...overrides.preflight },
    database: { before: snapshot, ...overrides.database },
    result: { status: "allowed", started_ingestion: false, completed_ingestion: false, cleanup_started: false, ...overrides.result },
    database_writes: overrides.database_writes ?? 0,
  });
  return value;
}
function finalize(value = readOnlyReport(), options = {}) {
  return finalizeReadOnlyIngestionRunReport({ report: value, after_snapshot: options.after_snapshot ?? snapshot, origin_main_sha: options.origin_main_sha ?? sha });
}
test("blocked report is valid", () => assert.equal(validateIngestionRunReport(report()), true));
test("markdown carries the principal values", () => { const text = renderIngestionRunReportMarkdown(report()); assert.match(text, /automatic_ingestion_disabled/); assert.match(text, /Database writes: 0/); });
test("approval text is never stored", () => assert.doesNotMatch(JSON.stringify(report()), /APPROVE_PRODUCTION_WRITE/));
test("error URLs and long values are removed", () => { const value = report({ result: { status: "blocked", failed_step: "preflight", error_category: "safety_gate", error_message: `bad https://secret.example/${"x".repeat(80)}` } }); assert.doesNotMatch(value.result.error_message, /https|secret\.example|x{24}/); });
test("error message is limited to 300 characters", () => assert.ok(report({ result: { status: "blocked", error_message: "short ".repeat(100) } }).result.error_message.length <= 300));
test("secret scanner finds explicit values", () => assert.deepEqual(findIngestionRunReportSecretLeaks([{ name: "x", text: "prefix secret-value-123 suffix" }], ["secret-value-123"]), ["x"]));
test("secret scanner accepts sanitized report", () => assert.deepEqual(findIngestionRunReportSecretLeaks([{ name: "report.json", text: JSON.stringify(report()) }], ["not-present-secret"]), []));
test("blocked report rejects database writes", () => assert.throws(() => report({ database_writes: 1 }), /zero writes/));
test("unknown raw input fields are omitted", () => {
  const value = buildSanitizedIngestionRunReport({ ...report(), raw_response: "private" });
  assert.equal(Object.hasOwn(value, "raw_response"), false);
  assert.doesNotMatch(JSON.stringify(value), /private/);
});
test("read-only report retains the four completeness fields", () => {
  const value = readOnlyReport();
  assert.equal(value.workflow.origin_main_sha, sha);
  assert.equal(value.execution.source_scope, "none");
  assert.equal(value.execution.execute_sources, false);
  assert.equal(value.result.cleanup_started, false);
});
test("origin main SHA only accepts lowercase 40-character hex", () => {
  assert.throws(() => readOnlyReport({ workflow: { origin_main_sha: "A".repeat(40) } }), /origin main SHA/);
  assert.throws(() => readOnlyReport({ workflow: { origin_main_sha: "a".repeat(39) } }), /origin main SHA/);
  assert.throws(() => readOnlyReport({ workflow: { origin_main_sha: "a".repeat(41) } }), /origin main SHA/);
  assert.throws(() => readOnlyReport({ workflow: { origin_main_sha: `${sha}\n` } }), /origin main SHA/);
});
test("read-only markdown carries completeness fields", () => {
  const text = renderIngestionRunReportMarkdown(readOnlyReport());
  assert.match(text, new RegExp(`Origin main SHA: ${sha}`));
  assert.match(text, /Source scope: none/);
  assert.match(text, /Execute sources: false/);
  assert.match(text, /Cleanup started: false/);
});
test("all-zero read-only snapshots finalize successfully", () => {
  const value = finalize();
  assert.equal(value.result.status, "succeeded");
  assert.equal(value.result.started_ingestion, false);
  assert.equal(value.result.completed_ingestion, false);
  assert.equal(value.result.cleanup_started, false);
  assert.deepEqual(Object.values(value.database.deltas), Array(9).fill(0));
  assert.equal(value.database_writes, 0);
});
test("one nonzero read-only delta fails closed", () => {
  const value = finalize(readOnlyReport(), { after_snapshot: { ...snapshot, market_listings: 2 } });
  assert.equal(value.result.status, "failed");
  assert.equal(value.result.failed_step, "read_only_finalize");
  assert.equal(value.result.error_category, "verification");
  assert.equal(value.database_writes, 0);
});
test("missing after snapshot fails read-only finalization", () => {
  const value = finalizeReadOnlyIngestionRunReport({ report: readOnlyReport(), after_snapshot: null, origin_main_sha: sha });
  assert.equal(value.result.status, "failed");
});
test("missing before snapshot fails read-only finalization", () => {
  const value = readOnlyReport({ database: { before: null } });
  assert.equal(finalize(value).result.status, "failed");
});
test("missing stored origin main SHA fails read-only finalization", () => {
  const value = readOnlyReport();
  delete value.workflow.origin_main_sha;
  assert.equal(finalize(value).result.status, "failed");
});
test("head and origin SHA mismatch fails read-only finalization", () => {
  assert.equal(finalize(readOnlyReport(), { origin_main_sha: "b".repeat(40) }).result.status, "failed");
});
test("read-only source scope must be none", () => {
  assert.equal(finalize(readOnlyReport({ execution: { source_scope: "all" } })).result.status, "failed");
});
test("read-only execute sources must remain false", () => {
  assert.equal(finalize(readOnlyReport({ execution: { execute_sources: true } })).result.status, "failed");
});
test("read-only finalization rejects started ingestion", () => {
  assert.equal(finalize(readOnlyReport({ result: { started_ingestion: true } })).result.status, "failed");
});
test("read-only finalization rejects started cleanup", () => {
  assert.equal(finalize(readOnlyReport({ result: { cleanup_started: true } })).result.status, "failed");
});
test("missing cleanup marker fails read-only finalization", () => {
  const value = readOnlyReport();
  delete value.result.cleanup_started;
  assert.equal(finalize(value).result.status, "failed");
});
test("read-only finalization rejects prior database writes while reporting zero final writes", () => {
  const value = finalize(readOnlyReport({ database_writes: 1 }));
  assert.equal(value.result.status, "failed");
  assert.equal(value.database_writes, 0);
});
test("secret scanner accepts completed sanitized read-only report", () => {
  const value = finalize();
  const files = [{ name: "report.json", text: JSON.stringify(value) }, { name: "report.md", text: renderIngestionRunReportMarkdown(value) }];
  assert.deepEqual(findIngestionRunReportSecretLeaks(files, ["not-present-secret"]), []);
});
test("unknown nested raw fields remain omitted from read-only report", () => {
  const value = buildSanitizedIngestionRunReport({ ...readOnlyReport(), workflow: { ...readOnlyReport().workflow, raw_response: "private" }, execution: { ...readOnlyReport().execution, environment: "private" } });
  assert.doesNotMatch(JSON.stringify(value), /private|raw_response|environment/);
});
