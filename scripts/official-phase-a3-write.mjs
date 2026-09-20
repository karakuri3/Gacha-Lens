import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import {
  assertOfficialPhaseA3Expectation,
  buildOfficialPhaseA3Snapshot,
  validateOfficialPhaseA3Snapshot,
} from "../lib/domain/official-phase-a3.js";
import {
  authorizeOfficialPhaseA3Write,
  buildOfficialPhaseA3WriteResult,
  formatOfficialPhaseA3WriteResultMarkdown,
  validateOfficialPhaseA3WriteResult,
  verifyOfficialPhaseA3PostState,
} from "../lib/domain/official-phase-a3-write.js";
import {
  captureOfficialPhaseA3Counts,
  scanOfficialPhaseA3Residuals,
} from "./official-phase-a3-support.mjs";
import { executeOfficialPhaseA3VariantTransaction } from "../lib/server/official-phase-a3-postgres.js";
import { findOfficialBoundedLeaks, requireOfficialDatabaseUrl } from "../lib/domain/official-bounded-write.js";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));

if (command === "metadata") await inspectArtifactMetadata();
else if (command === "execute") await executeWrite();
else if (command === "ensure-result") ensureResult();
else if (command === "scan") scanResult();
else if (command === "verify") verifyResult();
else throw new Error("Expected metadata, execute, ensure-result, scan, or verify command.");

async function inspectArtifactMetadata() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  try {
    const repository = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
    const token = required(process.env.GH_READ_TOKEN || process.env.GITHUB_TOKEN, "GH_READ_TOKEN");
    const auditRunId = numericId(required(args["audit-run-id"], "--audit-run-id"));
    const expectedName = `gacha-official-phase-a3-main-preflight-${auditRunId}`;
    const [run, artifactPage] = await Promise.all([
      githubJson(`/repos/${repository}/actions/runs/${auditRunId}`, token),
      githubJson(`/repos/${repository}/actions/runs/${auditRunId}/artifacts?per_page=100`, token),
    ]);
    const artifacts = Array.isArray(artifactPage?.artifacts) ? artifactPage.artifacts : [];
    if (Number(artifactPage?.total_count) !== 1 || artifacts.length !== 1 || artifacts[0]?.name !== expectedName) {
      throw phaseA3WriteError("phase_a3_write_artifact_identity_invalid");
    }
    const artifact = artifacts[0];
    if (artifact.expired === true || run?.status !== "completed" || run?.conclusion !== "success"
      || run?.event !== "push" || run?.name !== "Gacha Official Phase A3 Main Read-Only Preflight"
      || normalizedSha(run?.head_sha) !== normalizedSha(args["head-sha"])) {
      throw phaseA3WriteError("phase_a3_write_artifact_unavailable");
    }
    writeJson(path.join(outputDirectory, "phase-a3-write-artifact-metadata.json"), {
      schema_version: 1,
      audit_run_id: auditRunId,
      artifact_id: String(artifact.id),
      artifact_name: expectedName,
      expired: false,
      run_status: "completed",
      run_conclusion: "success",
      run_event: "push",
      workflow_name: run.name,
      head_sha: normalizedSha(run.head_sha),
    });
    writeOutput("artifact_name", expectedName);
  } catch (error) {
    writeBlockedResult(error?.reason_code || "phase_a3_write_metadata_failed");
    throw error;
  }
}

async function executeWrite() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  let client = null;
  let authorization = null;
  let plan = null;
  let transaction = null;
  let directBefore = null;
  let directAfter = null;
  let postVerify = null;
  let connectionString = null;

  try {
    const report = loadAudit();
    const currentSha = currentHeadSha();
    authorization = authorizeOfficialPhaseA3Write({
      report,
      auditRunId: args["audit-run-id"],
      planDigest: process.env.PHASE_A3_PLAN_DIGEST,
      approval: process.env.PHASE_A3_WRITE_APPROVAL,
      headSha: currentSha,
      originMainSha: exactCurrentMainSha(),
    });

    const restBefore = await captureOfficialPhaseA3Counts();
    const rescan = await scanOfficialPhaseA3Residuals({ operationPrefix: "phase_a3_write_rescan" });
    const restAfter = await captureOfficialPhaseA3Counts();
    const rescanReport = validateOfficialPhaseA3Snapshot(buildOfficialPhaseA3Snapshot({
      classification: rescan.classification,
      plan: rescan.plan,
      scan: {
        detail_fetch_limit: rescan.detailFetchLimit,
        detail_fetched: rescan.fetched.detailFetched,
        known_priority_urls: rescan.knownPriorityUrls,
        held_shared_detailed_urls: rescan.heldSharedDetailedUrls,
        held_unsupported_provider_urls: rescan.heldUnsupportedProviderUrls,
        priority_scan_complete: rescan.priorityScanComplete,
        fetch_issues: rescan.fetched.issues?.length || 0,
      },
      databaseBefore: restBefore,
      databaseAfter: restAfter,
      workflow: { run_id: process.env.GITHUB_RUN_ID, head_sha: currentSha, event_name: "workflow_dispatch" },
    }));
    assertOfficialPhaseA3Expectation(rescanReport, authorization.expectation);
    plan = rescan.plan;

    if (!countsMatchAudit(restAfter, authorization.database)
      || Number(rescanReport.counts.known_undetailed) !== Number(authorization.expectation.known_undetailed)) {
      throw phaseA3WriteError("phase_a3_write_database_changed_since_audit");
    }

    if (exactCurrentMainSha() !== currentSha) {
      throw phaseA3WriteError("phase_a3_write_main_moved_before_transaction");
    }

    connectionString = requireOfficialDatabaseUrl(process.env.SUPABASE_DB_URL);
    client = new Client({ connectionString, application_name: "gacha-phase-a3-production-write" });
    await client.connect();

    directBefore = await captureDirectCounts(client);
    if (!countsMatchAudit(directBefore, authorization.database)
      || Number(directBefore.official_without_real) !== Number(authorization.expectation.known_undetailed)) {
      throw phaseA3WriteError("phase_a3_write_direct_database_precondition_drift");
    }

    transaction = await executeOfficialPhaseA3VariantTransaction({ client, plan });

    if (transaction.state === "committed" || transaction.state === "commit_outcome_unknown") {
      let verificationError = null;
      let verificationClient = null;
      try {
        verificationClient = new Client({
          connectionString,
          application_name: "gacha-phase-a3-post-verify",
        });
        await verificationClient.connect();
        directAfter = await captureDirectCounts(verificationClient);
        postVerify = await verifyDirectPostState(verificationClient, directBefore, directAfter, plan);
      } catch (error) {
        verificationError = error;
        postVerify = null;
      } finally {
        if (verificationClient) await verificationClient.end().catch(() => {});
      }

      if (transaction.state === "commit_outcome_unknown") {
        const result = buildOfficialPhaseA3WriteResult({
          workflow: workflowIdentity(),
          authorization,
          plan,
          transaction,
          before: directBefore,
          after: directAfter,
          postVerify,
          reasonCode: transaction.reason_code || verificationError?.reason_code || "phase_a3_commit_outcome_unknown",
          finalVerdict: "OFFICIAL_PHASE_A3_WRITE_COMMIT_OUTCOME_UNKNOWN",
        });
        writeResult(result);
        throw phaseA3WriteError("phase_a3_commit_outcome_unknown");
      }

      if (!verificationError && postVerify?.ok === true) {
        const result = buildOfficialPhaseA3WriteResult({
          workflow: workflowIdentity(),
          authorization,
          plan,
          transaction,
          before: directBefore,
          after: directAfter,
          postVerify,
          finalVerdict: "OFFICIAL_PHASE_A3_WRITE_COMMITTED",
        });
        writeResult(result);
        writeOutput("final_verdict", result.final_verdict);
        return;
      }

      const result = buildOfficialPhaseA3WriteResult({
        workflow: workflowIdentity(),
        authorization,
        plan,
        transaction: { ...transaction, state: "committed_post_verify_failed" },
        before: directBefore,
        after: directAfter,
        postVerify,
        reasonCode: verificationError?.reason_code || "phase_a3_write_post_verify_failed",
        finalVerdict: "OFFICIAL_PHASE_A3_WRITE_COMMITTED_POST_VERIFY_FAILED",
      });
      writeResult(result);
      throw verificationError || phaseA3WriteError("phase_a3_write_post_verify_failed");
    }

    const rollbackVerified = transaction.state === "rolled_back" && transaction.rollback_verified === true;
    const result = buildOfficialPhaseA3WriteResult({
      workflow: workflowIdentity(),
      authorization,
      plan,
      transaction,
      before: directBefore,
      after: directAfter,
      reasonCode: rollbackVerified
        ? (transaction.reason_code || "phase_a3_write_rolled_back")
        : "phase_a3_write_rollback_unverified",
      finalVerdict: rollbackVerified
        ? "OFFICIAL_PHASE_A3_WRITE_ROLLED_BACK"
        : "OFFICIAL_PHASE_A3_WRITE_BLOCKED",
    });
    writeResult(result);
    throw phaseA3WriteError(result.reason_code || "phase_a3_write_rolled_back");
  } catch (error) {
    if (!fs.existsSync(resultPath())) {
      writeResult(buildOfficialPhaseA3WriteResult({
        workflow: workflowIdentity(),
        authorization,
        plan,
        transaction,
        before: directBefore,
        after: directAfter,
        postVerify,
        reasonCode: error?.reason_code || "phase_a3_write_blocked",
        finalVerdict: "OFFICIAL_PHASE_A3_WRITE_BLOCKED",
      }));
    }
    throw error;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

function ensureResult() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (!fs.existsSync(resultPath())) writeBlockedResult("phase_a3_write_prerequisite_failed");
}

function scanResult() {
  const files = fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.json$|\.md$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, text: fs.readFileSync(path.join(outputDirectory, entry.name), "utf8") }));
  if (!files.length) throw phaseA3WriteError("phase_a3_write_result_artifact_missing");
  const leaks = findOfficialBoundedLeaks(files, [
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.PHASE_A3_WRITE_APPROVAL,
    process.env.GH_READ_TOKEN,
    process.env.GITHUB_TOKEN,
  ]);
  if (leaks.length) throw phaseA3WriteError("phase_a3_write_result_secret_scan_failed");
  writeJson(path.join(outputDirectory, "phase-a3-write-secret-scan.json"), {
    schema_version: 1,
    files_scanned: files.length,
    secret_findings: 0,
  });
}

function verifyResult() {
  const result = validateOfficialPhaseA3WriteResult(readJson(resultPath()));
  const scan = readJson(path.join(outputDirectory, "phase-a3-write-secret-scan.json"));
  if (result.final_verdict !== "OFFICIAL_PHASE_A3_WRITE_COMMITTED"
    || result.transaction?.state !== "committed"
    || result.post_verify?.ok !== true
    || Number(result.database?.writes) !== Number(result.plan?.target_variants)
    || Number(scan?.secret_findings) !== 0) {
    throw phaseA3WriteError("phase_a3_write_final_verification_failed");
  }
  console.log(JSON.stringify({
    ok: true,
    final_verdict: result.final_verdict,
    head_sha: result.head_sha,
    audit_run_id: result.audit_run_id,
    plan_digest: result.execution_plan_digest,
    target_series: result.plan.target_series,
    target_variants: result.plan.target_variants,
    database_writes: result.database.writes,
  }, null, 2));
}

async function verifyDirectPostState(client, before, after, plan) {
  const insertedIdCount = await countExistingValues(client, "id", plan.variant_rows.map((row) => row.id));
  const insertedSlugCount = await countExistingValues(client, "slug", plan.variant_rows.map((row) => row.slug));
  const targetDetailedCount = await countDetailedTargets(client, plan.targets.map((row) => row.series_id));
  return verifyOfficialPhaseA3PostState({
    before,
    after,
    plan,
    insertedIdCount,
    insertedSlugCount,
    targetDetailedCount,
  });
}

async function captureDirectCounts(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.series) AS series,
      (SELECT count(*)::int FROM public.variants) AS variants,
      (SELECT count(*)::int FROM public.variants WHERE variant_type = 'provisional') AS provisional_variants,
      (SELECT count(*)::int FROM public.restock_events) AS restock_events,
      (SELECT count(*)::int FROM public.import_issues) AS import_issues,
      (SELECT count(*)::int
        FROM public.series s
        WHERE s.official_url IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.variants v
            WHERE v.series_id = s.id AND v.variant_type IS DISTINCT FROM 'provisional'
          )
      ) AS official_without_real
  `);
  return normalizeCountRow(result.rows?.[0]);
}

async function countExistingValues(client, column, values) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1000) {
    const batch = values.slice(index, index + 1000);
    const query = column === "id"
      ? "SELECT count(*)::int AS n FROM public.variants WHERE id = ANY($1::text[])"
      : "SELECT count(*)::int AS n FROM public.variants WHERE slug = ANY($1::text[])";
    const result = await client.query(query, [batch]);
    total += Number(result.rows?.[0]?.n || 0);
  }
  return total;
}

async function countDetailedTargets(client, seriesIds) {
  let total = 0;
  for (let index = 0; index < seriesIds.length; index += 1000) {
    const batch = seriesIds.slice(index, index + 1000);
    const result = await client.query(
      "SELECT count(DISTINCT series_id)::int AS n FROM public.variants WHERE series_id = ANY($1::text[]) AND variant_type IS DISTINCT FROM 'provisional'",
      [batch],
    );
    total += Number(result.rows?.[0]?.n || 0);
  }
  return total;
}

function loadAudit() {
  const auditDirectory = path.resolve(required(args["audit-dir"], "--audit-dir"));
  const entries = fs.readdirSync(auditDirectory, { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory())) throw phaseA3WriteError("phase_a3_write_artifact_contents_invalid");
  const files = entries.map((entry) => entry.name).sort();
  const expected = ["official-phase-a3-preflight.json", "official-phase-a3-preflight.md"];
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    throw phaseA3WriteError("phase_a3_write_artifact_contents_invalid");
  }
  return readJson(path.join(auditDirectory, "official-phase-a3-preflight.json"));
}

function exactCurrentMainSha() {
  execFileSync("git", ["fetch", "--no-tags", "origin", "main", "--depth=1"], { stdio: "ignore" });
  return normalizedSha(execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }));
}

function currentHeadSha() {
  return normalizedSha(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }));
}

function countsMatchAudit(value, audit) {
  return ["series", "variants", "provisional_variants", "restock_events", "import_issues"]
    .every((key) => Number(value?.[key] || 0) === Number(audit?.[key] || 0));
}

function normalizeCountRow(row = {}) {
  return {
    series: Number(row.series || 0),
    variants: Number(row.variants || 0),
    provisional_variants: Number(row.provisional_variants || 0),
    restock_events: Number(row.restock_events || 0),
    import_issues: Number(row.import_issues || 0),
    official_without_real: Number(row.official_without_real || 0),
  };
}

function workflowIdentity() {
  return {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: currentHeadSha(),
  };
}

function writeBlockedResult(reasonCode) {
  writeResult(buildOfficialPhaseA3WriteResult({
    workflow: workflowIdentity(),
    reasonCode,
    finalVerdict: "OFFICIAL_PHASE_A3_WRITE_BLOCKED",
  }));
}

function writeResult(result) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  writeJson(resultPath(), result);
  fs.writeFileSync(
    path.join(outputDirectory, "official-phase-a3-write-result.md"),
    formatOfficialPhaseA3WriteResultMarkdown(result) + "\n",
    "utf8",
  );
}

function resultPath() {
  return path.join(outputDirectory, "official-phase-a3-write-result.json");
}

async function githubJson(endpoint, token) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw phaseA3WriteError("phase_a3_write_github_state_unavailable");
  return response.json();
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n", "utf8");
}

function parseArgs(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...parts] = value.slice(2).split("=");
      return [key, parts.join("=")];
    }));
}

function required(value, label) {
  const normalized = String(value == null ? "" : value).trim();
  if (!normalized) throw phaseA3WriteError("missing_" + label.replace(/^--/, "").toLowerCase());
  return normalized;
}

function numericId(value) {
  const normalized = String(value == null ? "" : value).trim();
  if (!/^\d+$/.test(normalized)) throw phaseA3WriteError("phase_a3_write_audit_run_invalid");
  return normalized;
}

function normalizedSha(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function phaseA3WriteError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
