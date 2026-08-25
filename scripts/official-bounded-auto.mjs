import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import {
  authorizeOfficialAutomaticWrite,
  buildOfficialAutoBlockedResult,
  buildOfficialAutoGateResult,
  buildOfficialAutoPreparedResult,
  executeOfficialAutomaticTransaction,
  findOfficialAutoLeaks,
  formatOfficialAutoResultMarkdown,
  resolveOfficialAutoGate,
  validateOfficialAutoResult,
} from "../lib/domain/official-bounded-auto.js";
import { requireOfficialDatabaseUrl } from "../lib/domain/official-bounded-write.js";
import { createOfficialPostgresTransactionAdapter } from "../lib/server/official-bounded-postgres.js";

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const rootDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const resultDirectory = path.join(rootDirectory, "result");
const auditDirectory = path.resolve(args["audit-dir"] || path.join(rootDirectory, "audit"));

if (command === "gate") await resolveGate();
else if (command === "prepare") await prepareWrite();
else if (command === "execute") await executeWrite();
else if (command === "scan") scanArtifact();
else if (command === "verify") verifyResult();
else throw scriptError("official_auto_command_invalid");

async function resolveGate() {
  const gate = resolveOfficialAutoGate({
    enabled: process.env.OFFICIAL_BOUNDED_AUTO_ENABLED,
    approval: process.env.OFFICIAL_BOUNDED_AUTO_APPROVAL,
    eventName: process.env.GITHUB_EVENT_NAME || args["event-name"],
    ref: process.env.GITHUB_REF || args.ref,
    headSha: process.env.GITHUB_SHA || args["head-sha"],
    originMainSha: args["origin-main-sha"],
  });
  writeResult(buildOfficialAutoGateResult({ workflow: workflowIdentity(), gate }));
  writeOutput("execute", gate.state === "enabled");
  writeOutput("gate_state", gate.state);
  if (gate.state === "blocked") throw scriptError(gate.reason_code);
}

async function prepareWrite() {
  const gate = enabledGate();
  try {
    const report = readJson(path.join(auditDirectory, "official-live-audit.json"));
    const authorization = authorizeOfficialAutomaticWrite({
      report,
      headSha: process.env.GITHUB_SHA || args["head-sha"],
      originMainSha: args["origin-main-sha"],
    });
    writeResult(buildOfficialAutoPreparedResult({ workflow: workflowIdentity(), gate, authorization }));
    writeOutput("execute", authorization.decision === "write");
    writeOutput("decision", authorization.decision);
  } catch (error) {
    writeResult(buildOfficialAutoBlockedResult({
      workflow: workflowIdentity(),
      gate,
      reasonCode: error?.reason_code || "official_auto_audit_or_plan_failed",
    }));
    writeOutput("execute", false);
    throw error;
  }
}

async function executeWrite() {
  const gate = enabledGate();
  let client = null;
  let authorization = null;
  let result;
  try {
    const report = readJson(path.join(auditDirectory, "official-live-audit.json"));
    authorization = authorizeOfficialAutomaticWrite({
      report,
      headSha: process.env.GITHUB_SHA || args["head-sha"],
      originMainSha: args["origin-main-sha"],
    });
    const connectionString = requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL);
    client = new Client({ connectionString, application_name: "gacha-official-bounded-auto" });
    await client.connect();
    result = await executeOfficialAutomaticTransaction({
      adapter: createOfficialPostgresTransactionAdapter(client),
      authorization,
      workflow: workflowIdentity(),
    });
  } catch (error) {
    result = buildOfficialAutoBlockedResult({
      workflow: workflowIdentity(),
      gate,
      reasonCode: error?.reason_code || "official_auto_execution_failed",
      authorization,
    });
  } finally {
    if (client) await client.end().catch(() => {});
  }
  writeResult(result);
  writeOutput("final_verdict", result.final_verdict);
  writeOutput("database_writes", result.database_writes);
  if (result.final_verdict !== "OFFICIAL_BOUNDED_AUTO_COMMITTED") {
    throw scriptError(result.decision?.reason_code || "official_auto_write_not_committed");
  }
}

function scanArtifact() {
  const files = listFiles(rootDirectory)
    .filter((file) => /\.json$|\.md$/i.test(file))
    .map((file) => ({ name: path.relative(rootDirectory, file).replaceAll("\\", "/"), text: fs.readFileSync(file, "utf8") }));
  if (!files.length) throw scriptError("official_auto_artifact_missing");
  const findings = findOfficialAutoLeaks(files);
  if (findings.length) throw scriptError("official_auto_secret_scan_failed");
  writeJson(path.join(resultDirectory, "official-bounded-auto-secret-scan.json"), {
    schema_version: 1,
    files_scanned: files.length,
    secret_findings: 0,
  });
  writeOutput("secret_findings", 0);
}

function verifyResult() {
  const result = validateOfficialAutoResult(readJson(resultFile()));
  const scan = readJson(path.join(resultDirectory, "official-bounded-auto-secret-scan.json"));
  const successful = [
    "OFFICIAL_BOUNDED_AUTO_DISABLED",
    "OFFICIAL_BOUNDED_AUTO_NO_CHANGES",
    "OFFICIAL_BOUNDED_AUTO_COMMITTED",
  ];
  if (!successful.includes(result.final_verdict) || Number(scan.secret_findings) !== 0
    || result.proposal.deletes !== 0 || result.actual_writes.deletes !== 0) {
    throw scriptError("official_auto_final_verification_failed");
  }
  console.log(JSON.stringify({
    ok: true,
    final_verdict: result.final_verdict,
    database_writes: result.database_writes,
    deletes: 0,
    secret_findings: 0,
  }));
}

function enabledGate() {
  return { state: "enabled", reason_code: null, approval_valid: true };
}

function workflowIdentity() {
  return {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: process.env.GITHUB_SHA || args["head-sha"],
    event_name: process.env.GITHUB_EVENT_NAME || args["event-name"],
  };
}

function writeResult(result) {
  fs.mkdirSync(resultDirectory, { recursive: true });
  writeJson(resultFile(), result);
  fs.writeFileSync(
    path.join(resultDirectory, "official-bounded-auto-result.md"),
    `${formatOfficialAutoResultMarkdown(result)}\n`,
    "utf8",
  );
}

function resultFile() {
  return path.join(resultDirectory, "official-bounded-auto-result.json");
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  }).sort((left, right) => left.localeCompare(right, "en"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
}

function parseArgs(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...parts] = value.slice(2).split("=");
      return [key, parts.join("=")];
    }));
}

function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw scriptError(`missing_${label.replace(/^--/, "").toLowerCase()}`);
  return normalized;
}

function scriptError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
