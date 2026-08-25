import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildKitanStableIdentity, buildOfficialKitanReadinessAudit, formatOfficialKitanReadinessMarkdown, validateOfficialKitanReadinessAudit } from "../lib/domain/official-kitan-canary.js";
import { findOfficialAuditLeaks } from "../lib/domain/official-read-only-audit.js";
import { fetchOfficialProviderSourceExpansionDiagnostic } from "../lib/fetchers/official-sources/registry.js";
import { fetchExactRowCountReliable, fetchRowsLimited } from "./supabase-rest.mjs";

loadEnvFile(".env.local");
const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(required(args["output-dir"], "--output-dir"));
const headSha = currentHeadSha();
const auditDate = dateJst();
const expectedMainSha = text(args["expected-main-sha"] || process.env.GITHUB_SHA);
if (expectedMainSha && expectedMainSha !== headSha) throw new Error("Kitan readiness audit main SHA does not match the approved revision.");

const before = await captureCounts("before");
const provider = await fetchOfficialProviderSourceExpansionDiagnostic("kitan_club", { mode: "CURRENT" });
const catalog = await loadCatalog(provider?.records);
const after = await captureCounts("after");
const report = validateOfficialKitanReadinessAudit(buildOfficialKitanReadinessAudit({
  provider,
  catalog,
  databaseBefore: before,
  databaseAfter: after,
  workflow: { run_id: args["run-id"] || process.env.GITHUB_RUN_ID, head_sha: headSha, event_name: process.env.GITHUB_EVENT_NAME || "local", audit_date: auditDate },
}));
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = `${formatOfficialKitanReadinessMarkdown(report)}\n`;
const leaks = findOfficialAuditLeaks([{ name: "official-kitan-readiness-audit.json", text: json }, { name: "official-kitan-readiness-audit.md", text: markdown }], explicitSecretValues());
if (leaks.length) throw new Error("Kitan readiness audit secret scan failed.");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "official-kitan-readiness-audit.json"), json, "utf8");
fs.writeFileSync(path.join(outputDirectory, "official-kitan-readiness-audit.md"), markdown, "utf8");
console.log(JSON.stringify({ ok: true, verdict: report.final_verdict, candidate_count: report.plan.candidate_count, database_writes: 0, output_directory: outputDirectory }, null, 2));

async function loadCatalog(records) {
  const products = [...new Map((Array.isArray(records) ? records : []).filter((record) => text(record?.source_product_id) && text(record?.official_url)).map((record) => [text(record.source_product_id), record])).values()];
  if (products.length > 5) return { series: [], variants: [], complete: false };
  const seriesIds = products.map((record) => buildKitanStableIdentity(record.source_product_id));
  const officialUrls = products.map((record) => text(record.official_url));
  const seriesNames = products.map((record) => text(record.series_name));
  const variantIds = products.flatMap((record) => Array.isArray(record.variants) && record.variants.length <= 12 ? record.variants.map((variant) => buildKitanStableIdentity(record.source_product_id, variant?.name)) : []);
  if (variantIds.length > 60) return { series: [], variants: [], complete: false };
  const [seriesById, seriesByUrl, seriesByName, variantsById] = await Promise.all([
    readBounded("series", "id", seriesIds, "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw", 6, "kitan_readiness.series_by_id"),
    readBounded("series", "official_url", officialUrls, "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw", 6, "kitan_readiness.series_by_url"),
    readBounded("series", "name", seriesNames, "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw", 30, "kitan_readiness.series_by_name"),
    readBounded("variants", "id", variantIds, "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,source_type,review_required,axes,signals,tags,raw", 60, "kitan_readiness.variants_by_id"),
  ]);
  const series = uniqueRows([...seriesById.rows, ...seriesByUrl.rows, ...seriesByName.rows]);
  const potentialLegacySeriesIds = series.filter((row) => text(row?.brand) === "キタンクラブ" && text(row?.source_type) === "official_site").map((row) => text(row.id));
  const variantsBySeries = await readBounded("variants", "series_id", potentialLegacySeriesIds, "id,slug,series_id,name,variant_type,rarity,role,image,released,price,brand,release_month,release_week,release_date,official_url,source_type,review_required,axes,signals,tags,raw", 78, "kitan_readiness.variants_by_series");
  return { series, variants: uniqueRows([...variantsById.rows, ...variantsBySeries.rows]), complete: !seriesById.saturated && !seriesByUrl.saturated && !seriesByName.saturated && !variantsById.saturated && !variantsBySeries.saturated };
}
async function readBounded(table, column, values, select, maxRows, operationName) {
  if (!values.length) return { rows: [], saturated: false };
  return fetchRowsLimited(table, { select, maxRows, params: { [column]: inFilter(values), order: "id.asc" }, operationName });
}
async function captureCounts(label) {
  const counts = {};
  for (const table of ["series", "variants", "restock_events", "import_issues"]) counts[table] = (await fetchExactRowCountReliable(table, {}, { operationName: `kitan_readiness.${label}.${table}` })).count;
  counts.review_required = (await fetchExactRowCountReliable("variants", { review_required: "eq.true" }, { operationName: `kitan_readiness.${label}.review_required` })).count;
  counts.provisional_variants = (await fetchExactRowCountReliable("variants", { variant_type: "eq.provisional" }, { operationName: `kitan_readiness.${label}.provisional_variants` })).count;
  return counts;
}
function currentHeadSha() { const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Current Git revision is unavailable."); return sha; }
function dateJst() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).reduce((result, part) => part.type === "literal" ? result : { ...result, [part.type]: part.value }, {}); return `${parts.year}-${parts.month}-${parts.day}`; }
function inFilter(values) { return `in.(${[...new Set(values.map(text).filter(Boolean))].map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")})`; }
function uniqueRows(rows) { return [...new Map(rows.map((row) => [text(row?.id), row]).filter(([id]) => id)).values()]; }
function explicitSecretValues() { return [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_DB_URL].map(text).filter(Boolean); }
function loadEnvFile(fileName) { const file = path.resolve(fileName); if (!fs.existsSync(file)) return; for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue; const [key, ...parts] = trimmed.split("="); if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, ""); } }
function parseArgs(values) { return Object.fromEntries(values.filter((value) => value.startsWith("--") && value.includes("=")).map((value) => { const [key, ...parts] = value.slice(2).split("="); return [key, parts.join("=")] })); }
function required(value, label) { if (!text(value)) throw new Error(`Missing ${label}.`); return text(value); }
function text(value) { return value == null ? "" : String(value).trim(); }
