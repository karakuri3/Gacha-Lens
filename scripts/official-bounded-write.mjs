import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import {
  authorizeOfficialBoundedWrite,
  buildOfficialBoundedBlockedResult,
  buildOfficialBoundedReadyResult,
  executeOfficialBoundedTransaction,
  findOfficialBoundedLeaks,
  formatOfficialBoundedResultMarkdown,
  requireOfficialDatabaseUrl,
  validateOfficialBoundedResult,
} from "../lib/domain/official-bounded-write.js";
import { createOfficialPostgresTransactionAdapter } from "../lib/server/official-bounded-postgres.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));

if (command === "metadata") await inspectArtifactMetadata();
else if (command === "authorize") authorizeDownloadedAudit();
else if (command === "execute") await executeWrite();
else if (command === "scan") scanResult();
else if (command === "verify") verifyResult();
else throw new Error("Expected metadata, authorize, execute, scan, or verify command.");

async function inspectArtifactMetadata() {
  const repository = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const token = required(process.env.GH_READ_TOKEN || process.env.GITHUB_TOKEN, "GH_READ_TOKEN");
  const auditRunId = numericId(required(args["audit-run-id"], "--audit-run-id"));
  const expectedName = `official-read-only-audit-${auditRunId}`;
  const [run, artifactPage] = await Promise.all([
    githubJson(`/repos/${repository}/actions/runs/${auditRunId}`, token),
    githubJson(`/repos/${repository}/actions/runs/${auditRunId}/artifacts?per_page=100`, token),
  ]);
  const artifacts = Array.isArray(artifactPage?.artifacts) ? artifactPage.artifacts : [];
  if (Number(artifactPage?.total_count) !== 1 || artifacts.length !== 1 || artifacts[0]?.name !== expectedName) {
    throw boundedScriptError("official_bounded_artifact_identity_invalid");
  }
  const artifact = artifacts[0];
  if (artifact.expired === true || run?.status !== "completed" || run?.conclusion !== "success"
    || run?.event !== "workflow_dispatch" || normalizedSha(run?.head_sha) !== normalizedSha(args["head-sha"])) {
    throw boundedScriptError("official_bounded_artifact_unavailable");
  }
  const report = {
    schema_version: 1,
    audit_run_id: auditRunId,
    artifact_id: String(artifact.id),
    artifact_name: expectedName,
    expired: false,
    run_status: "completed",
    run_conclusion: "success",
    head_sha: normalizedSha(run.head_sha),
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeJson(path.join(outputDirectory, "official-bounded-artifact-metadata.json"), report);
  writeOutput("artifact_name", expectedName);
}

function authorizeDownloadedAudit() {
  const workflow = workflowIdentity();
  fs.mkdirSync(outputDirectory, { recursive: true });
  try {
    const report = loadAudit();
    const authorization = authorize(report, workflow);
    const ready = buildOfficialBoundedReadyResult({ workflow, authorization });
    writeResultFiles("official-bounded-ready", ready);
    writeOutput("authorized", true);
    writeOutput("selected_series_id", authorization.candidate.series_id);
  } catch (error) {
    const blocked = buildOfficialBoundedBlockedResult({
      workflow,
      auditRunId: args["audit-run-id"],
      auditDigest: process.env.OFFICIAL_AUDIT_DIGEST,
      reasonCode: error?.reason_code || "official_bounded_authorization_failed",
    });
    writeResultFiles("official-bounded-result", blocked);
    writeOutput("authorized", false);
    throw error;
  }
}

async function executeWrite() {
  const workflow = workflowIdentity();
  const report = loadAudit();
  let result;
  let client = null;
  try {
    const authorization = authorize(report, workflow);
    const connectionString = requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL);
    client = new Client({ connectionString, application_name: "gacha-official-bounded-write" });
    await client.connect();
    result = await executeOfficialBoundedTransaction({
      adapter: createOfficialPostgresTransactionAdapter(client),
      authorization,
      workflow,
    });
  } catch (error) {
    result = buildOfficialBoundedBlockedResult({
      workflow,
      auditRunId: args["audit-run-id"],
      auditDigest: process.env.OFFICIAL_AUDIT_DIGEST,
      reasonCode: error?.reason_code || "official_bounded_execution_failed",
    });
  } finally {
    if (client) await client.end().catch(() => {});
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeResultFiles("official-bounded-result", result);
  writeOutput("result_generated", true);
  writeOutput("final_verdict", result.final_verdict);
  writeOutput("database_writes", result.database_writes);
  if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED") {
    throw boundedScriptError(result.reason_code || "official_bounded_write_not_committed");
  }
}

function scanResult() {
  const files = listFiles(outputDirectory)
    .filter((file) => /\.json$|\.md$/i.test(file))
    .map((file) => ({ name: path.basename(file), text: fs.readFileSync(file, "utf8") }));
  if (!files.length) throw boundedScriptError("official_bounded_result_artifact_missing");
  const leaks = findOfficialBoundedLeaks(files, [
    process.env.SUPABASE_DB_URL,
    process.env.OFFICIAL_BOUNDED_APPROVAL,
    process.env.GH_READ_TOKEN,
    process.env.GITHUB_TOKEN,
  ]);
  if (leaks.length) throw boundedScriptError("official_bounded_result_secret_scan_failed");
  const report = { schema_version: 1, files_scanned: files.length, secret_findings: 0 };
  writeJson(path.join(outputDirectory, "official-bounded-secret-scan.json"), report);
  writeOutput("secret_findings", 0);
}

function verifyResult() {
  const result = validateOfficialBoundedResult(readJson(path.join(outputDirectory, "official-bounded-result.json")));
  const scan = readJson(path.join(outputDirectory, "official-bounded-secret-scan.json"));
  if (result.final_verdict !== "OFFICIAL_BOUNDED_WRITE_COMMITTED"
    || result.transaction?.state !== "committed" || Number(scan.secret_findings) !== 0
    || result.deletes !== 0 || result.cleanup_operations !== 0) {
    throw boundedScriptError("official_bounded_final_verification_failed");
  }
  console.log(JSON.stringify({
    ok: true,
    final_verdict: result.final_verdict,
    database_writes: result.database_writes,
    deletes: 0,
    cleanup_operations: 0,
  }));
}

function authorize(report, workflow) {
  return authorizeOfficialBoundedWrite({
    report,
    auditRunId: args["audit-run-id"],
    auditDigest: process.env.OFFICIAL_AUDIT_DIGEST,
    approval: process.env.OFFICIAL_BOUNDED_APPROVAL,
    headSha: workflow.head_sha,
    originMainSha: normalizedSha(args["origin-main-sha"]),
  });
}

function loadAudit() {
  const auditDirectory = path.resolve(required(args["audit-dir"], "--audit-dir"));
  const names = fs.readdirSync(auditDirectory, { withFileTypes: true });
  if (names.some((entry) => entry.isDirectory())) throw boundedScriptError("official_bounded_artifact_contents_invalid");
  const files = names.map((entry) => entry.name).sort();
  if (JSON.stringify(files) !== JSON.stringify(["official-live-audit.json", "official-live-audit.md"])) {
    throw boundedScriptError("official_bounded_artifact_contents_invalid");
  }
  return readJson(path.join(auditDirectory, "official-live-audit.json"));
}

async function githubJson(endpoint, token) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw boundedScriptError("official_bounded_github_state_unavailable");
  return response.json();
}

function workflowIdentity() {
  return {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: normalizedSha(process.env.GITHUB_SHA || args["head-sha"]),
  };
}

function writeResultFiles(baseName, result) {
  writeJson(path.join(outputDirectory, `${baseName}.json`), result);
  fs.writeFileSync(path.join(outputDirectory, `${baseName}.md`), `${formatOfficialBoundedResultMarkdown(result)}\n`, "utf8");
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  }).sort((left, right) => left.localeCompare(right, "en"));
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
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...parts] = value.slice(2).split("=");
      return [key, parts.join("=")];
    }));
}

function required(value, label) {
  if (value == null || String(value).trim() === "") throw boundedScriptError(`missing_${label.replace(/^--/, "").toLowerCase()}`);
  return String(value).trim();
}

function numericId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw boundedScriptError("official_bounded_audit_run_invalid");
  return normalized;
}

function normalizedSha(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function boundedScriptError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
