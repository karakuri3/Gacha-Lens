import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  buildOfficialQualiaSeriesReadinessAudit,
  buildQualiaSeriesStableIdentity,
  formatOfficialQualiaSeriesReadinessMarkdown,
  validateOfficialQualiaSeriesReadinessAudit,
} from "../lib/domain/official-qualia-series-canary.js";
import { findOfficialAuditLeaks } from "../lib/domain/official-read-only-audit.js";
import { fetchOfficialProviderSourceExpansionDiagnostic } from "../lib/fetchers/official-sources/registry.js";
import { fetchExactRowCountReliable, fetchRowsLimited } from "./supabase-rest.mjs";

loadEnvFile(".env.local");
const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const headSha = currentHeadSha();
const expectedMainSha = text(args["expected-main-sha"] || process.env.GITHUB_SHA);
if (expectedMainSha && expectedMainSha !== headSha) throw new Error("Qualia series readiness audit main SHA does not match the approved revision.");

const before = await captureCounts("before");
const provider = await fetchOfficialProviderSourceExpansionDiagnostic("qualia", { mode: "CURRENT" });
const catalog = await loadCatalog([...asArray(provider?.metadata_records), ...asArray(provider?.records)]);
const after = await captureCounts("after");
const report = validateOfficialQualiaSeriesReadinessAudit(buildOfficialQualiaSeriesReadinessAudit({
  provider,
  catalog,
  databaseBefore: before,
  databaseAfter: after,
  workflow: {
    run_id: args["run-id"] || process.env.GITHUB_RUN_ID,
    head_sha: headSha,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
    audit_date: dateJst(),
  },
}));
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = `${formatOfficialQualiaSeriesReadinessMarkdown(report)}\n`;
const leaks = findOfficialAuditLeaks([
  { name: "official-qualia-series-readiness-audit.json", text: json },
  { name: "official-qualia-series-readiness-audit.md", text: markdown },
], explicitSecretValues());
if (leaks.length) throw new Error("Qualia series readiness audit secret scan failed.");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "official-qualia-series-readiness-audit.json"), json, "utf8");
fs.writeFileSync(path.join(outputDirectory, "official-qualia-series-readiness-audit.md"), markdown, "utf8");
console.log(JSON.stringify({
  ok: true,
  verdict: report.final_verdict,
  selected_candidate_count: report.plan.selected_candidate_count,
  series_inserts: report.plan.series_inserts,
  variant_writes: 0,
  database_writes: 0,
  output_directory: outputDirectory,
}, null, 2));

async function loadCatalog(records) {
  const products = [...new Map(records
    .filter((record) => text(record?.source_product_id) && text(record?.official_url))
    .map((record) => [text(record.source_product_id), record])).values()];
  if (!products.length || products.length > 5) return { series: [], complete: false };
  const ids = products.flatMap((record) => {
    try { return [buildQualiaSeriesStableIdentity(record.source_product_id)]; }
    catch { return []; }
  });
  const urls = products.map((record) => text(record.official_url));
  const names = products.map((record) => text(record.series_name));
  const [byId, byUrl, byName] = await Promise.all([
    readBounded("id", ids, 6, "qualia_series_readiness.series_by_id"),
    readBounded("official_url", urls, 6, "qualia_series_readiness.series_by_url"),
    readBounded("name", names, 30, "qualia_series_readiness.series_by_name"),
  ]);
  return {
    series: uniqueRows([...byId.rows, ...byUrl.rows, ...byName.rows]),
    complete: !byId.saturated && !byUrl.saturated && !byName.saturated,
  };
}

async function readBounded(column, values, maxRows, operationName) {
  if (!values.length) return { rows: [], saturated: false };
  return fetchRowsLimited("series", {
    select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw",
    maxRows,
    params: { [column]: inFilter(values), order: "id.asc" },
    operationName,
  });
}

async function captureCounts(label) {
  const counts = {};
  for (const table of ["series", "variants", "restock_events", "import_issues"]) {
    counts[table] = (await fetchExactRowCountReliable(table, {}, { operationName: `qualia_series_readiness.${label}.${table}` })).count;
  }
  counts.review_required = (await fetchExactRowCountReliable("variants", { review_required: "eq.true" }, { operationName: `qualia_series_readiness.${label}.review_required` })).count;
  counts.provisional_variants = (await fetchExactRowCountReliable("variants", { variant_type: "eq.provisional" }, { operationName: `qualia_series_readiness.${label}.provisional_variants` })).count;
  return counts;
}

function currentHeadSha() {
  const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("Current Git revision is unavailable.");
  return value;
}

function dateJst() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce((result, part) => part.type === "literal" ? result : { ...result, [part.type]: part.value }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function inFilter(values) {
  return `in.(${[...new Set(values.map(text).filter(Boolean))]
    .map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")})`;
}

function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [text(row?.id), row]).filter(([id]) => id)).values()];
}

function explicitSecretValues() {
  return [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_DB_URL].map(text).filter(Boolean);
}

function loadEnvFile(fileName) {
  const file = path.resolve(fileName);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

function parseArgs(values) {
  return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => {
    const [key, ...parts] = value.slice(2).split("=");
    return [key, parts.join("=")];
  }));
}

function required(value, label) {
  if (!text(value)) throw new Error(`Missing ${label}.`);
  return text(value);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return value == null ? "" : String(value).trim();
}
