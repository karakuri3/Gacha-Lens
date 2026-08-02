import fs from "node:fs";
import path from "node:path";
import { stableId } from "../lib/fetchers/feed-source-utils.js";
import {
  evaluateAutomaticIngestionThrottle,
  findAutomaticIngestionRolloutSecretLeaks,
  loadAutomaticIngestionRolloutPolicy,
} from "../lib/domain/automatic-ingestion-rollout.js";
import { evaluateIngestionCircuitBreaker, evaluateIngestionConcurrency } from "../lib/domain/ingestion-execution-safety.js";
import {
  buildMarketBoundedResult,
  buildMarketBoundedRows,
  canonicalJson,
  persistMarketBounded,
  renderMarketBoundedResultMarkdown,
  validateMarketBoundedPlanIdentity,
} from "../lib/domain/market-bounded-write.js";
import {
  validateManualMarketBoundedArmingGate,
  validateManualMarketBoundedOutcome,
} from "../lib/domain/manual-market-bounded-execution.js";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";

loadOptionalEnvFile();

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));
const policyPath = path.resolve(options.policy || "config/automatic-ingestion-rollout-policy.json");

if (command === "preflight") await preflight();
else if (command === "persist") await persist();
else if (command === "scan") scan();
else if (command === "verify") verify();
else throw new Error("Expected command: preflight, persist, scan, or verify.");

async function preflight() {
  const outputDir = outputDirectory();
  fs.mkdirSync(outputDir, { recursive: true });
  const { policy, digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
  let runningRows = null;
  let historyRows = null;
  let counts = null;
  try {
    [runningRows, historyRows, counts] = await Promise.all([
      fetchRows("ingestion_runs", { select: "id,task,status,started_at,finished_at,summary", pageSize: 1000, params: { task: "eq.market", status: "eq.running", order: "started_at.asc,id.asc" } }),
      fetchRows("ingestion_runs", { select: "id,task,status,started_at,finished_at,summary", pageSize: 100, params: { task: "eq.market", status: "in.(succeeded,failed)", order: "finished_at.desc,id.desc" } }),
      productionCounts(),
    ]);
  } catch {
    runningRows = null;
    historyRows = null;
    counts = null;
  }
  const concurrency = evaluateIngestionConcurrency(runningRows, { task: "market" });
  const circuitBreaker = evaluateIngestionCircuitBreaker(historyRows);
  const throttle = evaluateAutomaticIngestionThrottle({
    stage: "market-bounded",
    task: "market",
    policy: policy.stages["market-bounded"],
    history_rows: historyRows,
    running_rows: runningRows,
    github_rows: [],
  });
  const gate = validateManualGate(digest);
  const safetyAvailable = Array.isArray(runningRows) && Array.isArray(historyRows) && counts !== null;
  const safetyClear = safetyAvailable && concurrency.state === "clear" && circuitBreaker.state === "closed" && throttle.ok === true;
  const allowed = gate.ok && safetyClear;
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    workflow: workflowIdentity(),
    decision: allowed ? "allowed" : "blocked",
    action: allowed ? "bounded-plan" : "blocked",
    reason_code: gate.reason_code ?? (!safetyAvailable ? "manual_bounded_safety_unavailable" : !safetyClear ? "manual_bounded_safety_blocked" : null),
    stage: "market-bounded",
    task: "market",
    schedule: null,
    policy_digest: digest,
    main_sha_verified: normalizedSha(process.env.MANUAL_EXPECTED_MAIN_SHA) === normalizedSha(options["head-sha"] ?? process.env.GITHUB_SHA)
      && normalizedSha(options["head-sha"] ?? process.env.GITHUB_SHA) === normalizedSha(options["origin-main-sha"]),
    bounded_approval_valid: gate.bounded_approval_valid,
    persistence_authorized: allowed,
    concurrency,
    circuit_breaker: circuitBreaker,
    throttle,
    durable_run_store: { available: Array.isArray(historyRows) },
    production_snapshot: { available: counts !== null, counts },
    ingestion_started: false,
    cleanup_started: false,
    database_writes: 0,
  };
  writeJson(path.join(outputDir, "manual-market-bounded-preflight.json"), report);
  fs.writeFileSync(path.join(outputDir, "manual-market-bounded-preflight.md"), renderPreflight(report), "utf8");
  writeOutput("allowed", allowed);
  writeOutput("bounded_approval_valid", gate.bounded_approval_valid);
  writeOutput("persistence_authorized", allowed);
  writeOutput("policy_digest", digest);
  writeOutput("report_generated", true);
  if (!allowed) throw new Error(`Manual bounded preflight failed closed: ${report.reason_code}`);
}

async function persist() {
  const outputDir = outputDirectory();
  fs.mkdirSync(outputDir, { recursive: true });
  const workflow = workflowIdentity();
  const preflightReport = readJson(required(options.preflight, "--preflight"));
  let plan = null;
  let rows = null;
  let outcome = null;
  let result = null;
  let afterCounts = null;
  try {
    const { digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
    const gate = validateManualGate(digest);
    if (!gate.ok || preflightReport.decision !== "allowed" || preflightReport.persistence_authorized !== true) {
      throw manualError(gate.reason_code || "manual_bounded_preflight_changed");
    }
    const auditPath = path.resolve(required(options.audit, "--audit"));
    const auditBytes = fs.readFileSync(auditPath);
    const audit = JSON.parse(auditBytes.toString("utf8"));
    plan = readJson(required(options.plan, "--plan"));
    const preview = readJson(required(options.preview, "--preview"));
    if (preview.preview_generated !== true || preview.audit_digest_verified !== true || preview.plan_digest_verified !== true
      || preview.candidate_set_verified !== true || preview.row_identity_verified !== true
      || preview.idempotency_preflight_verified !== true || Number(preview.database_writes) !== 0) {
      throw manualError("manual_bounded_preview_invalid");
    }
    validateMarketBoundedPlanIdentity({ audit_bytes: auditBytes, audit, plan, workflow, policy_digest: digest, simulation: true });
    rows = buildMarketBoundedRows({ audit, plan, workflow, observed_at: plan.generated_at });
    const beforeCounts = await productionCounts();
    assertCountsEqual(preflightReport.production_snapshot?.counts, beforeCounts);
    const runId = stableId("market-bounded-manual-run", workflow.run_id, workflow.run_attempt, plan.plan_digest);
    outcome = await persistMarketBounded({
      listingRows: rows.listingRows,
      observationRows: rows.observationRows,
      durableRunId: runId,
      buildDurableRunRow: (operations) => durableRunRow({ id: runId, workflow, plan, rows, operations }),
      store: createStore(),
    });
    validateManualMarketBoundedOutcome({ candidates: rows.candidates.length, operations: outcome.operations, database_writes: outcome.database_writes, deltas: outcome.database_deltas });
    afterCounts = await productionCounts();
    result = withDurableOperation(buildMarketBoundedResult({ workflow, plan, rows, ...outcome, status: rows.candidates.length ? "succeeded" : "no-op", schedule: "manual", automatic_write_enabled: true, bounded_persistence_enabled: true, bounded_approval_valid: true }), outcome.operations?.durable_run);
    writePersistenceArtifacts(outputDir, result, preflightReport.production_snapshot.counts, afterCounts);
    writeOutput("result_generated", true);
    writeOutput("status", result.result.status);
    writeOutput("database_writes", result.database_writes);
  } catch (error) {
    outcome = error?.bounded_result ?? outcome ?? { operations: { listings: [], observations: [] }, verification: {}, rollback: emptyRollback(), database_deltas: {}, database_writes: 0 };
    afterCounts = await safeProductionCounts();
    const status = outcome.rollback?.attempted ? outcome.rollback.verified ? "rolled-back" : "rollback-failed" : "blocked";
    result = withDurableOperation(buildMarketBoundedResult({ workflow, plan, rows, ...outcome, status, reason_code: error?.reason_code || "bounded_verification_failed", error_category: error?.category || "safety_gate", error_message: "Manual bounded persistence failed closed.", schedule: "manual", automatic_write_enabled: true, bounded_persistence_enabled: true, bounded_approval_valid: false, database_writes: 0 }), outcome.operations?.durable_run);
    writePersistenceArtifacts(outputDir, result, preflightReport.production_snapshot?.counts, afterCounts);
    writeOutput("result_generated", true);
    writeOutput("status", result.result.status);
    writeOutput("database_writes", 0);
    throw new Error(`Manual bounded persistence failed closed: ${result.result.reason_code}`);
  }
}

function scan() {
  const outputDir = outputDirectory();
  const directories = required(options.directories, "--directories").split(",").map((entry) => path.resolve(entry));
  const files = directories.flatMap(listFiles).map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") }));
  if (!files.length) throw new Error("Manual bounded artifact files are missing.");
  const secretValues = Object.entries(process.env)
    .filter(([name]) => /(?:KEY|TOKEN|SECRET|PASSWORD|APPLICATION_ID|AFFILIATE_ID|APPROVAL|NONCE)$/i.test(name))
    .map(([, value]) => value).filter(Boolean);
  const findings = findAutomaticIngestionRolloutSecretLeaks(files, secretValues);
  if (findings.length) throw new Error(`Manual bounded artifact secret scan failed for ${findings.length} file(s).`);
  const report = { schema_version: 1, files_scanned: files.length, secret_findings: 0 };
  writeJson(path.join(outputDir, "manual-market-bounded-secret-scan.json"), report);
  fs.writeFileSync(path.join(outputDir, "manual-market-bounded-secret-scan.md"), `# Manual bounded secret scan\n\n- Files scanned: ${files.length}\n- Secret findings: 0\n`, "utf8");
  writeOutput("secret_findings", 0);
}

function verify() {
  const preflightReport = readJson(required(options.preflight, "--preflight"));
  const preview = readJson(required(options.preview, "--preview"));
  const result = readJson(required(options.result, "--result"));
  const delta = readJson(required(options.delta, "--delta"));
  const scanReport = readJson(required(options.scan, "--scan"));
  const allowedStatus = ["succeeded", "no-op"].includes(result.result?.status);
  validateManualMarketBoundedOutcome({ candidates: result.candidates?.length ?? 0, operations: result.operations, database_writes: result.database_writes, deltas: result.database_deltas });
  if (preflightReport.persistence_authorized !== true || preflightReport.bounded_approval_valid !== true
    || preview.preview_generated !== true || preview.row_identity_verified !== true || preview.idempotency_preflight_verified !== true
    || !allowedStatus || result.verification?.rows_verified !== true || result.verification?.deltas_verified !== true
    || delta.allowed !== true || Number(scanReport.secret_findings) !== 0) {
    throw new Error("Manual bounded final verification failed closed.");
  }
  console.log(JSON.stringify({ ok: true, status: result.result.status, database_writes: result.database_writes, secret_findings: 0 }));
}

function validateManualGate(digest) {
  return validateManualMarketBoundedArmingGate({
    event_name: options["event-name"] ?? process.env.GITHUB_EVENT_NAME,
    ref: options.ref ?? process.env.GITHUB_REF,
    task: "market",
    stage: options.stage,
    expected_main_sha: process.env.MANUAL_EXPECTED_MAIN_SHA,
    head_sha: options["head-sha"] ?? process.env.GITHUB_SHA,
    origin_main_sha: options["origin-main-sha"],
    main_sha_verified: process.env.MANUAL_EXPECTED_MAIN_SHA === (options["head-sha"] ?? process.env.GITHUB_SHA)
      && (options["head-sha"] ?? process.env.GITHUB_SHA) === options["origin-main-sha"],
    expected_policy_digest: process.env.MANUAL_EXPECTED_POLICY_DIGEST,
    policy_digest: digest,
    configured_policy_digest: process.env.AUTOMATIC_INGESTION_ROLLOUT_POLICY_DIGEST,
    approval_nonce: process.env.MANUAL_APPROVAL_NONCE,
    confirmation: process.env.MANUAL_CONFIRMATION,
    automatic_write_enabled: process.env.AUTOMATIC_INGESTION_WRITE_ENABLED,
    bounded_persistence_enabled: process.env.AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED,
    bounded_approval: process.env.AUTOMATIC_INGESTION_BOUNDED_APPROVAL,
  });
}

function createStore() {
  return { fetchRowsByIds, fetchCounts: productionCounts, upsertRows, deleteRowsByIds, fetchObservationsByListingIds: async (ids) => ids.length ? fetchRows("market_listing_observations", { select: "*", pageSize: 100, params: { listing_id: inFilter(ids), order: "id.asc" } }) : [] };
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

async function safeProductionCounts() { try { return await productionCounts(); } catch { return null; } }

function durableRunRow({ id, workflow, plan, rows, operations }) {
  const stableTime = plan.generated_at;
  return {
    id, task: "market", status: "succeeded", trigger_source: "workflow_dispatch",
    started_at: stableTime, finished_at: stableTime, duration_ms: 0,
    summary: {
      execution_path: "manual-bounded", rollout_stage: "market-bounded",
      rollout_policy_digest: plan.policy_digest, bounded_persistence_enabled: true,
      bounded_approval_valid: true, audit_digest: plan.audit_digest, plan_digest: plan.plan_digest,
      candidate_count: rows.candidates.length, auto_eligible_count: rows.candidates.length,
      listing_operations: operationSummary(operations.listings), observation_operations: operationSummary(operations.observations),
      bounded_result_status: "succeeded", rollback_state: "not_attempted",
    },
    error_message: null,
  };
}

function writePersistenceArtifacts(outputDir, result, before, after) {
  writeJson(path.join(outputDir, "market-bounded-result.json"), result);
  fs.writeFileSync(path.join(outputDir, "market-bounded-result.md"), renderMarketBoundedResultMarkdown(result), "utf8");
  writeJson(path.join(outputDir, "manual-market-bounded-rollback.json"), result.rollback);
  const delta = buildDelta(before, after);
  writeJson(path.join(outputDir, "manual-market-bounded-production-delta.json"), delta);
  fs.writeFileSync(path.join(outputDir, "manual-market-bounded-production-delta.md"), renderDelta(delta), "utf8");
}

function buildDelta(before, after) {
  const keys = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "review_required", "series", "variants", "stock_reports", "restock_events"];
  if (!before || !after) return { schema_version: 1, available: false, allowed: false, before: null, after: null, deltas: {} };
  const deltas = Object.fromEntries(keys.map((key) => [key, Number(after[key]) - Number(before[key])]));
  const allowed = deltas.market_listings >= 0 && deltas.market_listings <= 2
    && deltas.market_listing_observations >= 0 && deltas.market_listing_observations <= 2
    && deltas.ingestion_runs >= 0 && deltas.ingestion_runs <= 1
    && ["import_issues", "review_required", "series", "variants", "stock_reports", "restock_events"].every((key) => deltas[key] === 0);
  return { schema_version: 1, available: true, allowed, before, after, deltas };
}

function renderPreflight(report) { return `# Manual market bounded preflight\n\n- Decision: ${report.decision}\n- Reason: ${report.reason_code ?? "none"}\n- Main SHA verified: ${report.main_sha_verified}\n- Policy digest: ${report.policy_digest}\n- Concurrency: ${report.concurrency.state}\n- Circuit breaker: ${report.circuit_breaker.state}\n- Throttle: ${report.throttle.state}\n- Durable run store: ${report.durable_run_store.available}\n- Bounded approval valid: ${report.bounded_approval_valid}\n- Persistence authorized: ${report.persistence_authorized}\n- Production writes: 0\n`; }
function renderDelta(delta) { return `# Manual market bounded Production delta\n\n- Available: ${delta.available}\n- Allowed: ${delta.allowed}\n${Object.entries(delta.deltas).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`; }
function withDurableOperation(result, operation) { return { ...result, operations: { ...result.operations, durable_run: ["insert", "update", "unchanged"].includes(operation) ? operation : "unchanged" } }; }
function operationSummary(entries = []) { return Object.fromEntries(["insert", "update", "unchanged"].map((name) => [name, entries.filter((entry) => entry.operation === name).length])); }
function assertCountsEqual(left, right) { if (!left || !right || canonicalJson(left) !== canonicalJson(right)) throw manualError("manual_bounded_preflight_changed"); }
function manualError(reasonCode) { const error = new Error(reasonCode); error.reason_code = reasonCode; error.category = "safety_gate"; return error; }
function emptyRollback() { return { attempted: false, verified: false, listings_deleted: 0, observations_deleted: 0, listings_restored: 0, observations_restored: 0 }; }
function workflowIdentity() { return { run_id: process.env.GITHUB_RUN_ID || options["run-id"] || "0", run_attempt: process.env.GITHUB_RUN_ATTEMPT || options["run-attempt"] || "1", head_sha: String(process.env.GITHUB_SHA || options["head-sha"] || "").toLowerCase(), event_name: process.env.GITHUB_EVENT_NAME || options["event-name"] || "", ref: process.env.GITHUB_REF || options.ref || "" }; }
function outputDirectory() { return path.resolve(required(options["output-dir"], "--output-dir")); }
function inFilter(ids) { return `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`; }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
function required(value, label) { if (!value) throw new Error(`${label} is required.`); return value; }
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8"); }
function normalizedSha(value) { return String(value ?? "").trim().toLowerCase(); }
function listFiles(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => { const entryPath = path.join(directory, entry.name); return entry.isDirectory() ? listFiles(entryPath) : [entryPath]; }).sort((left, right) => left.localeCompare(right, "en")); }
