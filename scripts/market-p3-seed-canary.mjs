import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { fetchMarketListingsRaw, MARKET_SOURCE_SCOPES, assertMarketFetchComplete } from "../lib/fetchers/market-fetcher.js";
import { buildMarketSearchQueriesForVariant } from "../lib/fetchers/market-query-planner.js";
import { applyMarketCandidateSafety } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit, renderMarketCandidateAuditMarkdown } from "../lib/domain/market-candidate-audit.js";
import { buildP3SeedCanaryRows, loadP3SeedCanaryTarget, persistP3SeedCanary, selectExactP3SeedCanaryCandidate, validateP3SeedCanaryInvocation } from "../lib/domain/market-p3-seed-canary.js";
import { deleteRowsByIds, fetchRowCount, fetchRows, upsertRows } from "./supabase-rest.mjs";

const options = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => { const [key, ...rest] = arg.slice(2).split("="); return [key, rest.join("=")]; }));
const target = loadP3SeedCanaryTarget(fs.readFileSync(path.resolve(options.target || "config/market-p3-seed-canary-target.json"), "utf8"));
validateP3SeedCanaryInvocation({ event_name: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, confirmation: process.env.P3_SEED_CANARY_CONFIRMATION, expected_main_sha: options["expected-main-sha"], head_sha: process.env.GITHUB_SHA, origin_main_sha: options["origin-main-sha"] });
const catalog = await loadOfficialCatalog();
const variant = catalog.variantById.get(target.variant_id); const series = catalog.seriesById.get(target.series_id);
if (!variant || !series || variant.series_id !== target.series_id) throw new Error("Fixed P3 target is absent from the current public catalog.");
const queries = buildMarketSearchQueriesForVariant(variant, series).map((query) => ({ ...query, priority: 3, priority_reason: "recent_release_without_evidence", coverage_state: "priority_3_seed" }));
if (queries.length !== 1) throw new Error("Fixed P3 target did not produce one strict query plan.");
const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog, queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS }));
const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: queries, catalog });
const report = buildSanitizedMarketCandidateAudit({ records: safety.records, queryPlan: queries, catalog, runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT, head_sha: process.env.GITHUB_SHA, event_name: process.env.GITHUB_EVENT_NAME }, summary: { safety_assessed_records: safety.records.filter((row) => row.market_safety_assessed).length, listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 } });
const candidate = selectExactP3SeedCanaryCandidate(report.candidates, target);
const output = path.resolve(options["output-dir"] || "market-p3-seed-canary"); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "market-p3-seed-canary-live-audit.json"), `${JSON.stringify({ report, selected_candidate_key: candidate.candidate_key }, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-p3-seed-canary-live-audit.md"), renderMarketCandidateAuditMarkdown(report));
if (options.persist !== "true") {
  console.log(JSON.stringify({ ok: true, candidate_key: candidate.candidate_key, database_writes: 0 }));
} else {
  const rows = buildP3SeedCanaryRows({ candidate, target, workflow: { run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT, head_sha: process.env.GITHUB_SHA } });
  const store = createStore();
  const [existingListings, existingObservations] = await Promise.all([
    store.fetchRowsByIds("market_listings", rows.listingRows.map((row) => row.id)),
    store.fetchRowsByIds("market_listing_observations", rows.observationRows.map((row) => row.id)),
  ]);
  if (existingListings.length || existingObservations.length) throw new Error("P3 seed canary target is already persisted; refusing idempotent rewrite.");
  const outcome = await persistP3SeedCanary({ rows, store });
  const result = { schema_version: 1, target: { variant_id: target.variant_id, series_id: target.series_id, provider: target.provider, source_listing_id: target.source_listing_id, public_url: target.public_url }, fresh_revalidation: true, candidate_key: candidate.candidate_key, database_writes: outcome.database_writes, database_deltas: outcome.database_deltas, verification: outcome.verification, rollback: outcome.rollback };
  fs.writeFileSync(path.join(output, "market-p3-seed-canary-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ok: outcome.ok, candidate_key: candidate.candidate_key, database_writes: outcome.database_writes }));
}

function createStore() {
  return {
    fetchRowsByIds: (table, ids) => ids.length ? fetchRows(table, { select: "*", pageSize: 1, params: { id: `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`, order: "id.asc" } }) : [],
    fetchCounts: async () => {
      const tables = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
      const values = await Promise.all([...tables.map((table) => fetchRowCount(table)), fetchRowCount("market_listings", { review_required: "eq.true" })]);
      return Object.fromEntries([...tables, "review_required"].map((key, index) => [key, values[index]]));
    },
    upsertRows: (table, rows, options) => upsertRows(table, rows, { ...options, label: "market-p3-seed-canary", allowSchemaFallback: false }),
    deleteRowsByIds: (table, ids, options) => deleteRowsByIds(table, ids, options),
    fetchObservationsByListingIds: (ids) => ids.length ? fetchRows("market_listing_observations", { select: "*", pageSize: 1, params: { listing_id: `in.(${ids.map((id) => `\"${String(id).replaceAll('"', '\\"')}\"`).join(",")})`, order: "id.asc" } }) : [],
  };
}
