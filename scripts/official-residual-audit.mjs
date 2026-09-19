import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import {
  buildOfficialResidualAudit,
  formatOfficialResidualAuditMarkdown,
  validateOfficialResidualAudit,
} from "../lib/domain/official-residual-audit.js";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const expectedHeadSha = normalizedSha(required(args["expected-head-sha"], "--expected-head-sha"));
const currentSha = currentHeadSha();
if (!expectedHeadSha || currentSha !== expectedHeadSha) throw new Error("official_residual_audit_head_sha_mismatch");
if (String(process.env.INGESTION_WRITE_DISABLED || "").trim() !== "true") throw new Error("official_residual_audit_write_disable_missing");

const databaseBefore = await captureCounts("before");
const [knownDetailedRows, knownOfficialRecords] = await Promise.all([
  fetchRows("variants", {
    select: "series:series!inner(official_url)",
    params: { variant_type: "neq.provisional" },
    operationName: "official_residual_audit.known_detailed",
  }),
  fetchRows("series", {
    select: "id,name,official_url,release_date",
    params: { official_url: "not.is.null", order: "id.asc" },
    operationName: "official_residual_audit.series",
  }),
]);

const knownDetailedOfficialUrls = [...new Set(knownDetailedRows.map((row) => row.series?.official_url).filter(Boolean))];
const detailedSet = new Set(knownDetailedOfficialUrls);
const knownUndetailedCount = knownOfficialRecords.filter((row) => row.official_url && !detailedSet.has(row.official_url)).length;
const detailFetchLimit = Math.min(8000, Math.max(1000, knownUndetailedCount + 1000));

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
  priorityDetailUrls: [],
  detailFetchLimit,
  detailFetchDelayMs: 200,
  sourceFetchDelayMs: 200,
  takaratomyPagesPerRun: 8,
  schedulePastMonths: 6,
  scheduleFutureMonths: 6,
});

const databaseAfter = await captureCounts("after");
const observedAt = new Date().toISOString();
const report = validateOfficialResidualAudit(buildOfficialResidualAudit({
  knownOfficialRecords,
  knownDetailedOfficialUrls,
  fetchedRecords: fetched.records,
  detailFetched: fetched.detailFetched,
  detailFetchLimit,
  collectorRemainingDetails: fetched.remainingDetails,
  issues: fetched.issues,
  databaseBefore,
  databaseAfter,
  observedAt,
  workflow: {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: currentSha,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
  },
}));

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "official-residual-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDirectory, "official-residual-audit.md"), `${formatOfficialResidualAuditMarkdown(report)}\n`, "utf8");

console.log(JSON.stringify({
  ok: !["OFFICIAL_RESIDUAL_AUDIT_BLOCKED_DATABASE_DELTA", "OFFICIAL_RESIDUAL_AUDIT_INCOMPLETE_SCAN"].includes(report.final_verdict),
  verdict: report.final_verdict,
  known_undetailed_before: report.totals.known_undetailed_before,
  detail_fetched: report.scan.detail_fetched,
  scan_complete: report.scan.scan_complete,
  non_rerelease_parseable: report.totals.non_rerelease_parseable,
  rerelease_parseable: report.totals.rerelease_parseable,
  collector_remaining_details: report.scan.collector_remaining_details,
  known_unresolved_after_scan: report.totals.known_unresolved_after_scan,
  recent_unresolved_120d: report.recency.known_unresolved_recent_120d,
  issues: report.scan.issues,
  database_writes: 0,
}, null, 2));

if (["OFFICIAL_RESIDUAL_AUDIT_BLOCKED_DATABASE_DELTA", "OFFICIAL_RESIDUAL_AUDIT_INCOMPLETE_SCAN"].includes(report.final_verdict)) {
  process.exitCode = 1;
}

async function captureCounts(label) {
  return {
    series: await fetchRowCount("series", {}, { operationName: `official_residual_audit.${label}.series` }),
    variants: await fetchRowCount("variants", {}, { operationName: `official_residual_audit.${label}.variants` }),
    provisional_variants: await fetchRowCount("variants", { variant_type: "eq.provisional" }, { operationName: `official_residual_audit.${label}.provisional_variants` }),
    restock_events: await fetchRowCount("restock_events", {}, { operationName: `official_residual_audit.${label}.restock_events` }),
    import_issues: await fetchRowCount("import_issues", {}, { operationName: `official_residual_audit.${label}.import_issues` }),
  };
}

function currentHeadSha() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!normalizedSha(sha)) throw new Error("official_residual_audit_head_sha_unavailable");
  return sha;
}

function parseArgs(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }));
}

function required(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`missing_${label.replace(/^--/, "").toLowerCase()}`);
  return normalized;
}

function normalizedSha(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : "";
}
