import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";
import { fetchMarketListingsRaw, assertMarketFetchComplete, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { applyMarketCandidateSafety } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketCandidateAudit, renderMarketCandidateAuditMarkdown } from "../lib/domain/market-candidate-audit.js";
import { isPublicVariant } from "../lib/domain/variant-publication.js";
import { buildPriorityThreeSeedQueriesForVariant, buildPriorityThreeSeedRecallV3QueriesForVariant } from "../lib/fetchers/market-seed-query-planner.js";

const SAMPLE_IDS = ["gashapon-4582769888397000-常陸院光", "gashapon-4570118252456000-大谷-翔平-ロサンゼルス・ドジャース", "gashapon-4582769968419000-アサ", "gashapon-4582769979064000-スヌーピーb", "gashapon-4582769935848000-福岡ソフトバンクホークス", "gashapon-4582770054088000-ミルキィローズ", "gashapon-4582769832307000-ネネちゃんうさぎ", "tarts-y094156-ポッチャマ-ノーマル", "gashapon-4582770026658000-まねき猫", "gashapon-4582770066258000-天の川コズミックワンショルダー-カラー・コズミックブルー-再録"];
const TABLES = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
const output = path.resolve(readOption("output-dir") || "market-p3-recall-v3-diagnostic");
fs.mkdirSync(output, { recursive: true });

let before = null;
try {
  const catalog = await loadOfficialCatalog();
  const targets = SAMPLE_IDS.map((id) => catalog.variantById?.get(id) ?? (catalog.variants ?? []).find((variant) => variant.id === id));
  if (targets.some((variant) => !variant || !isPublicVariant(variant))) throw new Error("P3 recall v3 sample is missing or not public.");
  const series = targets.map((variant) => catalog.seriesById?.get(variant.series_id) ?? (catalog.series ?? []).find((entry) => entry.id === variant.series_id));
  if (series.some((entry) => !entry)) throw new Error("P3 recall v3 sample parent series is missing.");
  before = await snapshotCounts();
  const arms = [
    ["v2_baseline", buildPriorityThreeSeedQueriesForVariant, 8, 24],
    ["v2_full_provider_coverage", buildPriorityThreeSeedQueriesForVariant, 10, 10],
    ["recall_v3", buildPriorityThreeSeedRecallV3QueriesForVariant, 10, 10],
  ];
  const results = {};
  for (const [name, planner, rakutenLimit, yahooLimit] of arms) results[name] = await runArm({ name, planner, rakutenLimit, yahooLimit, targets, series, catalog });
  const after = await snapshotCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("P3 recall v3 diagnostic database delta is not zero.");
  const result = { schema_version: 1, workflow: { run_id: safe(process.env.GITHUB_RUN_ID, 40), head_sha: safeHead(process.env.GITHUB_SHA) }, sample_variant_ids: SAMPLE_IDS, production_counts_before: before, production_counts_after: after, database_writes: 0, arms: results };
  write(result);
} catch (error) {
  write({ schema_version: 1, status: "blocked", workflow: { run_id: safe(process.env.GITHUB_RUN_ID, 40), head_sha: safeHead(process.env.GITHUB_SHA) }, sample_variant_ids: SAMPLE_IDS, production_counts_before: before, production_counts_after: null, database_writes: 0, failure: { reason: "p3_recall_v3_diagnostic_failed" } });
  throw error;
}

async function runArm({ name, planner, rakutenLimit, yahooLimit, targets, series, catalog }) {
  const queries = targets.flatMap((variant, index) => planner(variant, series[index]));
  if (queries.length !== SAMPLE_IDS.length || queries.some((query) => !query.query || !query.variant_id || !query.series_id || (query.fallback_queries ?? []).length > 2)) throw new Error("P3 recall v3 query contract is invalid.");
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog, queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS, rakuten: { queryLimit: rakutenLimit }, yahoo: { queryLimit: yahooLimit } }));
  const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: queries, catalog });
  const audit = buildSanitizedMarketCandidateAudit({ records: safety.records, queryPlan: queries, catalog, runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA, event_name: "workflow_dispatch" }, summary: { safety_assessed_records: safety.records.filter((row) => row.market_safety_assessed).length, listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 } });
  return { name, provider_root_limits: { rakuten: rakutenLimit, yahoo: yahooLimit }, query_profile: queries[0]?.query_profile ?? "unknown", selected_variant_count: targets.length, root_query_count: queries.length, query_attempt_count: queries.reduce((count, query) => count + 1 + (query.fallback_queries?.length ?? 0), 0), metrics: audit.result, request_diagnostics: audit.request_diagnostics, per_variant: queries.map((query) => ({ variant_id: query.variant_id, series_id: query.series_id, root_query: query.root_query ?? query.query, fallback_queries: query.fallback_queries ?? [] })) };
}
async function snapshotCounts() { const values = await Promise.all(TABLES.map((table) => fetchRowCount(table))); return Object.fromEntries(TABLES.map((table, index) => [table, values[index]])); }
function write(value) { fs.writeFileSync(path.join(output, "market-p3-recall-v3-diagnostic.json"), `${JSON.stringify(value, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-p3-recall-v3-diagnostic.md"), renderMarketCandidateAuditMarkdown({ schema_version: 1, result: { candidate_count: 0, accepted_count: 0, review_count: 0 }, candidates: [] })); }
function readOption(key) { const prefix = `--${key}=`; return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? ""; }
function safe(value, max) { return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, max); }
function safeHead(value) { const text = String(value ?? ""); return /^[0-9a-f]{40}$/.test(text) ? text : null; }
