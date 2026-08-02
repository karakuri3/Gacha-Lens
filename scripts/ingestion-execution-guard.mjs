import fs from "node:fs";
import path from "node:path";
import {
  evaluateIngestionCircuitBreaker,
  evaluateIngestionConcurrency,
  evaluateIngestionExecutionSafety,
  validateTaskDeltas,
} from "../lib/domain/ingestion-execution-safety.js";
import {
  buildSanitizedIngestionRunReport,
  finalizeReadOnlyIngestionRunReport,
  findIngestionRunReportSecretLeaks,
  renderIngestionRunReportMarkdown,
} from "../lib/domain/ingestion-run-report.js";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

loadOptionalEnvFile();

const TABLES = [
  "market_listings", "market_listing_observations", "import_issues", "ingestion_runs",
  "series", "variants", "stock_reports", "restock_events",
];
const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));

if (command === "preflight") await preflight();
else if (command === "snapshot") await snapshot();
else if (command === "finalize") await finalize();
else if (command === "finalize-read-only") await finalizeReadOnly();
else if (command === "scan") scan();
else throw new Error("Expected command: preflight, snapshot, finalize, finalize-read-only, or scan.");

async function preflight() {
  const outputDir = required(options["output-dir"], "--output-dir");
  const task = required(options.task, "--task");
  let concurrency;
  let circuitBreaker;
  let before;
  let durableRunStore = true;
  try {
    const [runningRows, historyRows] = await Promise.all([
      fetchRows("ingestion_runs", {
        select: "id,task,status,started_at,finished_at,summary",
        pageSize: 1000,
        params: { task: `eq.${task}`, status: "eq.running", order: "started_at.asc,id.asc" },
      }),
      fetchRows("ingestion_runs", {
        select: "id,task,status,started_at,finished_at,summary",
        pageSize: 6,
        params: { task: `eq.${task}`, status: "in.(succeeded,failed)", order: "finished_at.desc,id.desc", limit: "6" },
      }),
    ]);
    concurrency = evaluateIngestionConcurrency(runningRows, { task });
    circuitBreaker = evaluateIngestionCircuitBreaker(historyRows);
  } catch {
    durableRunStore = false;
  }
  try { before = await productionCounts(); } catch { before = null; }

  const approval = readManualApproval(options["event-path"]);
  const decision = evaluateIngestionExecutionSafety({
    event_name: options["event-name"], ref: options.ref, head_sha: options["head-sha"],
    origin_main_sha: options["origin-main-sha"], task, mode: options.mode,
    schedule: options.schedule, source_scope: options["source-scope"],
    execute_sources: options["execute-sources"],
    automatic_write_enabled: options["automatic-write-enabled"], manual_write_approval: approval,
    concurrency, circuit_breaker: circuitBreaker, durable_run_store: durableRunStore,
    production_snapshot: Boolean(before),
  });
  const report = buildReport(decision, { before });
  writeReport(outputDir, report);
  writeOutput("allowed", decision.ok);
  writeOutput("reason_code", decision.reason_code ?? "none");
  writeOutput("execution_type", decision.execution_type);
  writeOutput("report_generated", true);
  console.log(JSON.stringify({ ok: decision.ok, decision: decision.decision, reason_code: decision.reason_code, database_writes: 0 }));
}

async function snapshot() {
  const output = path.resolve(required(options.output, "--output"));
  const counts = await productionCounts();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, count_keys: Object.keys(counts), database_writes: 0 }));
}

async function finalize() {
  const outputDir = path.resolve(required(options["output-dir"], "--output-dir"));
  const existing = readJson(path.join(outputDir, "ingestion-run-report.json"));
  if (!existing.preflight.ok) {
    writeReport(outputDir, existing);
    writeOutput("final_status", "blocked");
    writeOutput("final_ok", false);
    writeOutput("database_writes", 0);
    console.log(JSON.stringify({ ok: false, status: "blocked", database_writes: 0 }));
    return;
  }
  const before = options.before ? readJsonSafe(path.resolve(options.before)) : existing.database.before;
  const after = options.after ? readJsonSafe(path.resolve(options.after)) : null;
  let validation = { deltas: {}, unexpected_table_deltas: [], negative_table_deltas: [], database_writes: 0, ok: false };
  let status = "failed";
  let errorCategory = options["error-category"] || "verification";
  let failedStep = options["failed-step"] || "finalize";
  try {
    validation = validateTaskDeltas(existing.execution.task, before, after);
    const cleanupFailed = String(options["cleanup-outcome"] || "").split(":").includes("failure");
    if (options["ingestion-outcome"] === "success" && !cleanupFailed && validation.ok) {
      status = "succeeded";
      errorCategory = null;
      failedStep = null;
    }
  } catch {
    errorCategory = "verification";
  }
  const report = buildSanitizedIngestionRunReport({
    ...existing,
    generated_at: new Date().toISOString(),
    database: { before, after, ...validation },
    result: {
      status,
      started_ingestion: options["ingestion-started"] === "true",
      completed_ingestion: options["ingestion-outcome"] === "success" && !String(options["cleanup-outcome"] || "").split(":").includes("failure"),
      failed_step: failedStep,
      error_category: errorCategory,
      error_message: options["error-message"],
      durable_run_log_failure: options["durable-log-failure"] === "true",
    },
    database_writes: validation.database_writes,
  });
  writeReport(outputDir, report);
  writeOutput("final_status", status);
  writeOutput("final_ok", status === "succeeded");
  writeOutput("database_writes", report.database_writes);
  console.log(JSON.stringify({ ok: status === "succeeded", status, database_writes: report.database_writes }));
}

async function finalizeReadOnly() {
  const outputDir = path.resolve(required(options["output-dir"], "--output-dir"));
  const existing = readJson(path.join(outputDir, "ingestion-run-report.json"));
  const after = options.after ? readJsonSafe(path.resolve(options.after)) : null;
  const report = finalizeReadOnlyIngestionRunReport({
    report: existing,
    after_snapshot: after,
    origin_main_sha: options["origin-main-sha"],
  });
  const finalOk = report.result.status === "succeeded";
  const zeroDeltaVerified = finalOk
    && Object.keys(report.database.deltas).length === 9
    && Object.values(report.database.deltas).every((delta) => delta === 0);
  writeReport(outputDir, report);
  writeOutput("final_status", report.result.status);
  writeOutput("final_ok", finalOk);
  writeOutput("database_writes", report.database_writes);
  writeOutput("zero_delta_verified", zeroDeltaVerified);
  console.log(JSON.stringify({ ok: finalOk, status: report.result.status, database_writes: report.database_writes, zero_delta_verified: zeroDeltaVerified }));
}

function scan() {
  const directory = path.resolve(required(options.directory, "--directory"));
  const files = listFiles(directory).map((file) => ({ name: path.relative(directory, file), text: fs.readFileSync(file, "utf8") }));
  if (!files.length) throw new Error("Ingestion report directory is empty.");
  const secretValues = Object.entries(process.env)
    .filter(([name]) => /(?:KEY|TOKEN|SECRET|PASSWORD|APPLICATION_ID|AFFILIATE_ID)$/i.test(name))
    .map(([, value]) => value).filter(Boolean);
  const findings = findIngestionRunReportSecretLeaks(files, secretValues);
  if (findings.length) throw new Error(`Ingestion report secret scan failed for ${findings.length} file(s).`);
  console.log(JSON.stringify({ ok: true, files_scanned: files.length, secret_findings: 0 }));
}

async function productionCounts() {
  const values = await Promise.all([
    ...TABLES.map((table) => fetchRowCount(table)),
    fetchRowCount("market_listings", { review_required: "eq.true" }),
  ]);
  return Object.fromEntries([...TABLES, "review_required"].map((key, index) => [key, values[index]]));
}

function buildReport(decision, database = {}) {
  return buildSanitizedIngestionRunReport({
    workflow: { run_id: process.env.GITHUB_RUN_ID || options["run-id"] || "0", run_attempt: process.env.GITHUB_RUN_ATTEMPT || "1", head_sha: options["head-sha"], origin_main_sha: options["origin-main-sha"], event_name: options["event-name"], ref: options.ref },
    execution: { task: decision.task, mode: decision.mode, execution_type: decision.execution_type, source_scope: options["source-scope"] || null, execute_sources: options["execute-sources"] === "true", schedule: options.schedule || null, automatic_write_enabled: decision.automatic_write_enabled, manual_approval_valid: decision.manual_approval_valid },
    preflight: decision,
    database,
    result: { status: decision.ok ? "allowed" : "blocked", started_ingestion: false, completed_ingestion: false, cleanup_started: false, failed_step: decision.ok ? null : "preflight", error_category: decision.ok ? null : "safety_gate" },
    database_writes: 0,
  });
}

function writeReport(outputDir, report) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "ingestion-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "ingestion-run-report.md"), `${renderIngestionRunReportMarkdown(report)}\n`, "utf8");
}

function readManualApproval(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return "";
  try { return String(readJson(eventPath)?.inputs?.production_write_approval ?? "").trim(); } catch { return ""; }
}

function parseOptions(args) {
  return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}
function required(value, label) { if (!value) throw new Error(`${label} is required.`); return value; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function readJsonSafe(file) { try { return readJson(file); } catch { return null; } }
function listFiles(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => { const value = path.join(directory, entry.name); return entry.isDirectory() ? listFiles(value) : [value]; }).sort(); }
function writeOutput(key, value) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); }
