import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildOfficialRereleaseRecoveryAudit,
  formatOfficialRereleaseRecoveryAuditMarkdown,
  validateOfficialRereleaseRecoveryAudit,
} from "../lib/domain/official-rerelease-recovery-audit.js";
import { findOfficialBoundedLeaks } from "../lib/domain/official-bounded-write.js";
import {
  captureOfficialPhaseA3Counts,
  scanOfficialPhaseA3Residuals,
} from "./official-phase-a3-support.mjs";
import { fetchRows } from "./supabase-rest.mjs";

const [command = "audit", ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));

if (command === "audit") await runAudit();
else if (command === "scan") scanArtifact();
else if (command === "verify") verifyArtifact();
else throw new Error("Expected audit, scan, or verify command.");

async function runAudit() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const expectedMainSha = normalizedSha(required(args["expected-main-sha"], "--expected-main-sha"));
  const currentSha = currentHeadSha();
  if (!expectedMainSha || currentSha !== expectedMainSha) {
    throw auditError("official_rerelease_audit_main_sha_mismatch");
  }

  const databaseBefore = await captureOfficialPhaseA3Counts();
  const residualScan = await scanOfficialPhaseA3Residuals({
    operationPrefix: "rerelease_recovery_audit",
    allowEmptyPlan: true,
  });
  const [series, restockEvents] = await Promise.all([
    fetchRows("series", {
      select: "id,slug,name,release_month,release_week,release_date,official_url",
      params: { order: "id.asc" },
      operationName: "rerelease_recovery_audit.catalog_series",
    }),
    fetchRows("restock_events", {
      select: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,classification_reason,classification_keywords,text,region,shop_name,source_url,reported_at,confidence,review_required,raw",
      params: { source_type: "eq.official_site", order: "id.asc" },
      operationName: "rerelease_recovery_audit.restock_events",
    }),
  ]);
  const databaseAfter = await captureOfficialPhaseA3Counts();
  const observedAt = new Date().toISOString();

  const report = validateOfficialRereleaseRecoveryAudit(buildOfficialRereleaseRecoveryAudit({
    residual: residualScan.classification,
    catalog: { series, restock_events: restockEvents },
    databaseBefore,
    databaseAfter,
    observedAt,
    workflow: {
      run_id: process.env.GITHUB_RUN_ID || args["run-id"],
      head_sha: currentSha,
      event_name: process.env.GITHUB_EVENT_NAME || "local",
    },
    scan: {
      detail_fetch_limit: residualScan.detailFetchLimit,
      detail_fetched: residualScan.fetched.detailFetched,
      known_priority_urls: residualScan.knownPriorityUrls,
      held_shared_detailed_urls: residualScan.heldSharedDetailedUrls,
      held_unsupported_provider_urls: residualScan.heldUnsupportedProviderUrls,
      priority_scan_complete: residualScan.priorityScanComplete,
      fetch_issues: residualScan.fetched.issues?.length || 0,
    },
  }));

  writeJson(reportPath(), report);
  fs.writeFileSync(markdownPath(), formatOfficialRereleaseRecoveryAuditMarkdown(report) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: report.final_verdict !== "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED",
    final_verdict: report.final_verdict,
    plan_digest: report.plan.plan_digest,
    known_undetailed: report.residual.known_undetailed,
    safe_records: report.residual.safe_records,
    rerelease_records: report.residual.rerelease_records,
    unresolved_records: report.residual.unresolved_records,
    event_inserts: report.plan.restock_event_inserts,
    event_updates: report.plan.restock_event_updates,
    event_unchanged: report.plan.restock_event_unchanged,
    blocked_candidates: report.plan.blocked,
    database_writes: 0,
  }, null, 2));

  if (report.final_verdict === "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED") {
    process.exitCode = 1;
  }
}

function scanArtifact() {
  const files = fs.readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(json|md)$/i.test(entry.name))
    .filter((entry) => entry.name !== "official-rerelease-recovery-secret-scan.json")
    .map((entry) => ({
      name: entry.name,
      text: fs.readFileSync(path.join(outputDirectory, entry.name), "utf8"),
    }));
  if (!files.length) throw auditError("official_rerelease_audit_artifact_missing");

  const leaks = findOfficialBoundedLeaks(files, [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.GITHUB_TOKEN,
  ]);
  if (leaks.length) throw auditError("official_rerelease_audit_secret_scan_failed");

  writeJson(secretScanPath(), {
    schema_version: 1,
    files_scanned: files.length,
    secret_findings: 0,
  });
  console.log(JSON.stringify({ ok: true, files_scanned: files.length, secret_findings: 0 }));
}

function verifyArtifact() {
  const report = validateOfficialRereleaseRecoveryAudit(readJson(reportPath()));
  const scan = readJson(secretScanPath());
  if (![
    "OFFICIAL_RERELEASE_RECOVERY_AUDIT_READY",
    "OFFICIAL_RERELEASE_RECOVERY_AUDIT_NO_CHANGES",
  ].includes(report.final_verdict)
    || Number(scan?.secret_findings) !== 0
    || report.execution?.writes_allowed !== false
    || Number(report.database?.writes) !== 0) {
    throw auditError("official_rerelease_audit_final_verification_failed");
  }
  console.log(JSON.stringify({
    ok: true,
    final_verdict: report.final_verdict,
    head_sha: report.workflow.head_sha,
    plan_digest: report.plan.plan_digest,
    rerelease_records: report.residual.rerelease_records,
    unresolved_records: report.residual.unresolved_records,
    planned_database_writes: report.plan.planned_database_writes,
    database_writes: report.database.writes,
  }, null, 2));
}

function reportPath() {
  return path.join(outputDirectory, "official-rerelease-recovery-audit.json");
}

function markdownPath() {
  return path.join(outputDirectory, "official-rerelease-recovery-audit.md");
}

function secretScanPath() {
  return path.join(outputDirectory, "official-rerelease-recovery-secret-scan.json");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function currentHeadSha() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!normalizedSha(sha)) throw auditError("official_rerelease_audit_head_sha_unavailable");
  return sha;
}

function parseArgs(values) {
  return Object.fromEntries(values
    .filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...tail] = value.slice(2).split("=");
      return [key, tail.join("=")];
    }));
}

function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error("missing_" + label.replace(/^--/, "").toLowerCase());
  return normalized;
}

function normalizedSha(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function auditError(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
