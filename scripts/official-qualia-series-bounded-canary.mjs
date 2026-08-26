import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { createOfficialQualiaSeriesPostgresTransactionAdapter } from "../lib/server/official-qualia-series-postgres.js";
import {
  findOfficialBoundedLeaks,
  requireOfficialDatabaseUrl,
  validateOfficialBoundedResult,
} from "../lib/domain/official-bounded-write.js";
import {
  authorizeOfficialQualiaSeriesCanary,
  buildOfficialQualiaSeriesCanaryReadyResult,
  executeOfficialQualiaSeriesCanaryTransaction,
  finalizeOfficialQualiaSeriesCanaryTerminalResult,
  formatOfficialQualiaSeriesCanaryMarkdown,
} from "../lib/domain/official-qualia-series-canary.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
if (command === "authorize") authorize();
else if (command === "execute") await execute();
else if (command === "finalize") finalize();
else if (command === "scan") scan();
else if (command === "verify") verify();
else throw new Error("Expected authorize, execute, finalize, scan, or verify command.");

function authorize() {
  try {
    const authorization = resolveAuthorization();
    writeResult(buildOfficialQualiaSeriesCanaryReadyResult({ authorization, workflow: workflowIdentity() }));
    writeOutput("authorized", "true");
  } catch (error) {
    writeResult(finalizeOfficialQualiaSeriesCanaryTerminalResult({
      workflow: workflowIdentity(),
      auditRunId: args["audit-run-id"],
      auditDigest: process.env.QUALIA_SERIES_CANARY_AUDIT_DIGEST,
      reasonCode: error?.reason_code || "qualia_series_canary_authorization_failed",
    }));
    writeOutput("authorized", "false");
    throw error;
  }
}

async function execute() {
  const workflow = workflowIdentity();
  let client;
  let result;
  try {
    // Authorization intentionally completes before the write-capable connection exists.
    const authorization = resolveAuthorization();
    client = new Client({
      connectionString: requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL),
      application_name: "gacha-official-qualia-series-bounded-canary",
    });
    await client.connect();
    result = await executeOfficialQualiaSeriesCanaryTransaction({
      adapter: createOfficialQualiaSeriesPostgresTransactionAdapter(client),
      authorization,
      workflow,
    });
  } catch (error) {
    result = finalizeOfficialQualiaSeriesCanaryTerminalResult({
      existing: readResultIfPresent(),
      workflow,
      auditRunId: args["audit-run-id"],
      auditDigest: process.env.QUALIA_SERIES_CANARY_AUDIT_DIGEST,
      reasonCode: error?.reason_code || "qualia_series_canary_execution_failed",
    });
  } finally {
    if (client) await client.end().catch(() => {});
  }
  writeResult(result);
  writeOutput("final_verdict", result.final_verdict);
  writeOutput("database_writes", String(result.database_writes || 0));
  if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED") throw codedError(result.reason_code || "qualia_series_canary_not_committed");
}

function finalize() {
  const existing = readResultIfPresent();
  const result = finalizeOfficialQualiaSeriesCanaryTerminalResult({
    existing,
    workflow: workflowIdentity(),
    auditRunId: args["audit-run-id"],
    auditDigest: process.env.QUALIA_SERIES_CANARY_AUDIT_DIGEST || args["audit-digest"],
    reasonCode: args["reason-code"],
  });
  writeResult(result);
}

function scan() {
  const files = listFiles(outputDirectory)
    .filter((file) => /\.(?:json|md)$/i.test(file))
    .map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") }));
  const explicitValues = [
    process.env.SUPABASE_DB_URL,
    process.env.QUALIA_SERIES_CANARY_APPROVAL,
    process.env.GITHUB_TOKEN,
  ];
  if (!files.length || findOfficialBoundedLeaks(files, explicitValues).length) throw codedError("qualia_series_canary_secret_scan_failed");
  writeJson(path.join(outputDirectory, "official-qualia-series-canary-secret-scan.json"), { schema_version: 1, secret_findings: 0 });
}

function verify() {
  const result = validateOfficialBoundedResult(readResult());
  const scanResult = readJson(path.join(outputDirectory, "official-qualia-series-canary-secret-scan.json"));
  const delta = result.production_counts?.delta;
  if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED"
    || result.provider !== "qualia" || result.series_only !== true
    || result.operations?.series !== 1 || result.operations?.variants !== 0 || result.operations?.restock_events !== 0
    || result.database_writes !== 1 || result.variant_writes !== 0 || result.import_issue_writes !== 0
    || result.deletes !== 0 || result.cleanup_operations !== 0
    || delta?.series !== 1 || ["variants", "restock_events", "import_issues", "review_required", "provisional_variants"].some((key) => delta?.[key] !== 0)
    || scanResult.secret_findings !== 0) {
    throw codedError("qualia_series_canary_final_verification_failed");
  }
}

function resolveAuthorization() {
  return authorizeOfficialQualiaSeriesCanary({
    report: loadAudit(),
    auditRunId: args["audit-run-id"],
    auditDigest: process.env.QUALIA_SERIES_CANARY_AUDIT_DIGEST,
    approval: process.env.QUALIA_SERIES_CANARY_APPROVAL,
    eventName: process.env.GITHUB_EVENT_NAME,
    headSha: workflowIdentity().head_sha,
    originMainSha: args["origin-main-sha"],
  });
}

function loadAudit() {
  return readJson(path.join(path.resolve(required(args["audit-dir"], "--audit-dir")), "official-qualia-series-readiness-audit.json"));
}

function workflowIdentity() {
  return { run_id: process.env.GITHUB_RUN_ID || args["run-id"], head_sha: sha(process.env.GITHUB_SHA || args["head-sha"]) };
}

function writeResult(result) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeJson(resultPath(), result);
  fs.writeFileSync(path.join(outputDirectory, "official-qualia-series-canary-result.md"), `${formatOfficialQualiaSeriesCanaryMarkdown(result)}\n`, "utf8");
}

function resultPath() {
  return path.join(outputDirectory, "official-qualia-series-canary-result.json");
}

function readResult() {
  return readJson(resultPath());
}

function readResultIfPresent() {
  return fs.existsSync(resultPath()) ? readResult() : null;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
}

function parseArgs(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => {
    const [key, ...parts] = value.slice(2).split("=");
    return [key, parts.join("=")];
  }));
}

function required(value, label) {
  if (!text(value)) throw codedError(`missing_${label.replace(/^--/, "")}`);
  return text(value);
}

function sha(value) {
  const normalized = text(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function codedError(reason_code) {
  const error = new Error(reason_code);
  error.reason_code = reason_code;
  return error;
}
