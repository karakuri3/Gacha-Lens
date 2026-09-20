import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  assertOfficialPhaseA3Expectation,
  buildOfficialPhaseA3Snapshot,
  formatOfficialPhaseA3SnapshotMarkdown,
  validateOfficialPhaseA3Snapshot,
} from "../lib/domain/official-phase-a3.js";
import {
  captureOfficialPhaseA3Counts,
  scanOfficialPhaseA3Residuals,
} from "./official-phase-a3-support.mjs";

const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const expectedHeadSha = normalizedSha(required(args["expected-head-sha"], "--expected-head-sha"));
const currentSha = currentHeadSha();
fs.mkdirSync(outputDirectory, { recursive: true });

let databaseBefore = null;
let databaseAfter = null;

try {
  if (!expectedHeadSha || currentSha !== expectedHeadSha) {
    throw phaseA3Error("phase_a3_preflight_head_sha_mismatch");
  }
  if (String(process.env.INGESTION_WRITE_DISABLED || "").trim() !== "true") {
    throw phaseA3Error("phase_a3_preflight_write_disable_missing");
  }

  databaseBefore = await captureOfficialPhaseA3Counts();
  const scan = await scanOfficialPhaseA3Residuals({ operationPrefix: "phase_a3_preflight" });
  databaseAfter = await captureOfficialPhaseA3Counts();

  const report = validateOfficialPhaseA3Snapshot(buildOfficialPhaseA3Snapshot({
    classification: scan.classification,
    plan: scan.plan,
    scan: {
      detail_fetch_limit: scan.detailFetchLimit,
      detail_fetched: scan.fetched.detailFetched,
      known_priority_urls: scan.knownPriorityUrls,
      held_shared_detailed_urls: scan.heldSharedDetailedUrls,
      held_unsupported_provider_urls: scan.heldUnsupportedProviderUrls,
      priority_scan_complete: scan.priorityScanComplete,
      fetch_issues: scan.fetched.issues?.length || 0,
    },
    databaseBefore,
    databaseAfter,
    workflow: workflowIdentity(),
  }));

  const expectation = {
    plan_digest: process.env.PHASE_A3_EXPECTED_PLAN_DIGEST,
    known_undetailed: process.env.PHASE_A3_EXPECTED_KNOWN_UNDETAILED,
    safe_records: process.env.PHASE_A3_EXPECTED_SAFE_RECORDS,
    safe_variants: process.env.PHASE_A3_EXPECTED_SAFE_VARIANTS,
    rerelease_records: process.env.PHASE_A3_EXPECTED_RERELEASE_RECORDS,
    unresolved_records: process.env.PHASE_A3_EXPECTED_UNRESOLVED_RECORDS,
    identity_disambiguations: process.env.PHASE_A3_EXPECTED_IDENTITY_DISAMBIGUATIONS,
    held_shared_detailed_urls: process.env.PHASE_A3_EXPECTED_HELD_SHARED_DETAILED_URLS,
    held_unsupported_provider_urls: process.env.PHASE_A3_EXPECTED_HELD_UNSUPPORTED_PROVIDER_URLS,
  };
  if (Object.values(expectation).some((value) => String(value || "").trim())) {
    assertOfficialPhaseA3Expectation(report, expectation);
  }

  writeJson("official-phase-a3-preflight.json", report);
  fs.writeFileSync(
    path.join(outputDirectory, "official-phase-a3-preflight.md"),
    formatOfficialPhaseA3SnapshotMarkdown(report) + "\n",
    "utf8",
  );

  for (const [key, value] of Object.entries({
    plan_digest: report.plan.plan_digest,
    write_contract_digest: report.plan.write_contract_digest,
    known_undetailed: report.counts.known_undetailed,
    safe_records: report.counts.safe_records,
    safe_variants: report.counts.safe_variants,
    rerelease_records: report.counts.rerelease_records,
    unresolved_records: report.counts.unresolved_records,
    identity_disambiguations: report.plan.identity_disambiguations,
    held_shared_detailed_urls: report.scan.held_shared_detailed_urls,
    held_unsupported_provider_urls: report.scan.held_unsupported_provider_urls,
  })) writeOutput(key, value);

  console.log(JSON.stringify({
    ok: true,
    final_verdict: report.final_verdict,
    plan_digest: report.plan.plan_digest,
    write_contract_digest: report.plan.write_contract_digest,
    known_undetailed: report.counts.known_undetailed,
    safe_records: report.counts.safe_records,
    safe_variants: report.counts.safe_variants,
    rerelease_records: report.counts.rerelease_records,
    unresolved_records: report.counts.unresolved_records,
    identity_disambiguations: report.plan.identity_disambiguations,
    held_shared_detailed_urls: report.scan.held_shared_detailed_urls,
    held_unsupported_provider_urls: report.scan.held_unsupported_provider_urls,
    priority_scan_complete: report.scan.priority_scan_complete,
    database_delta: report.database.delta,
    database_writes: 0,
  }, null, 2));
} catch (error) {
  const reasonCode = safeReasonCode(error);
  const blocked = {
    schema_version: 1,
    report_type: "official_phase_a3_preflight_blocked",
    workflow: workflowIdentity(),
    execution: {
      mode: "read-only",
      writes_allowed: false,
      deletes_allowed: false,
      cleanup_enabled: false,
    },
    database: {
      before: databaseBefore,
      after: databaseAfter,
      writes: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
    },
    final_verdict: "OFFICIAL_PHASE_A3_PREFLIGHT_BLOCKED",
    reason_code: reasonCode,
  };
  writeJson("official-phase-a3-preflight-blocked.json", blocked);
  fs.writeFileSync(
    path.join(outputDirectory, "official-phase-a3-preflight-blocked.md"),
    [
      "# Official Phase A3 preflight blocked",
      "",
      "- Verdict: OFFICIAL_PHASE_A3_PREFLIGHT_BLOCKED",
      "- Reason: " + reasonCode,
      "- Head SHA: " + currentSha,
      "- Database writes: 0",
      "- Inserts: 0",
      "- Updates: 0",
      "- Deletes: 0",
      "",
    ].join("\n"),
    "utf8",
  );
  console.error(JSON.stringify({
    ok: false,
    final_verdict: blocked.final_verdict,
    reason_code: reasonCode,
    database_writes: 0,
  }));
  throw error;
}

function workflowIdentity() {
  return {
    run_id: String(process.env.GITHUB_RUN_ID || args["run-id"] || "") || null,
    head_sha: currentSha || null,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
  };
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(outputDirectory, name), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function currentHeadSha() {
  const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!normalizedSha(value)) throw phaseA3Error("phase_a3_preflight_head_sha_unavailable");
  return value;
}

function writeOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n", "utf8");
  }
}

function parseArgs(values) {
  return Object.fromEntries(values
    .filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }));
}

function required(value, label) {
  const normalized = String(value == null ? "" : value).trim();
  if (!normalized) throw phaseA3Error("missing_" + label.replace(/^--/, "").toLowerCase());
  return normalized;
}

function normalizedSha(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}

function safeReasonCode(error) {
  const value = String(error?.reason_code || "").trim();
  return /^[a-z0-9_]{1,120}$/i.test(value) ? value : "phase_a3_preflight_unclassified_failure";
}

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
