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

if (!expectedHeadSha || currentSha !== expectedHeadSha) {
  throw phaseA3Error("phase_a3_preflight_head_sha_mismatch");
}
if (String(process.env.INGESTION_WRITE_DISABLED || "").trim() !== "true") {
  throw phaseA3Error("phase_a3_preflight_write_disable_missing");
}

const databaseBefore = await captureOfficialPhaseA3Counts();
const scan = await scanOfficialPhaseA3Residuals({ operationPrefix: "phase_a3_preflight" });
const databaseAfter = await captureOfficialPhaseA3Counts();

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
  workflow: {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: currentSha,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
  },
}));

const expectation = {
  plan_digest: process.env.PHASE_A3_EXPECTED_PLAN_DIGEST,
  known_undetailed: process.env.PHASE_A3_EXPECTED_KNOWN_UNDETAILED,
  safe_records: process.env.PHASE_A3_EXPECTED_SAFE_RECORDS,
  safe_variants: process.env.PHASE_A3_EXPECTED_SAFE_VARIANTS,
  rerelease_records: process.env.PHASE_A3_EXPECTED_RERELEASE_RECORDS,
  unresolved_records: process.env.PHASE_A3_EXPECTED_UNRESOLVED_RECORDS,
};
if (Object.values(expectation).some((value) => String(value || "").trim())) {
  assertOfficialPhaseA3Expectation(report, expectation);
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "official-phase-a3-preflight.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8",
);
fs.writeFileSync(
  path.join(outputDirectory, "official-phase-a3-preflight.md"),
  formatOfficialPhaseA3SnapshotMarkdown(report) + "\n",
  "utf8",
);

for (const [key, value] of Object.entries({
  plan_digest: report.plan.plan_digest,
  known_undetailed: report.counts.known_undetailed,
  safe_records: report.counts.safe_records,
  safe_variants: report.counts.safe_variants,
  rerelease_records: report.counts.rerelease_records,
  unresolved_records: report.counts.unresolved_records,
})) writeOutput(key, value);

console.log(JSON.stringify({
  ok: true,
  final_verdict: report.final_verdict,
  plan_digest: report.plan.plan_digest,
  known_undetailed: report.counts.known_undetailed,
  safe_records: report.counts.safe_records,
  safe_variants: report.counts.safe_variants,
  rerelease_records: report.counts.rerelease_records,
  unresolved_records: report.counts.unresolved_records,
  held_shared_detailed_urls: report.scan.held_shared_detailed_urls,
  held_unsupported_provider_urls: report.scan.held_unsupported_provider_urls,
  priority_scan_complete: report.scan.priority_scan_complete,
  database_delta: report.database.delta,
  database_writes: 0,
}, null, 2));

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

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
