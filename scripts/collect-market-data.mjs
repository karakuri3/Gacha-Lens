import fs from "node:fs";
import path from "node:path";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { planMarketSearchQueries } from "../lib/fetchers/market-query-planner.js";
import { getGeneratedDataPath } from "./generated-paths.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";

loadEnvFile(".env.local");

const outputPath = getGeneratedDataPath("market-raw.json");
const startedAt = Date.now();
const coverageData = await loadMarketCoverageData();
const plan = planMarketSearchQueries(coverageData.catalog, coverageData.coverageRows, plannerOptions());
const result = await fetchMarketListingsRaw({ catalog: coverageData.catalog, queries: plan.queries });
const safetyResult = applyMarketCandidateSafety({
  records: result.records,
  queryPlan: plan.queries,
  catalog: coverageData.catalog,
});
result.records = safetyResult.records;
const candidateSummary = summarizeFetchedMarketCandidates({
  records: result.records,
  rawCount: result.count,
  queryPlan: plan.queries,
  feedResults: result.feedResults,
  catalog: coverageData.catalog,
  safetyResult,
});
result.coveragePlan = {
  ...plan.summary,
  selected_variant_ids: plan.selected.map((entry) => entry.variantId),
};
result.runSummary = {
  ...plan.summary,
  ...candidateSummary,
  selected_variant_ids: plan.selected.map((entry) => entry.variantId),
  queries_generated: plan.queries.length,
  no_result_variants: Math.max(0, plan.selected.length - candidateSummary.variants_with_results),
  listing_upserts: result.records.length,
  observations_created: result.records.filter((record) => Number.isFinite(Number(record.price))).length,
  duration_ms: Date.now() - startedAt,
};
writeJson(outputPath, result);
console.log(JSON.stringify(summarize("market", result, outputPath), null, 2));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function summarize(source, result, filePath) {
  return {
    ok: Boolean(result.ok),
    source,
    fetchedAt: result.fetchedAt,
    configuredSources: result.configuredSources ?? 0,
    records: Array.isArray(result.records) ? result.records.length : 0,
    issues: Array.isArray(result.issues) ? result.issues.length : 0,
    feedResults: result.feedResults ?? [],
    queries: Array.isArray(result.queryPlan) ? result.queryPlan.length : 0,
    coveragePlan: result.coveragePlan ?? {},
    runSummary: result.runSummary ?? {},
    outputPath: path.relative(process.cwd(), filePath),
  };
}

function plannerOptions() {
  return {
    limit: process.env.MARKET_COVERAGE_LIMIT ?? 25,
    priority: process.env.MARKET_COVERAGE_PRIORITY ?? "all",
    release: process.env.MARKET_COVERAGE_RELEASE ?? "all",
    cooldownHours: process.env.MARKET_COVERAGE_COOLDOWN_HOURS ?? 24,
    queryLimit: process.env.MARKET_QUERY_LIMIT_PER_RUN ?? 24,
    maxQueriesPerVariant: process.env.MARKET_MAX_QUERIES_PER_VARIANT ?? 1,
  };
}

function loadEnvFile(fileName) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const body = fs.readFileSync(envPath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}
