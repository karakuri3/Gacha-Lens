import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import {
  assertOfficialPhaseA3Expectation,
  buildOfficialPhaseA3Plan,
  buildOfficialPhaseA3Snapshot,
  canonicalOfficialUrl,
  classifyOfficialPhaseA3Residuals,
  formatOfficialPhaseA3SnapshotMarkdown,
  validateOfficialPhaseA3Snapshot,
} from "../lib/domain/official-phase-a3.js";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

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

const databaseBefore = await captureCounts();
const scan = await scanResiduals();
const databaseAfter = await captureCounts();

const report = validateOfficialPhaseA3Snapshot(buildOfficialPhaseA3Snapshot({
  classification: scan.classification,
  plan: scan.plan,
  scan: {
    detail_fetch_limit: scan.detailFetchLimit,
    detail_fetched: scan.fetched.detailFetched,
    known_priority_urls: scan.knownPriorityUrls,
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

writeOutput("plan_digest", report.plan.plan_digest);
writeOutput("known_undetailed", report.counts.known_undetailed);
writeOutput("safe_records", report.counts.safe_records);
writeOutput("safe_variants", report.counts.safe_variants);
writeOutput("rerelease_records", report.counts.rerelease_records);
writeOutput("unresolved_records", report.counts.unresolved_records);

console.log(JSON.stringify({
  ok: true,
  final_verdict: report.final_verdict,
  plan_digest: report.plan.plan_digest,
  known_undetailed: report.counts.known_undetailed,
  safe_records: report.counts.safe_records,
  safe_variants: report.counts.safe_variants,
  rerelease_records: report.counts.rerelease_records,
  unresolved_records: report.counts.unresolved_records,
  priority_scan_complete: report.scan.priority_scan_complete,
  database_delta: report.database.delta,
  database_writes: 0,
}, null, 2));

async function scanResiduals() {
  const [knownDetailedRows, knownOfficialRecords] = await Promise.all([
    fetchRows("variants", {
      select: "id,series_id,series:series!inner(id,official_url)",
      params: { variant_type: "neq.provisional", order: "id.asc" },
      operationName: "phase_a3_preflight.known_detailed",
    }),
    fetchRows("series", {
      select: "id,name,official_url,release_date",
      params: { official_url: "not.is.null", order: "id.asc" },
      operationName: "phase_a3_preflight.series",
    }),
  ]);

  const knownDetailedOfficialUrls = [...new Set(
    knownDetailedRows.map((row) => canonicalOfficialUrl(row.series?.official_url)).filter(Boolean),
  )];
  const detailedSet = new Set(knownDetailedOfficialUrls);
  const priorityDetailUrls = knownOfficialRecords
    .map((row) => canonicalOfficialUrl(row.official_url))
    .filter((url) => url && !detailedSet.has(url));

  if (priorityDetailUrls.length > 7500) throw phaseA3Error("phase_a3_preflight_residual_limit_exceeded");
  const detailFetchLimit = Math.min(8000, Math.max(1000, priorityDetailUrls.length + 500));

  const fetched = await fetchOfficialRaw({
    urls: [
      "https://gashapon.jp/schedule/",
      "https://gashapon.jp/products/",
      "https://www.takaratomy-arts.co.jp/items/gacha/search.html?order=release&p=1&sort=0",
    ],
    previousRecords: [],
    detailCursor: 0,
    sourceCursors: {},
    knownDetailedOfficialUrls,
    knownOfficialRecords,
    priorityDetailUrls,
    detailFetchLimit,
    detailFetchDelayMs: 200,
    sourceFetchDelayMs: 200,
    takaratomyPagesPerRun: 8,
    schedulePastMonths: 6,
    scheduleFutureMonths: 6,
  });

  const classification = classifyOfficialPhaseA3Residuals({
    knownOfficialRecords,
    knownDetailedOfficialUrls,
    fetchedRecords: fetched.records,
  });
  const plan = buildOfficialPhaseA3Plan(classification);
  const priorityScanComplete = Number(fetched.detailFetched) >= priorityDetailUrls.length
    && classification.knownUndetailedRecords.length === priorityDetailUrls.length;

  if (!priorityScanComplete) throw phaseA3Error("phase_a3_preflight_incomplete_priority_scan");

  return {
    fetched,
    classification,
    plan,
    detailFetchLimit,
    knownPriorityUrls: priorityDetailUrls.length,
    priorityScanComplete,
  };
}

async function captureCounts() {
  return {
    series: await fetchRowCount("series"),
    variants: await fetchRowCount("variants"),
    provisional_variants: await fetchRowCount("variants", { variant_type: "eq.provisional" }),
    restock_events: await fetchRowCount("restock_events"),
    import_issues: await fetchRowCount("import_issues"),
  };
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

function phaseA3Error(reasonCode) {
  const error = new Error(reasonCode);
  error.reason_code = reasonCode;
  return error;
}
