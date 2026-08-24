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
  assertP3BoundedSeedPrewrite,
  buildP3BoundedSeedResult,
  buildP3BoundedSeedRows,
  parseP3BoundedSeedLimit,
  persistP3BoundedSeed,
  renderP3BoundedSeedResultMarkdown,
  selectP3BoundedSeedCandidates,
  validateP3BoundedSeedInvocation,
} from "../lib/domain/market-p3-bounded-seed.js";

const options = parseOptions(process.argv.slice(2));
const limit = parseP3BoundedSeedLimit(options.limit);
validateP3BoundedSeedInvocation({
  event_name: process.env.GITHUB_EVENT_NAME,
  ref: process.env.GITHUB_REF,
  confirmation: process.env.P3_BOUNDED_SEED_CONFIRMATION,
  expected_main_sha: options["expected-main-sha"],
  head_sha: process.env.GITHUB_SHA,
  origin_main_sha: options["origin-main-sha"],
});

const output = path.resolve(options["output-dir"] || "market-p3-bounded-seed");
fs.mkdirSync(output, { recursive: true });
const store = createStore();
let report = null;
let selection = { selected: [], safe_candidate_count: 0, one_listing_per_variant: true };
let before = null;

try {
  const data = await loadMarketCoverageData({ catalog: await loadOfficialCatalog() });
  const profile = loadMarketManualCanarySelectionProfile(path.resolve("config/market-manual-canary-selection.json"));
  const rotationKey = priorityThreeBoundedSeedRotationKey();
  const plan = planPriorityThreeSeedSearchQueries(data.catalog, data.coverageRows, {
    ...manualCanarySelectionOptions(profile),
    limit,
    rotationKey,
  });
  if (plan.selected.length > limit || plan.queries.length !== plan.selected.length
    || plan.queries.some((query) => query.query_profile !== PRIORITY_THREE_SEED_QUERY_PROFILE)) {
    throw new Error("P3 bounded seed collection contract is invalid.");
  }
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({
    catalog: data.catalog,
    queries: plan.queries,
    sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS,
  }));
  const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: plan.queries, catalog: data.catalog });
  report = buildSanitizedMarketCandidateAudit({
    records: safety.records,
    queryPlan: plan.queries,
    catalog: data.catalog,
    runContext: {
      mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT, head_sha: process.env.GITHUB_SHA, event_name: process.env.GITHUB_EVENT_NAME,
    },
    summary: {
      safety_assessed_records: safety.records.filter((row) => row.market_safety_assessed).length,
      listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0,
    },
  });
  fs.writeFileSync(path.join(output, "market-candidate-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-candidate-audit.md"), renderMarketCandidateAuditMarkdown(report));
  if (report.result.report_complete !== true || Number(report.result.truncated_count) !== 0) {
    throw new Error("P3 bounded seed retrieval is incomplete.");
  }
  selection = selectP3BoundedSeedCandidates(report.candidates, { limit });
  before = await store.fetchCounts();
  if (!selection.selected.length) {
    const after = await store.fetchCounts();
    writeResult(buildP3BoundedSeedResult({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after, status: "no-op" }));
    console.log(JSON.stringify({ ok: true, status: "no-op", database_writes: 0 }));
  } else {
    const rows = buildP3BoundedSeedRows({ candidates: selection.selected, workflow: workflowIdentity() });
    const [variantListings, sourceUrlRows, existingListings, existingObservations] = await Promise.all([
      store.fetchRowsByVariantIds(rows.listingRows.map((row) => row.variant_id)),
      store.fetchRowsBySourceUrls(rows.listingRows.map((row) => row.source_url)),
      store.fetchRowsByIds("market_listings", rows.listingRows.map((row) => row.id)),
      store.fetchRowsByIds("market_listing_observations", rows.observationRows.map((row) => row.id)),
    ]);
    assertP3BoundedSeedPrewrite({ rows, variantListings, sourceUrlRows, existingListings, existingObservations });
    const outcome = await persistP3BoundedSeed({ rows, store });
    const after = await store.fetchCounts();
    writeResult(buildP3BoundedSeedResult({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after, outcome, status: "succeeded" }));
    console.log(JSON.stringify({ ok: true, status: "succeeded", database_writes: outcome.database_writes }));
  }
} catch (error) {
  const after = await safeCounts(store);
  const rollback = error?.bounded_result?.rollback;
  const status = rollback?.attempted ? rollback.verified ? "rolled-back" : "rollback-failed" : "blocked";
  writeResult(buildP3BoundedSeedResult({ workflow: workflowIdentity(), requested_limit: limit, selection, report, before, after, error, status }));
  throw error;
}

function priorityThreeBoundedSeedRotationKey() {
  const runId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  if (!/^\d+$/.test(runId)) throw new Error("P3 bounded seed requires a GitHub workflow run ID.");
  return `priority-3-bounded-seed-v1:${runId}`;
}

function workflowIdentity() {
  return { run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA };
}

function writeResult(result) {
  fs.writeFileSync(path.join(output, "market-p3-bounded-seed-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "market-p3-bounded-seed-result.md"), renderP3BoundedSeedResultMarkdown(result));
}

function createStore() {
  return {
    fetchRowsByIds: (table, ids) => fetchIn(table, "id", ids, "*"),
    fetchRowsByVariantIds: (ids) => fetchIn("market_listings", "variant_id", ids, "id,variant_id"),
    fetchRowsBySourceUrls: (urls) => fetchIn("market_listings", "source_url", urls, "id,variant_id,source_url"),
    fetchCounts: async () => {
      const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
      const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]);
      return Object.fromEntries([...tables, "review_required"].map((key, index) => [key, values[index]]));
    },
    upsertRows: (table, rows, writeOptions) => upsertRows(table, rows, { ...writeOptions, label: "market-p3-bounded-seed", allowSchemaFallback: false }),
    deleteRowsByIds: (table, ids, deleteOptions) => deleteRowsByIds(table, ids, deleteOptions),
    fetchObservationsByListingIds: (ids) => fetchIn("market_listing_observations", "listing_id", ids, "*"),
  };
}

function fetchIn(table, column, values, select) {
  if (!values.length) return [];
  const escaped = values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",");
  return fetchRows(table, { select, pageSize: 100, params: { [column]: `in.(${escaped})`, order: "id.asc" } });
}

async function safeCounts(store) { try { return await store.fetchCounts(); } catch { return null; } }
function parseOptions(args) { return Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; })); }
