import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";
import { fetchMarketListingsRaw, assertMarketFetchComplete, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { planPriorityThreeSeedSearchQueries } from "../lib/fetchers/market-seed-query-planner.js";
import { applyMarketCandidateSafety } from "../lib/domain/market-match-safety.js";
import { evaluateSeriesCompleteSetCandidates } from "../lib/domain/market-series-complete-set.js";
import { buildSeriesCompleteSetDiagnostic, renderSeriesCompleteSetDiagnosticMarkdown } from "../lib/domain/market-series-complete-set-diagnostic.js";

const MAX_VARIANTS = 25;
const TABLES = ["market_listings", "market_listing_observations", "series", "variants", "import_issues", "ingestion_runs"];
const output = path.resolve(readOption("output-dir") || "market-series-complete-set-diagnostic");
fs.mkdirSync(output, { recursive: true });

let before = null;
let plan = { selected: [], queries: [] };
let records = [];
let evaluations = [];
try {
  assertWorkflowContract();
  const catalog = await loadOfficialCatalog();
  const coverage = await loadMarketCoverageData({ catalog });
  plan = planPriorityThreeSeedSearchQueries(catalog, coverage.coverageRows, {
    limit: MAX_VARIANTS,
    maxVariantsPerSeries: 1,
    rotationKey: `series-complete-set:${process.env.GITHUB_RUN_ID}`,
  });
  if (!plan.selected.length || plan.selected.length > MAX_VARIANTS || plan.queries.length !== plan.selected.length) throw new Error("Complete-set diagnostic selection is invalid.");
  before = await snapshotCounts();
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog, queries: plan.queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS }));
  records = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog }).records;
  evaluations = evaluateSeriesCompleteSetCandidates({ records, queryPlan: plan.queries, catalog });
  const after = await snapshotCounts();
  const report = buildSeriesCompleteSetDiagnostic({
    workflow: workflow(),
    selection: selectionForReport(plan, catalog),
    records,
    evaluations,
    retrieval: {
      provider_request_counts: {
        rakuten_ichiba: fetched.rakutenRequestsAttempted,
        yahoo_shopping: fetched.yahooRequestsAttempted,
      },
      results_returned: fetched.count,
      normalized_records: records.length,
    },
    productionCountsBefore: before,
    productionCountsAfter: after,
  });
  if (!report.zero_delta_verified) throw new Error("Complete-set diagnostic database delta is not zero.");
  write(report);
  console.log(JSON.stringify({ ok: true, database_writes: 0, complete_set_accepted_count: report.complete_set_accepted_count }));
} catch (error) {
  const after = before ? await safeSnapshotCounts() : null;
  const report = buildSeriesCompleteSetDiagnostic({ workflow: workflow(), selection: plan, records, evaluations, productionCountsBefore: before, productionCountsAfter: after });
  report.status = "blocked";
  report.failure = { reason: "series_complete_set_diagnostic_failed" };
  write(report);
  throw error;
}

function assertWorkflowContract() {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Complete-set diagnostic requires workflow_dispatch on main.");
  if (!/^\d+$/.test(String(process.env.GITHUB_RUN_ID || ""))) throw new Error("Complete-set diagnostic requires a GitHub run ID.");
}
async function snapshotCounts() { const values = await Promise.all(TABLES.map((table) => fetchRowCount(table))); return Object.fromEntries(TABLES.map((table, index) => [table, values[index]])); }
async function safeSnapshotCounts() { try { return await snapshotCounts(); } catch { return null; } }
function workflow() { return { run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA }; }
function selectionForReport(selection, catalog) {
  return {
    ...selection,
    selected: selection.selected.map((entry) => {
      const series = catalog.seriesById?.get(entry.seriesId);
      const variant = catalog.variantById?.get(entry.variantId);
      return { ...entry, seriesName: series?.name, variantName: variant?.name };
    }),
  };
}
function write(report) { fs.writeFileSync(path.join(output, "market-series-complete-set-diagnostic.json"), `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-series-complete-set-diagnostic.md"), renderSeriesCompleteSetDiagnosticMarkdown(report)); }
function readOption(key) { const prefix = `--${key}=`; return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ""; }
