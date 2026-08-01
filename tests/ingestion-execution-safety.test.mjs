import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateIngestionCircuitBreaker,
  evaluateIngestionConcurrency,
  evaluateIngestionExecutionSafety,
  expectedManualWriteApproval,
  normalizeAutomaticWriteEnabled,
  validateProductionSnapshot,
  validateTaskDeltas,
} from "../lib/domain/ingestion-execution-safety.js";

const sha = "a".repeat(40);
const snapshot = Object.freeze({ market_listings: 1, market_listing_observations: 2, import_issues: 3, ingestion_runs: 4, review_required: 5, series: 6, variants: 7, stock_reports: 8, restock_events: 9 });
function scheduled(overrides = {}) {
  return evaluateIngestionExecutionSafety({ event_name: "schedule", ref: "refs/heads/main", head_sha: sha, origin_main_sha: sha, task: "market", mode: "write", schedule: "17,47 * * * *", source_scope: "all", execute_sources: true, automatic_write_enabled: "true", concurrency: { available: true, state: "clear" }, circuit_breaker: { available: true, state: "closed" }, durable_run_store: true, production_snapshot: true, ...overrides });
}
function manual(overrides = {}) {
  return evaluateIngestionExecutionSafety({ event_name: "workflow_dispatch", ref: "refs/heads/main", head_sha: sha, origin_main_sha: sha, task: "market", mode: "write", source_scope: "all", execute_sources: true, manual_write_approval: expectedManualWriteApproval("market", sha), concurrency: { available: true, state: "clear" }, circuit_breaker: { available: true, state: "closed" }, durable_run_store: true, production_snapshot: true, ...overrides });
}

test("kill switch accepts only exact lowercase true", () => assert.deepEqual(["true", " true ", "false", "1", "yes", "on", "TRUE", undefined].map(normalizeAutomaticWriteEnabled), [true, false, false, false, false, false, false, false]));
test("scheduled market contract is allowed", () => assert.equal(scheduled().ok, true));
for (const [name, overrides, reason] of [
  ["missing kill switch", { automatic_write_enabled: undefined }, "automatic_ingestion_disabled"],
  ["false kill switch", { automatic_write_enabled: "false" }, "automatic_ingestion_disabled"],
  ["non-main ref", { ref: "refs/heads/dev" }, "not_main_branch"],
  ["head mismatch", { origin_main_sha: "b".repeat(40) }, "head_sha_mismatch"],
  ["unknown schedule", { schedule: "1 * * * *" }, "unknown_schedule"],
  ["schedule task mismatch", { task: "official" }, "schedule_task_mismatch"],
  ["scheduled all", { task: "all" }, "unsupported_write_task"],
  ["invalid source scope", { source_scope: "planner-apis" }, "invalid_execution_contract"],
  ["sources disabled", { execute_sources: false }, "invalid_execution_contract"],
  ["run store unavailable", { durable_run_store: false }, "durable_run_store_unavailable"],
  ["snapshot unavailable", { production_snapshot: false }, "production_snapshot_unavailable"],
  ["active task", { concurrency: { available: true, state: "active", active_count: 1 } }, "concurrent_run_detected"],
  ["stale task", { concurrency: { available: true, state: "stale", stale_count: 1 } }, "stale_running_record_detected"],
  ["open circuit", { circuit_breaker: { available: true, state: "open" } }, "recent_failure_circuit_open"],
]) test(`scheduled write rejects ${name}`, () => assert.equal(scheduled(overrides).reason_code, reason));

for (const [schedule, task] of [["7 * * * *", "official"], ["17,47 * * * *", "market"], ["37 * * * *", "stock"]]) {
  test(`schedule ${schedule} maps to ${task}`, () => assert.equal(scheduled({ schedule, task }).ok, true));
}
test("manual approval is accepted exactly", () => assert.equal(manual().ok, true));
test("manual approval missing is blocked", () => assert.equal(manual({ manual_write_approval: "" }).reason_code, "manual_write_approval_missing"));
test("manual task mismatch is blocked", () => assert.equal(manual({ manual_write_approval: expectedManualWriteApproval("stock", sha) }).reason_code, "manual_write_approval_mismatch"));
test("manual SHA mismatch is blocked", () => assert.equal(manual({ manual_write_approval: expectedManualWriteApproval("market", "b".repeat(40)) }).reason_code, "manual_write_approval_mismatch"));
test("manual surrounding whitespace is ignored", () => assert.equal(manual({ manual_write_approval: ` ${expectedManualWriteApproval("market", sha)} ` }).ok, true));
test("manual all write is blocked", () => assert.equal(manual({ task: "all" }).reason_code, "unsupported_write_task"));

test("active concurrency is detected", () => assert.equal(evaluateIngestionConcurrency([{ task: "market", status: "running", started_at: new Date(Date.now() - 10_000).toISOString() }], { task: "market" }).state, "active"));
test("stale concurrency is detected", () => assert.equal(evaluateIngestionConcurrency([{ task: "market", status: "running", started_at: new Date(Date.now() - 31 * 60_000).toISOString() }], { task: "market" }).state, "stale"));
test("invalid running time is stale", () => assert.equal(evaluateIngestionConcurrency([{ task: "market", status: "running", started_at: "bad" }], { task: "market" }).stale_count, 1));
test("another task does not block", () => assert.equal(evaluateIngestionConcurrency([{ task: "stock", status: "running", started_at: new Date().toISOString() }], { task: "market" }).state, "clear"));
test("unavailable concurrency fails closed", () => assert.equal(evaluateIngestionConcurrency(null).available, false));

const completed = (statuses) => statuses.map((status, index) => ({ status, finished_at: new Date(Date.now() - index * 1000).toISOString(), summary: { execution_type: "scheduled_write", mode: "write" } }));
test("two consecutive failures open circuit", () => assert.equal(evaluateIngestionCircuitBreaker(completed(["failed", "failed"])).state, "open"));
test("three of six failures open circuit", () => assert.equal(evaluateIngestionCircuitBreaker(completed(["failed", "succeeded", "failed", "succeeded", "failed", "succeeded"])).state, "open"));
test("success breaks consecutive failure", () => assert.equal(evaluateIngestionCircuitBreaker(completed(["failed", "succeeded"])).state, "closed"));
test("dry and read-only failures are excluded", () => assert.equal(evaluateIngestionCircuitBreaker([{ status: "failed", summary: { mode: "dry-run" } }, { status: "failed", summary: { execution_type: "read_only" } }]).failed_runs, 0));
test("running and cancelled are excluded", () => assert.equal(evaluateIngestionCircuitBreaker([{ status: "running" }, { status: "cancelled" }]).completed_runs_checked, 0));
test("unavailable circuit history fails closed", () => assert.equal(evaluateIngestionCircuitBreaker(null).available, false));

test("complete snapshot is valid", () => assert.equal(validateProductionSnapshot(snapshot), true));
test("missing snapshot table is invalid", () => { const value = { ...snapshot }; delete value.series; assert.equal(validateProductionSnapshot(value), false); });
test("negative count is invalid", () => assert.equal(validateProductionSnapshot({ ...snapshot, variants: -1 }), false));
test("market allowed deltas pass", () => assert.equal(validateTaskDeltas("market", snapshot, { ...snapshot, market_listings: 2, ingestion_runs: 5 }).ok, true));
test("market official delta fails", () => assert.deepEqual(validateTaskDeltas("market", snapshot, { ...snapshot, series: 7 }).unexpected_table_deltas, ["series"]));
test("official observation delta fails", () => assert.deepEqual(validateTaskDeltas("official", snapshot, { ...snapshot, market_listing_observations: 3 }).unexpected_table_deltas, ["market_listing_observations"]));
test("stock market delta fails", () => assert.deepEqual(validateTaskDeltas("stock", snapshot, { ...snapshot, market_listings: 2 }).unexpected_table_deltas, ["market_listings"]));
test("negative delta fails", () => assert.deepEqual(validateTaskDeltas("market", snapshot, { ...snapshot, import_issues: 2 }).negative_table_deltas, ["import_issues"]));
