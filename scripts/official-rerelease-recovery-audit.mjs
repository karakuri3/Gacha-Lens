import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fetchOfficialRaw } from "../lib/fetchers/official-fetcher.js";
import {
  buildOfficialRereleaseRecoveryAudit,
  formatOfficialRereleaseRecoveryAuditMarkdown,
  validateOfficialRereleaseRecoveryAudit,
} from "../lib/domain/official-rerelease-recovery-audit.js";
import { fetchRowCount, fetchRows } from "./supabase-rest.mjs";

const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const expectedMainSha = normalizedSha(required(args["expected-main-sha"], "--expected-main-sha"));
const currentSha = currentHeadSha();
if (!expectedMainSha || currentSha !== expectedMainSha) throw new Error("official_rerelease_audit_main_sha_mismatch");

const databaseBefore = await captureCounts("before");
const [series, restockEvents] = await Promise.all([
  fetchRows("series", {
    select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw",
    params: { order: "id.asc" },
    operationName: "official_rerelease_audit.series",
  }),
  fetchRows("restock_events", {
    select: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,classification_reason,classification_keywords,text,region,shop_name,source_url,reported_at,confidence,review_required,raw",
    params: { source_type: "eq.official_site", order: "id.asc" },
    operationName: "official_rerelease_audit.restock_events",
  }),
]);

const observedAt = new Date().toISOString();
const fetched = await fetchOfficialRaw({
  urls: ["https://gashapon.jp/schedule/"],
  detailFetchLimit: 0,
  detailFetchDelayMs: 0,
  sourceFetchDelayMs: 200,
  schedulePastMonths: 6,
  scheduleFutureMonths: 6,
  previousRecords: [],
  knownOfficialRecords: [],
  knownDetailedOfficialUrls: [],
});
const databaseAfter = await captureCounts("after");

const report = validateOfficialRereleaseRecoveryAudit(buildOfficialRereleaseRecoveryAudit({
  scheduleRecords: fetched.records,
  catalog: { series, restock_events: restockEvents },
  databaseBefore,
  databaseAfter,
  observedAt,
  workflow: {
    run_id: process.env.GITHUB_RUN_ID || args["run-id"],
    head_sha: currentSha,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
  },
  source: {
    ok: fetched.ok === true,
    schedule_pages: Number(fetched.sourceCoverage?.schedulePages ?? 13) || 13,
    records: Array.isArray(fetched.records) ? fetched.records.length : 0,
    issues: Array.isArray(fetched.issues) ? fetched.issues.length : 0,
  },
}));

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "official-rerelease-recovery-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDirectory, "official-rerelease-recovery-audit.md"), `${formatOfficialRereleaseRecoveryAuditMarkdown(report)}\n`, "utf8");

console.log(JSON.stringify({
  ok: !report.final_verdict.endsWith("_BLOCKED"),
  verdict: report.final_verdict,
  rerelease_discovered: report.totals.rerelease_discovered,
  eligible: report.totals.eligible,
  blocked: report.totals.blocked,
  event_inserts: report.totals.restock_event_inserts,
  event_updates: report.totals.restock_event_updates,
  event_unchanged: report.totals.restock_event_unchanged,
  database_writes: 0,
}, null, 2));

if (report.final_verdict === "OFFICIAL_RERELEASE_RECOVERY_AUDIT_BLOCKED") {
  process.exitCode = 1;
}

async function captureCounts(label) {
  return {
    series: await fetchRowCount("series", {}, { operationName: `official_rerelease_audit.${label}.series` }),
    variants: await fetchRowCount("variants", {}, { operationName: `official_rerelease_audit.${label}.variants` }),
    restock_events: await fetchRowCount("restock_events", {}, { operationName: `official_rerelease_audit.${label}.restock_events` }),
    import_issues: await fetchRowCount("import_issues", {}, { operationName: `official_rerelease_audit.${label}.import_issues` }),
  };
}

function currentHeadSha() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!normalizedSha(sha)) throw new Error("official_rerelease_audit_head_sha_unavailable");
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
