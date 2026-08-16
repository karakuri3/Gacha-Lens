import fs from "node:fs";
import path from "node:path";
import {
  buildMarketBoundedDurableRunId,
  buildMarketBoundedResult,
  buildMarketBoundedRows,
  persistMarketBounded,
  renderMarketBoundedResultMarkdown,
  validateMarketBoundedArmingGate,
  validateMarketBoundedPlanIdentity,
} from "../lib/domain/market-bounded-write.js";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { loadMarketBoundedCoverageSnapshot } from "./market-bounded-coverage-data.mjs";

loadOptionalEnvFile();

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));
if (command === "persist") await persist();
else if (command === "blocked") blocked();
else throw new Error("Expected command: persist or blocked.");

function blocked() {
  const outputDir = path.resolve(required(options["output-dir"], "--output-dir"));
  fs.mkdirSync(outputDir, { recursive: true });
  const preflight = options.preflight ? readJson(options.preflight) : {};
  const result = buildMarketBoundedResult({
    workflow: workflowIdentity(),
    status: "blocked",
    reason_code: preflight.reason_code || "bounded_persistence_not_enabled",
    bounded_persistence_enabled: preflight.bounded_persistence_enabled === true,
    bounded_approval_valid: preflight.bounded_approval_valid === true,
    database_writes: 0,
  });
  writeResult(outputDir, result);
}

async function persist() {
  const outputDir = path.resolve(required(options["output-dir"], "--output-dir"));
  fs.mkdirSync(outputDir, { recursive: true });
  const workflow = workflowIdentity();
  let plan = null;
  let rows = null;
  let outcome = null;
  let reasonCode = null;
  let category = null;
  let message = null;
  try {
    const gate = validateMarketBoundedArmingGate({
      simulation: false,
      event_name: options["event-name"],
      ref: options.ref,
      main_sha_verified: options["main-sha-verified"] === "true",
      task: options.task,
      schedule: options.schedule,
      stage: options.stage,
      automatic_write_enabled: options["automatic-write-enabled"],
      bounded_persistence_enabled: options["bounded-persistence-enabled"] ?? process.env.AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED,
      bounded_approval: options["bounded-approval"] ?? process.env.AUTOMATIC_INGESTION_BOUNDED_APPROVAL,
      policy_digest: options["policy-digest"],
      head_sha: options["head-sha"],
    });
    if (!gate.ok) throw boundedError(gate.reason_code);

    const auditPath = path.resolve(required(options.audit, "--audit"));
    const auditBytes = fs.readFileSync(auditPath);
    const audit = JSON.parse(auditBytes.toString("utf8"));
    plan = readJson(required(options.plan, "--plan"));
    validateMarketBoundedPlanIdentity({
      audit_bytes: auditBytes,
      audit,
      plan,
      workflow,
      policy_digest: options["policy-digest"],
      simulation: false,
    });
    const coverageSnapshot = await loadMarketBoundedCoverageSnapshot({ workflow });
    rows = buildMarketBoundedRows({
      audit,
      plan,
      workflow,
      coverage_snapshot: coverageSnapshot,
      observed_at: plan.generated_at,
    });
    if (!rows.candidates.length) {
      outcome = { ok: true, operations: { listings: [], observations: [] }, verification: { rows_verified: true, deltas_verified: true }, rollback: emptyRollback(), database_deltas: {}, database_writes: 0 };
      writeResult(outputDir, buildMarketBoundedResult({ workflow, plan, rows, ...outcome, status: "no-op", bounded_persistence_enabled: true, bounded_approval_valid: true }));
      return;
    }

    const durableRunId = buildMarketBoundedDurableRunId({
      execution_path: "scheduled",
      workflow_run_id: workflow.run_id,
      workflow_run_attempt: workflow.run_attempt,
      plan_digest: plan.plan_digest,
    });
    const store = createStore();
    outcome = await persistMarketBounded({
      listingRows: rows.listingRows,
      observationRows: rows.observationRows,
      durableRunId,
      buildDurableRunRow: (operations) => durableRunRow({ id: durableRunId, workflow, plan, rows, outcome: { operations }, status: "succeeded" }),
      store,
    });
    const result = buildMarketBoundedResult({
      workflow, plan, rows, ...outcome, status: "succeeded",
      bounded_persistence_enabled: true, bounded_approval_valid: true,
    });
    writeResult(outputDir, result);
  } catch (error) {
    reasonCode = error?.reason_code || "bounded_verification_failed";
    category = error?.category || "unknown";
    message = error?.message || reasonCode;
    outcome = error?.bounded_result ?? outcome ?? { operations: { listings: [], observations: [] }, verification: {}, rollback: emptyRollback(), database_deltas: {}, database_writes: 0 };
    const status = outcome.rollback?.attempted
      ? outcome.rollback.verified ? "rolled-back" : "rollback-failed"
      : "blocked";
    writeResult(outputDir, buildMarketBoundedResult({
      workflow, plan, rows, ...outcome, status, reason_code: reasonCode,
      error_category: category, error_message: message,
      bounded_persistence_enabled: (options["bounded-persistence-enabled"] ?? process.env.AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED) === "true",
      bounded_approval_valid: false,
      database_writes: 0,
    }));
    throw new Error(`Bounded market persistence failed closed: ${reasonCode}`);
  }
}

function createStore() {
  return {
    fetchRowsByIds,
    fetchCounts: productionCounts,
    upsertRows,
    deleteRowsByIds,
    fetchObservationsByListingIds: async (ids) => ids.length ? fetchRows("market_listing_observations", {
      select: "*", pageSize: 100, params: { listing_id: inFilter(ids), order: "id.asc" },
    }) : [],
  };
}

async function fetchRowsByIds(table, ids) {
  if (!ids.length) return [];
  return fetchRows(table, { select: "*", pageSize: Math.max(2, ids.length), params: { id: inFilter(ids), order: "id.asc" } });
}

async function productionCounts() {
  const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
  const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]);
  return Object.fromEntries([...tables, "review_required"].map((key, index) => [key, values[index]]));
}

function durableRunRow({ id, workflow, plan, rows, outcome, status, reasonCode = null }) {
  const stableTime = plan?.generated_at ?? new Date(0).toISOString();
  return {
    id,
    task: "market",
    status,
    trigger_source: "schedule",
    started_at: stableTime,
    finished_at: stableTime,
    duration_ms: 0,
    summary: {
      rollout_stage: "market-bounded",
      rollout_policy_digest: plan?.policy_digest ?? null,
      bounded_persistence_enabled: true,
      bounded_approval_valid: true,
      audit_digest: plan?.audit_digest ?? null,
      plan_digest: plan?.plan_digest ?? null,
      candidate_count: rows?.candidates?.length ?? 0,
      auto_eligible_count: rows?.candidates?.length ?? 0,
      listing_operations: operationSummary(outcome?.operations?.listings),
      observation_operations: operationSummary(outcome?.operations?.observations),
      bounded_result_status: status,
      bounded_result_reason_code: reasonCode,
      rollback_state: outcome?.rollback?.verified ? "verified" : outcome?.rollback?.attempted ? "failed" : "not_attempted",
    },
    error_message: status === "failed" ? "Bounded market persistence failed." : null,
  };
}

function writeResult(outputDir, result) {
  fs.writeFileSync(path.join(outputDir, "market-bounded-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "market-bounded-result.md"), renderMarketBoundedResultMarkdown(result), "utf8");
  writeOutput("result_generated", true);
  writeOutput("status", result.result.status);
  writeOutput("reason_code", result.result.reason_code ?? "none");
  writeOutput("database_writes", result.database_writes);
}

function workflowIdentity() {
  return {
    run_id: process.env.GITHUB_RUN_ID || options["run-id"] || "0",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || options["run-attempt"] || "1",
    head_sha: String(process.env.GITHUB_SHA || options["head-sha"] || "").toLowerCase(),
    event_name: process.env.GITHUB_EVENT_NAME || options["event-name"] || "",
    ref: process.env.GITHUB_REF || options.ref || "",
  };
}

function inFilter(ids) { return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`; }
function operationSummary(entries = []) { return Object.fromEntries(["insert", "update", "unchanged"].map((name) => [name, entries.filter((entry) => entry.operation === name).length])); }
function emptyRollback() { return { attempted: false, verified: false, listings_deleted: 0, observations_deleted: 0, listings_restored: 0, observations_restored: 0 }; }
function boundedError(reasonCode) { const error = new Error(reasonCode); error.reason_code = reasonCode; error.category = "safety_gate"; return error; }
function required(value, label) { if (!value) throw new Error(`${label} is required.`); return value; }
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8"); }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
