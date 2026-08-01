import assert from "node:assert/strict";
import test from "node:test";
import { buildSanitizedIngestionRunReport, findIngestionRunReportSecretLeaks, renderIngestionRunReportMarkdown, validateIngestionRunReport } from "../lib/domain/ingestion-run-report.js";

const sha = "a".repeat(40);
function report(overrides = {}) { return buildSanitizedIngestionRunReport({ workflow: { run_id: "42", run_attempt: "1", head_sha: sha, event_name: "schedule", ref: "refs/heads/main" }, execution: { task: "market", mode: "write", execution_type: "scheduled_write", automatic_write_enabled: false, manual_approval_valid: false }, preflight: { ok: false, decision: "blocked", reason_code: "automatic_ingestion_disabled", main_sha_verified: true, concurrency: { available: true, state: "clear" }, circuit_breaker: { available: true, state: "closed" }, durable_run_store: { available: true }, production_snapshot: { available: true } }, result: { status: "blocked", failed_step: "preflight", error_category: "safety_gate" }, database_writes: 0, ...overrides }); }
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
