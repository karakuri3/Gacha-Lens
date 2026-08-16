import fs from "node:fs";
import path from "node:path";
import {
  buildAutomaticMarketRolloutPlan,
  buildGithubThrottleHistoryRows,
  buildSanitizedRolloutReport,
  collectAutomaticIngestionSecretValues,
  evaluateAutomaticIngestionRollout,
  findAutomaticIngestionRolloutSecretLeaks,
  loadAutomaticIngestionRolloutPolicy,
  renderAutomaticIngestionShadowReportMarkdown,
  renderAutomaticMarketRolloutPlanMarkdown,
} from "../lib/domain/automatic-ingestion-rollout.js";
import {
  bindMarketBoundedPlanIdentity,
  buildMarketBoundedResult,
  buildMarketBoundedRows,
  calculateMarketAuditDigest,
  planMarketBoundedOperations,
  renderMarketBoundedResultMarkdown,
  validateMarketBoundedPlanIdentity,
} from "../lib/domain/market-bounded-write.js";
import {
  evaluateIngestionCircuitBreaker,
  evaluateIngestionConcurrency,
} from "../lib/domain/ingestion-execution-safety.js";
import {
  readAutomaticDurableRunStore,
  readAutomaticProductionSnapshot,
} from "./automatic-ingestion-preflight-store.mjs";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { fetchRows } from "./supabase-rest.mjs";

loadOptionalEnvFile();

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));
const policyPath = path.resolve(options.policy || "config/automatic-ingestion-rollout-policy.json");

if (command === "preflight") await preflight();
else if (command === "plan") await plan();
else if (command === "preview") await preview();
else if (command === "scan") scan();
else throw new Error("Expected command: preflight, plan, preview, or scan.");

async function preflight() {
  const outputDir = outputDirectory();
  fs.mkdirSync(outputDir, { recursive: true });
  const { policy, digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
  const task = options.task || "market";
  const stage = options.stage || "";
  const durableRunStore = await readAutomaticDurableRunStore({
    task,
    stage,
    maxRunsPer24Hours: policy.stages?.[stage]?.max_runs_per_24_hours,
  });
  const productionSnapshot = await readAutomaticProductionSnapshot();
  const runningRows = durableRunStore.running_rows;
  const historyRows = durableRunStore.circuit_history_rows;
  const rolloutHistoryRows = durableRunStore.rollout_history_rows;
  const counts = productionSnapshot.counts;
  const githubRows = await fetchGithubRolloutRows(stage, task);
  const concurrency = evaluateIngestionConcurrency(runningRows, { task });
  const circuitBreaker = evaluateIngestionCircuitBreaker(historyRows);
  const mainVerified = /^[0-9a-f]{40}$/.test(options["head-sha"] || "")
    && options["head-sha"] === options["origin-main-sha"];
  const simulation = options.simulation === "true";
  let decision = evaluateAutomaticIngestionRollout({
    policy,
    policy_digest: digest,
    configured_policy_digest: simulation && stage === "market-bounded" ? digest : options["configured-policy-digest"],
    stage,
    task,
    schedule: options.schedule,
    event_name: options["event-name"],
    automatic_write_enabled: options["automatic-write-enabled"],
    bounded_persistence_enabled: options["bounded-persistence-enabled"] ?? process.env.AUTOMATIC_INGESTION_BOUNDED_PERSISTENCE_ENABLED,
    bounded_approval: options["bounded-approval"] ?? process.env.AUTOMATIC_INGESTION_BOUNDED_APPROVAL,
    head_sha: options["head-sha"],
    history_rows: rolloutHistoryRows,
    running_rows: runningRows,
    github_rows: githubRows,
    concurrency,
    circuit_breaker: circuitBreaker,
    durable_run_store_available: durableRunStore.available,
    production_snapshot_available: productionSnapshot.available,
    simulation,
    prediction_only: simulation,
  });
  if (!mainVerified) decision = {
    ...decision,
    ok: false,
    decision: "blocked",
    action: "blocked",
    reason_code: "rollout_plan_incomplete",
    persistence_authorized: false,
    expected_noop: false,
    expected_noop_reason: null,
  };
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    workflow: workflowIdentity(),
    stage: decision.stage,
    policy_digest: digest,
    task,
    schedule: options.schedule || null,
    main_sha_verified: mainVerified,
    decision: decision.decision,
    reason_code: decision.reason_code,
    action: decision.action,
    contract: decision.contract,
    throttle: decision.throttle,
    concurrency,
    circuit_breaker: circuitBreaker,
    durable_run_store: durableRunStore.report,
    github_metadata: { available: githubRows !== null, completed_shadow_artifacts_checked: githubRows?.length ?? 0 },
    production_snapshot: productionSnapshot,
    automatic_write_enabled: String(options["automatic-write-enabled"]) === "true",
    bounded_persistence_enabled: decision.bounded_persistence_enabled === true,
    bounded_approval_valid: decision.bounded_approval_valid === true,
    persistence_authorized: decision.persistence_authorized === true,
    expected_noop: decision.expected_noop === true,
    expected_noop_reason: decision.expected_noop_reason ?? null,
    ingestion_started: false,
    cleanup_started: false,
    database_writes: 0,
  };
  writeJson(path.join(outputDir, "ingestion-rollout-preflight.json"), report);
  fs.writeFileSync(path.join(outputDir, "ingestion-rollout-preflight.md"), renderPreflightMarkdown(report), "utf8");
  writeOutput("allowed", decision.ok);
  writeOutput("action", decision.action);
  writeOutput("stage", decision.stage);
  writeOutput("reason_code", decision.reason_code ?? "none");
  writeOutput("policy_digest", digest);
  writeOutput("main_sha_verified", mainVerified);
  writeOutput("mode", decision.contract?.mode ?? "blocked");
  writeOutput("limit", decision.contract?.limit ?? 0);
  writeOutput("priority", decision.contract?.priority ?? "none");
  writeOutput("release", decision.contract?.release ?? "none");
  writeOutput("source_scope", decision.contract?.source_scope ?? "none");
  writeOutput("execute_sources", decision.contract?.execute_sources === true);
  writeOutput("bounded_persistence_enabled", decision.bounded_persistence_enabled === true);
  writeOutput("bounded_approval_valid", decision.bounded_approval_valid === true);
  writeOutput("persistence_authorized", decision.persistence_authorized === true);
  writeOutput("expected_noop", decision.expected_noop === true);
  writeOutput("expected_noop_reason", decision.expected_noop_reason ?? "none");
  writeOutput("report_generated", true);
  console.log(JSON.stringify({ ok: decision.ok, stage: decision.stage, action: decision.action, reason_code: decision.reason_code, database_writes: 0 }));
}

async function plan() {
  const outputDir = outputDirectory();
  fs.mkdirSync(outputDir, { recursive: true });
  const preflightReport = readJson(required(options.preflight, "--preflight"));
  if (preflightReport.decision !== "allowed" || !["shadow", "bounded-plan"].includes(preflightReport.action)) {
    throw new Error("Rollout preflight did not authorize prediction planning.");
  }
  const auditPath = required(options.audit, "--audit");
  const auditBytes = fs.readFileSync(auditPath);
  const audit = JSON.parse(auditBytes.toString("utf8"));
  const { policy, digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
  if (digest !== preflightReport.policy_digest) throw new Error("Rollout policy changed after preflight.");
  let rolloutPlan;
  try {
    rolloutPlan = bindMarketBoundedPlanIdentity(buildAutomaticMarketRolloutPlan({
      policy,
      policy_digest: digest,
      stage: preflightReport.stage,
      audit,
      source_run_id: audit.workflow?.run_id || process.env.GITHUB_RUN_ID,
      head_sha: preflightReport.workflow?.head_sha,
      throttle: preflightReport.throttle,
    }), { audit_digest: calculateMarketAuditDigest(auditBytes) });
  } catch (error) {
    if (error?.plan) {
      writePlanFiles(outputDir, error.plan);
      writeOutput("plan_generated", false);
      writeOutput("budget_state", error.plan.budget_checks?.state ?? "exceeded");
      writeOutput("auto_eligible_count", error.plan.auto_eligible_count ?? 0);
      writeOutput("database_writes", 0);
    }
    throw error;
  }
  const after = await productionCounts();
  assertCountsUnchanged(preflightReport.production_snapshot?.counts, after);
  const report = buildSanitizedRolloutReport({
    plan: rolloutPlan,
    run_id: process.env.GITHUB_RUN_ID || preflightReport.workflow?.run_id,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || preflightReport.workflow?.run_attempt,
    event_name: preflightReport.workflow?.event_name,
    ref: preflightReport.workflow?.ref,
    schedule: preflightReport.schedule,
    main_sha_verified: preflightReport.main_sha_verified,
    request_diagnostics: audit.request_diagnostics,
  });
  writePlanFiles(outputDir, rolloutPlan);
  writeJson(path.join(outputDir, "ingestion-shadow-report.json"), report);
  fs.writeFileSync(path.join(outputDir, "ingestion-shadow-report.md"), `${renderAutomaticIngestionShadowReportMarkdown(report)}\n`, "utf8");
  writeOutput("plan_generated", true);
  writeOutput("budget_state", rolloutPlan.budget_checks.state);
  writeOutput("auto_eligible_count", rolloutPlan.auto_eligible_count);
  writeOutput("database_writes", 0);
  console.log(JSON.stringify({ ok: true, stage: rolloutPlan.stage, auto_eligible_count: rolloutPlan.auto_eligible_count, budget_state: rolloutPlan.budget_checks.state, database_writes: 0 }));
}

async function preview() {
  const outputDir = outputDirectory();
  fs.mkdirSync(outputDir, { recursive: true });
  const workflow = workflowIdentity();
  let planValue = null;
  let rows = { candidates: [], listingRows: [], observationRows: [] };
  let operations = { listings: [], observations: [] };
  const checks = {
    audit_digest_verified: false,
    plan_digest_verified: false,
    candidate_set_verified: false,
    row_identity_verified: false,
    idempotency_preflight_verified: false,
  };
  try {
    const auditPath = required(options.audit, "--audit");
    const auditBytes = fs.readFileSync(auditPath);
    const audit = JSON.parse(auditBytes.toString("utf8"));
    planValue = readJson(required(options.plan, "--plan"));
    const preflightReport = readJson(required(options.preflight, "--preflight"));
    const { digest } = loadAutomaticIngestionRolloutPolicy(policyPath);
    validateMarketBoundedPlanIdentity({
      audit_bytes: auditBytes,
      audit,
      plan: planValue,
      workflow,
      policy_digest: digest,
      simulation: options.simulation === "true",
    });
    checks.audit_digest_verified = true;
    checks.plan_digest_verified = true;
    rows = buildMarketBoundedRows({ audit, plan: planValue, workflow, observed_at: planValue.generated_at });
    checks.candidate_set_verified = true;
    const [existingListings, existingObservations] = await Promise.all([
      fetchRowsByIds("market_listings", rows.listingRows.map((row) => row.id)),
      fetchRowsByIds("market_listing_observations", rows.observationRows.map((row) => row.id)),
    ]);
    operations = planMarketBoundedOperations({
      listingRows: rows.listingRows,
      observationRows: rows.observationRows,
      existingListings,
      existingObservations,
    });
    checks.row_identity_verified = true;
    checks.idempotency_preflight_verified = true;
    const after = await productionCounts();
    assertCountsUnchanged(preflightReport.production_snapshot?.counts, after);
    const result = buildMarketBoundedResult({
      workflow,
      plan: planValue,
      rows,
      operations,
      status: rows.candidates.length ? "blocked" : "no-op",
      reason_code: rows.candidates.length ? "bounded_persistence_not_enabled" : null,
      bounded_persistence_enabled: false,
      bounded_approval_valid: false,
      database_writes: 0,
    });
    writePreviewArtifacts(outputDir, buildPreviewValue({ workflow, rows, result, checks, previewGenerated: true }), result);
    writeOutput("preview_report_generated", true);
    writeOutput("preview_generated", true);
    writeOutput("database_writes", 0);
  } catch (error) {
    const reasonCode = error?.reason_code || "bounded_verification_failed";
    const errorCategory = error?.category || "unknown";
    const result = buildMarketBoundedResult({
      workflow,
      plan: planValue,
      rows,
      operations,
      status: "failed",
      reason_code: reasonCode,
      error_category: errorCategory,
      error_message: reasonCode,
      identity_diagnostic: error?.identity_diagnostic,
      bounded_persistence_enabled: false,
      bounded_approval_valid: false,
      database_writes: 0,
    });
    writePreviewArtifacts(outputDir, buildPreviewValue({ workflow, rows, result, checks, previewGenerated: false }), result);
    writeOutput("preview_report_generated", true);
    writeOutput("preview_generated", false);
    writeOutput("reason_code", result.result.reason_code);
    writeOutput("error_category", result.result.error_category);
    writeOutput("database_writes", 0);
    console.error(`Bounded persistence preview failed closed: ${result.result.reason_code} (${result.result.error_category}).`);
    process.exitCode = 1;
  }
}

function buildPreviewValue({ workflow, rows, result, checks, previewGenerated }) {
  return {
    schema_version: 1,
    workflow,
    preview_report_generated: true,
    preview_generated: previewGenerated,
    persistence_preview_generated: previewGenerated,
    status: previewGenerated ? "complete" : "failed",
    reason_code: result.result.reason_code,
    error_category: result.result.error_category,
    identity_diagnostic: result.identity_diagnostic,
    listing_rows_previewed: rows.listingRows.length,
    observation_rows_previewed: rows.observationRows.length,
    operations: result.operations,
    ...checks,
    bounded_persistence_started: false,
    database_writes: 0,
  };
}

function writePreviewArtifacts(outputDir, previewValue, result) {
  writeJson(path.join(outputDir, "market-bounded-persistence-preview.json"), previewValue);
  fs.writeFileSync(path.join(outputDir, "market-bounded-persistence-preview.md"), renderPreviewMarkdown(previewValue), "utf8");
  writeJson(path.join(outputDir, "market-bounded-result.json"), result);
  fs.writeFileSync(path.join(outputDir, "market-bounded-result.md"), renderMarketBoundedResultMarkdown(result), "utf8");
}

function scan() {
  const directories = required(options.directories, "--directories").split(",").map((entry) => path.resolve(entry));
  const files = directories.flatMap(listFiles).map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") }));
  if (!files.length) throw new Error("Rollout report files are missing.");
  const secretValues = collectAutomaticIngestionSecretValues(process.env);
  const findings = findAutomaticIngestionRolloutSecretLeaks(files, secretValues);
  if (findings.length) throw new Error(`Rollout report secret scan failed for ${findings.length} file(s).`);
  console.log(JSON.stringify({ ok: true, files_scanned: files.length, secret_findings: 0 }));
}

async function productionCounts() {
  const snapshot = await readAutomaticProductionSnapshot();
  if (!snapshot.available || !snapshot.counts) throw new Error("Production snapshot is unavailable.");
  return snapshot.counts;
}

async function fetchRowsByIds(table, ids) {
  if (!ids.length) return [];
  return fetchRows(table, {
    select: "*",
    pageSize: Math.max(2, ids.length),
    params: { id: `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`, order: "id.asc" },
  });
}

async function fetchGithubRolloutRows(stage, task) {
  if (stage === "market-bounded" && task === "market") return [];
  if (stage !== "market-shadow" || task !== "market") return [];
  const token = process.env.GH_READ_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts?per_page=100`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error("GitHub artifact metadata unavailable.");
    const payload = await response.json();
    return buildGithubThrottleHistoryRows(payload.artifacts ?? [], { stage, task });
  } catch {
    return null;
  }
}

function writePlanFiles(outputDir, rolloutPlan) {
  writeJson(path.join(outputDir, "market-bounded-write-plan.json"), rolloutPlan);
  fs.writeFileSync(path.join(outputDir, "market-bounded-write-plan.md"), `${renderAutomaticMarketRolloutPlanMarkdown(rolloutPlan)}\n`, "utf8");
}

function assertCountsUnchanged(before, after) {
  if (!before || !after) throw new Error("Production count comparison is unavailable.");
  const changed = Object.keys(before).filter((key) => Number(before[key]) !== Number(after[key]));
  if (changed.length) throw new Error("Production counts changed during rollout prediction.");
}

function workflowIdentity() {
  return {
    run_id: process.env.GITHUB_RUN_ID || options["run-id"] || "0",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || options["run-attempt"] || "1",
    head_sha: String(process.env.GITHUB_SHA || options["head-sha"] || "").toLowerCase(),
    event_name: process.env.GITHUB_EVENT_NAME || options["event-name"] || "workflow_dispatch",
    ref: process.env.GITHUB_REF || options.ref || "refs/heads/main",
  };
}

function renderPreflightMarkdown(report) {
  return [
    "# Automatic ingestion rollout preflight",
    "",
    `- Run: ${report.workflow.run_id}`,
    `- Stage: ${report.stage}`,
    `- Policy digest: ${report.policy_digest}`,
    `- Task: ${report.task}`,
    `- Decision: ${report.decision}`,
    `- Reason code: ${report.reason_code ?? "none"}`,
    `- Main SHA verified: ${report.main_sha_verified}`,
    `- Throttle: ${report.throttle?.state ?? "unavailable"}`,
    `- Expected no-op: ${report.expected_noop === true}`,
    `- Expected no-op reason: ${report.expected_noop_reason ?? "none"}`,
    `- Durable run store: ${report.durable_run_store.available ? "available" : "unavailable"}`,
    `- Running rows complete: ${report.durable_run_store.running_rows.complete_for_decision}`,
    `- Circuit history complete: ${report.durable_run_store.completed_history.complete_for_decision}`,
    `- Production snapshot: ${report.production_snapshot.available ? "available" : "unavailable"}`,
    `- Snapshot request concurrency: ${report.production_snapshot.request_concurrency}`,
    ...renderReadDiagnostics("Durable store diagnostics", report.durable_run_store.diagnostics),
    ...renderReadDiagnostics("Snapshot diagnostics", report.production_snapshot.diagnostics),
    "- Ingestion started: false",
    "- Cleanup started: false",
    "- Production writes: 0",
    "",
  ].join("\n");
}

function renderReadDiagnostics(label, diagnostics = []) {
  if (!Array.isArray(diagnostics) || !diagnostics.length) return [`- ${label}: none`];
  return diagnostics.map((diagnostic) => [
    `- ${label}: ${diagnostic.operation_name}`,
    `category=${diagnostic.category ?? "success"}`,
    `status=${diagnostic.status_code ?? "none"}`,
    `attempts=${diagnostic.attempt_count}`,
    `duration_ms=${diagnostic.duration_ms}`,
  ].join("; "));
}

function renderPreviewMarkdown(value) {
  return [
    "# Market bounded persistence preview",
    "",
    `- Status: ${value.status}`,
    `- Preview report generated: ${value.preview_report_generated}`,
    `- Preview generated: ${value.preview_generated}`,
    `- Reason code: ${value.reason_code ?? "none"}`,
    `- Error category: ${value.error_category ?? "none"}`,
    `- Identity conflict: ${value.identity_diagnostic?.conflict_field ?? "none"}`,
    `- Listing rows previewed: ${value.listing_rows_previewed}`,
    `- Observation rows previewed: ${value.observation_rows_previewed}`,
    `- Audit digest verified: ${value.audit_digest_verified}`,
    `- Plan digest verified: ${value.plan_digest_verified}`,
    `- Candidate set verified: ${value.candidate_set_verified}`,
    `- Row identity verified: ${value.row_identity_verified}`,
    `- Idempotency preflight verified: ${value.idempotency_preflight_verified}`,
    "- Bounded persistence started: false",
    "- Production writes: 0",
    "",
  ].join("\n");
}

function outputDirectory() {
  return path.resolve(required(options["output-dir"], "--output-dir"));
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(value) : [value];
  }).sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
}

function parseOptions(args) {
  return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
}
