import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";
import { assertMarketFetchComplete, fetchMarketListingsRaw, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { planPriorityThreeSeedSearchQueries, PRIORITY_THREE_SEED_QUERY_PROFILE } from "../lib/fetchers/market-seed-query-planner.js";
import { loadMarketManualCanarySelectionProfile, manualCanarySelectionOptions } from "../lib/domain/market-manual-canary-selection.js";
import { applyMarketCandidateSafety } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit, renderMarketCandidateAuditMarkdown } from "../lib/domain/market-candidate-audit.js";
import {
  assertP3BoundedSeedV2Prewrite,
  buildP3BoundedSeedV2Result,
  buildP3BoundedSeedV2Rows,
  calculateP3BoundedSeedNoResultVariants,
  parseP3BoundedSeedV2Limit,
  persistP3BoundedSeedV2,
  renderP3BoundedSeedV2ResultMarkdown,
  selectP3BoundedSeedV2Candidates,
  validateP3BoundedSeedV2Invocation,
} from "../lib/domain/market-p3-bounded-seed-v2.js";

const options = parseOptions(process.argv.slice(2));
const limit = parseP3BoundedSeedV2Limit(options.limit);
validateP3BoundedSeedV2Invocation({ event_name: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, confirmation: process.env.P3_BOUNDED_SEED_V2_CONFIRMATION, expected_main_sha: options["expected-main-sha"], head_sha: process.env.GITHUB_SHA, origin_main_sha: options["origin-main-sha"] });

const output = path.resolve(options["output-dir"] || "market-p3-bounded-seed-v2");
fs.mkdirSync(output, { recursive: true });
const store = createStore();
let report = null;
let selection = { selected: [], safe_candidate_count: 0, one_listing_per_variant: true, one_variant_per_series: true };
let before = null;

try {
  const data = await loadMarketCoverageData({ catalog: await loadOfficialCatalog() });
  const profile = loadMarketManualCanarySelectionProfile(path.resolve("config/market-manual-canary-selection.json"));
  const runId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  if (!/^\d+$/.test(runId)) throw new Error("P3 bounded seed v2 requires a GitHub workflow run ID.");
  const plan = planPriorityThreeSeedSearchQueries(data.catalog, data.coverageRows, { excludedVariantIds: manualCanarySelectionOptions(profile).excludedVariantIds, maxVariantsPerSeries: 1, limit, rotationKey: `priority-3-bounded-seed-v2:${runId}` });
  const selectedSeriesIds = plan.selected.map((entry) => String(entry.seriesId ?? "").trim());
  if (plan.selected.length > limit || plan.queries.length !== plan.selected.length || selectedSeriesIds.some((id) => !id) || new Set(selectedSeriesIds).size !== selectedSeriesIds.length || plan.queries.some((query) => query.query_profile !== PRIORITY_THREE_SEED_QUERY_PROFILE)) {
    throw new Error("P3 bounded seed v2 collection contract is invalid.");
  }
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog: data.catalog, queries: plan.queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS }));
  const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog: data.catalog });
  report = buildSanitizedMarketCandidateAudit({
    records: safety.records, queryPlan: plan.queries, catalog: data.catalog,
    runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT, head_sha: process.env.GITHUB_SHA, event_name: process.env.GITHUB_EVENT_NAME },
    summary: { safety_assessed_records: safety.records.filter((row) => row.market_safety_assessed).length, no_result_variants: calculateP3BoundedSeedNoResultVariants(plan.selected.length, safety.summary.variants_with_results), listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 },
  });
  fs.writeFileSync(path.join(output, "market-candidate-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-candidate-audit.md"), renderMarketCandidateAuditMarkdown(report));
  if (report.result.report_complete !== true || Number(report.result.truncated_count) !== 0) throw new Error("P3 bounded seed v2 retrieval is incomplete.");
  selection = selectP3BoundedSeedV2Candidates(report.candidates, { limit });
  before = await store.fetchCounts();
  if (!selection.selected.length) {
    writeResult(buildP3BoundedSeedV2Result({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after: await store.fetchCounts(), status: "no-op" }));
    console.log(JSON.stringify({ ok: true, status: "no-op", database_writes: 0 }));
  } else {
    const rows = buildP3BoundedSeedV2Rows({ candidates: selection.selected, workflow: workflowIdentity() });
    const [variantIdRows, matchedVariantRows, sourceUrlRows, existingListings, existingObservations] = await Promise.all([
      store.fetchRowsByVariantIds(rows.listingRows.map((row) => row.variant_id)), store.fetchRowsByMatchedVariantIds(rows.listingRows.map((row) => row.variant_id)),
      store.fetchRowsBySourceUrls(rows.listingRows.map((row) => row.source_url)), store.fetchRowsByIds("market_listings", rows.listingRows.map((row) => row.id)), store.fetchRowsByIds("market_listing_observations", rows.observationRows.map((row) => row.id)),
    ]);
    assertP3BoundedSeedV2Prewrite({ rows, variantListings: [...variantIdRows, ...matchedVariantRows], sourceUrlRows, existingListings, existingObservations });
    const outcome = await persistP3BoundedSeedV2({ rows, store });
    writeResult(buildP3BoundedSeedV2Result({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after: await store.fetchCounts(), outcome, status: "succeeded" }));
    console.log(JSON.stringify({ ok: true, status: "succeeded", database_writes: outcome.database_writes }));
  }
} catch (error) {
  const rollback = error?.bounded_result?.rollback;
  const status = rollback?.attempted ? rollback.verified ? "rolled-back" : "rollback-failed" : "blocked";
  writeResult(buildP3BoundedSeedV2Result({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after: await safeCounts(store), error, status }));
  throw error;
}

function workflowIdentity() { return { run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA }; }
function writeResult(result) { fs.writeFileSync(path.join(output, "market-p3-bounded-seed-v2-result.json"), `${JSON.stringify(result, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-p3-bounded-seed-v2-result.md"), renderP3BoundedSeedV2ResultMarkdown(result)); }
function createStore() { return { fetchRowsByIds: (table, ids) => fetchIn(table, "id", ids, "*"), fetchRowsByVariantIds: (ids) => fetchIn("market_listings", "variant_id", ids, "id,variant_id"), fetchRowsByMatchedVariantIds: (ids) => fetchIn("market_listings", "matched_variant_id", ids, "id,matched_variant_id"), fetchRowsBySourceUrls: (urls) => fetchIn("market_listings", "source_url", urls, "id,variant_id,source_url"), fetchCounts: async () => { const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"]; const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]); return Object.fromEntries([...tables, "review_required"].map((key, index) => [key, values[index]])); }, upsertRows: (table, rows, writeOptions) => upsertRows(table, rows, { ...writeOptions, label: "market-p3-bounded-seed-v2", allowSchemaFallback: false }), deleteRowsByIds: (table, ids, deleteOptions) => deleteRowsByIds(table, ids, deleteOptions), fetchObservationsByListingIds: (ids) => fetchIn("market_listing_observations", "listing_id", ids, "*") }; }
function fetchIn(table, column, values, select) { if (!values.length) return []; const escaped = values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(","); return fetchRows(table, { select, pageSize: 100, params: { [column]: `in.(${escaped})`, order: "id.asc" } }); }
async function safeCounts(value) { try { return await value.fetchCounts(); } catch { return null; } }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
