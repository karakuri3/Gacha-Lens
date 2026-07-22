import { spawn } from "node:child_process";
import { summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { fetchMarketListingsRaw } from "../lib/fetchers/market-fetcher.js";
import { planMarketSearchQueries } from "../lib/fetchers/market-query-planner.js";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";

const options = parseOptions(process.argv.slice(2));
if (options.mode === "write") {
  await runWriteMode(options);
} else {
  await runDryMode(options);
}

async function runDryMode(options) {
  const startedAt = Date.now();
  const data = await loadMarketCoverageData();
  const plan = planMarketSearchQueries(data.catalog, data.coverageRows, options);
  const sourcePlan = plannedSourceRequests(plan.queries.length);
  let sourceResult = emptySourceResult(plan.selected.length);

  if (options.executeSources) {
    if (plan.selected.length > 5) throw new Error("External dry-run is limited to 5 variants.");
    const fetched = await fetchMarketListingsRaw({ catalog: data.catalog, queries: plan.queries });
    sourceResult = assessFetchedRecords(fetched, plan, data.catalog);
  }

  const summary = {
    ok: true,
    mode: "dry-run",
    write_protected: true,
    ...plan.summary,
    selected_variant_ids: plan.selected.map((entry) => entry.variantId),
    selected_sample: plan.selected.slice(0, 5).map((entry) => ({
      variant_id: entry.variantId,
      name: entry.variantName,
      priority: entry.priority,
      reason: entry.priorityReason,
      coverage_state: entry.coverageState,
    })),
    queries_generated: plan.queries.length,
    query_sample: plan.queries.slice(0, 5).map((entry) => entry.query),
    planned_source_requests: sourcePlan,
    ...sourceResult,
    listing_upserts: 0,
    observations_created: 0,
    import_issues_created: 0,
    ingestion_runs_written: 0,
    duration_ms: Date.now() - startedAt,
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function runWriteMode(options) {
  const env = {
    ...process.env,
    MARKET_COVERAGE_LIMIT: String(options.limit),
    MARKET_COVERAGE_PRIORITY: String(options.priority),
    MARKET_COVERAGE_RELEASE: options.release,
    MARKET_COVERAGE_COOLDOWN_HOURS: String(options.cooldownHours),
  };
  const exitCode = await spawnScript("scripts/run-ingestion.mjs", env, ["--task=market"]);
  if (exitCode !== 0) process.exitCode = exitCode;
}

function assessFetchedRecords(fetched, plan, catalog) {
  const feedResults = fetched.feedResults ?? [];
  const candidateSummary = summarizeFetchedMarketCandidates({
    records: fetched.records,
    rawCount: fetched.count,
    queryPlan: plan.queries,
    feedResults,
    catalog,
  });
  return {
    ...candidateSummary,
    no_result_variants: Math.max(0, plan.selected.length - candidateSummary.variants_with_results),
  };
}

function emptySourceResult(selectedCount) {
  return {
    requests_attempted: 0,
    requests_succeeded: 0,
    requests_rate_limited: 0,
    requests_failed: 0,
    source_results: {},
    accepted_listings: 0,
    ambiguous_listings: 0,
    duplicate_listings: 0,
    no_result_variants: selectedCount,
  };
}

function plannedSourceRequests(queryCount) {
  return {
    approved_feed_exports: configuredFeedCount(),
    rakuten_ichiba: enabled(process.env.RAKUTEN_MARKET_FETCH_ENABLED, process.env.RAKUTEN_APPLICATION_ID)
      ? Math.min(queryCount, Number(process.env.RAKUTEN_MARKET_QUERY_LIMIT) || 8)
      : 0,
    yahoo_shopping: enabled(process.env.YAHOO_SHOPPING_FETCH_ENABLED, process.env.YAHOO_SHOPPING_APP_ID)
      ? Math.min(queryCount, Number(process.env.YAHOO_SHOPPING_QUERY_LIMIT) || 24)
      : 0,
  };
}

function configuredFeedCount() {
  try {
    const parsed = JSON.parse(process.env.MARKET_RAW_FEED_SOURCES_JSON || "[]");
    if (Array.isArray(parsed)) return parsed.length;
  } catch {}
  return String(process.env.MARKET_RAW_FEED_URLS || "").split(",").map((entry) => entry.trim()).filter(Boolean).length;
}

function parseOptions(args) {
  const values = Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=")];
  }));
  const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")).map((arg) => arg.slice(2)));
  const mode = values.mode === "write" ? "write" : "dry-run";
  const limit = Math.min(200, Math.max(1, Number(values.limit ?? 25) || 25));
  if (flags.has("execute-sources") && limit > 5) throw new Error("--execute-sources requires --limit=5 or less.");
  return {
    mode,
    limit,
    priority: values.priority ?? "all",
    release: ["released", "upcoming", "all"].includes(values.release) ? values.release : "all",
    cooldownHours: Math.max(0, Number(values.cooldownHours ?? values["cooldown-hours"] ?? 24) || 0),
    executeSources: flags.has("execute-sources"),
  };
}

function spawnScript(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: process.cwd(), env, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function enabled(explicit, credential) {
  if (explicit != null && String(explicit).trim() !== "") return !["0", "false", "no", "off"].includes(String(explicit).toLowerCase());
  return Boolean(credential);
}
