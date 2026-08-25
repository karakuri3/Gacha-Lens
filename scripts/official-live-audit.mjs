import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  buildOfficialReadOnlyAudit,
  findOfficialAuditLeaks,
  formatOfficialReadOnlyAuditMarkdown,
  validateOfficialReadOnlyAudit,
} from "../lib/domain/official-read-only-audit.js";
import {
  buildKnownOfficialCatalogIdentity,
  fetchOfficialLiveSnapshot,
} from "../lib/fetchers/official-live-audit.js";
import {
  fetchExactRowCountReliable,
  fetchRows,
} from "./supabase-rest.mjs";

loadEnvFile(".env.local");
const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(args["output-dir"] || process.env.OFFICIAL_AUDIT_OUTPUT_DIR || "artifacts/official-live-audit");
const headSha = currentHeadSha();
const expectedMainSha = text(args["expected-main-sha"] || process.env.GITHUB_SHA);
if (expectedMainSha && headSha !== expectedMainSha) throw new Error("Official audit main SHA does not match the approved revision.");

const before = await captureOfficialCounts("before");
const catalog = await loadOfficialCatalog();
const marketInterestOfficialUrls = await loadMarketInterestOfficialUrls(catalog.variants);
const selectionMode = text(args["selection-mode"]) || "priority";
const knownOfficialIdentity = selectionMode === "progressive"
  ? buildKnownOfficialCatalogIdentity(catalog)
  : { urls: [], ids: [] };
const snapshot = await fetchOfficialLiveSnapshot({
  selectionMode,
  knownOfficialUrls: knownOfficialIdentity.urls,
  knownOfficialIds: knownOfficialIdentity.ids,
  marketInterestOfficialUrls,
});
const after = await captureOfficialCounts("after");
const report = validateOfficialReadOnlyAudit(buildOfficialReadOnlyAudit({
  snapshot,
  catalog,
  databaseBefore: before,
  databaseAfter: after,
  workflow: {
    run_id: args["run-id"] || process.env.GITHUB_RUN_ID,
    head_sha: headSha,
    event_name: process.env.GITHUB_EVENT_NAME || "local",
  },
}));
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = formatOfficialReadOnlyAuditMarkdown(report);
const leaks = findOfficialAuditLeaks([
  { name: "official-live-audit.json", text: json },
  { name: "official-live-audit.md", text: markdown },
], explicitSecretValues());
if (leaks.length) throw new Error(`Official audit secret scan failed for ${leaks.length} file(s).`);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "official-live-audit.json"), json, "utf8");
fs.writeFileSync(path.join(outputDirectory, "official-live-audit.md"), markdown, "utf8");
console.log(JSON.stringify({
  ok: true,
  verdict: report.final_verdict,
  report_complete: report.report_complete,
  formal_lineups: report.totals.formal_lineups,
  plan_candidates: report.plan.candidate_count,
  blockers: report.plan.blockers,
  database_writes: report.database.writes,
  output_directory: outputDirectory,
}, null, 2));

async function loadOfficialCatalog() {
  const series = await fetchRows("series", {
      select: "id,slug,name,franchise,brand,category,release_month,release_week,release_date,price,image_url,official_url,is_released,source_type,raw",
    params: { order: "id.asc" },
    operationName: "official_audit.series_catalog",
  });
  const variants = await fetchRows("variants", {
      select: "id,slug,series_id,name,variant_type,rarity,role,image,official_url,price,brand,release_month,release_week,release_date,released,axes,signals,tags,source_type,review_required,raw",
    params: { order: "id.asc" },
    operationName: "official_audit.variant_catalog",
  });
  const restockEvents = await fetchRows("restock_events", {
    select: "id,variant_id,matched_variant_id,series_id,source_type,source_weight,event_type,event_label,classification_reason,classification_keywords,text,region,shop_name,source_url,reported_at,confidence,review_required,raw",
    params: { source_type: "eq.official_site", order: "id.asc" },
    operationName: "official_audit.restock_catalog",
  });
  return { series, variants, restock_events: restockEvents };
}

async function loadMarketInterestOfficialUrls(variants) {
  const marketRows = await fetchRows("market_listings", {
    select: "id,variant_id",
    params: { order: "id.asc" },
    operationName: "official_audit.market_interest",
  });
  const activeVariantIds = new Set(marketRows.map((row) => text(row.variant_id)).filter(Boolean));
  return [...new Set(variants
    .filter((variant) => activeVariantIds.has(text(variant.id)))
    .map((variant) => text(variant.official_url))
    .filter(Boolean))];
}

async function captureOfficialCounts(label) {
  const series = await count("series", {}, `${label}.series`);
  const variants = await count("variants", {}, `${label}.variants`);
  const restockEvents = await count("restock_events", {}, `${label}.restock_events`);
  const importIssues = await count("import_issues", {}, `${label}.import_issues`);
  const reviewRequired = await count("variants", { review_required: "eq.true" }, `${label}.review_required`);
  const provisionalVariants = await count("variants", { variant_type: "eq.provisional" }, `${label}.provisional_variants`);
  return {
    series,
    variants,
    restock_events: restockEvents,
    import_issues: importIssues,
    review_required: reviewRequired,
    provisional_variants: provisionalVariants,
  };
}

async function count(table, params, operationName) {
  return (await fetchExactRowCountReliable(table, params, { operationName: `official_audit.${operationName}` })).count;
}

function currentHeadSha() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Current Git revision is unavailable.");
  return sha;
}

function explicitSecretValues() {
  return [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.RAKUTEN_APPLICATION_ID,
    process.env.RAKUTEN_ACCESS_KEY,
    process.env.YAHOO_SHOPPING_APP_ID,
  ].map(text).filter(Boolean);
}

function loadEnvFile(fileName) {
  const filePath = path.resolve(fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
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

function text(value) {
  return value == null ? "" : String(value).trim();
}
