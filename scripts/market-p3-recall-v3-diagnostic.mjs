import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";
import { fetchMarketListingsRaw, assertMarketFetchComplete, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
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
  const result = { schema_version: 1, workflow: { run_id: safe(process.env.GITHUB_RUN_ID, 40), head_sha: safeHead(process.env.GITHUB_SHA) }, sample_variant_ids: SAMPLE_IDS, production_counts_before: before, production_counts_after: after, database_writes: 0, zero_delta_verified: true, arms: results, per_variant_comparison: buildComparison(targets, series, results) };
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
  const candidateSummary = summarizeFetchedMarketCandidates({ records: safety.records, rawCount: fetched.count, queryPlan: queries, feedResults: fetched.feedResults, catalog, safetyResult: safety });
  const request_diagnostics = buildSanitizedMarketRequestDiagnostics(fetched.feedResults ?? [], fetched.duplicateQueriesSkipped ?? 0);
  const summary = { ...candidateSummary, source_scope: "planner-apis", approved_feed_sources_configured: 0, planner_api_sources_configured: fetched.plannerApiSourcesConfigured ?? 0, approved_feed_requests_attempted: 0, planner_api_requests_attempted: fetched.plannerApiRequestsAttempted ?? 0, rakuten_requests_attempted: fetched.rakutenRequestsAttempted ?? 0, yahoo_requests_attempted: fetched.yahooRequestsAttempted ?? 0, requests_retried: fetched.requests_retried ?? 0, retry_attempts_total: fetched.retry_attempts_total ?? 0, requests_timed_out: fetched.requests_timed_out ?? 0, requests_rate_limited: fetched.requests_rate_limited ?? 0, requests_permanently_failed: fetched.requests_permanently_failed ?? 0, request_diagnostics, no_result_variants: Math.max(0, targets.length - candidateSummary.variants_with_results), listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 };
  const audit = buildSanitizedMarketCandidateAudit({ records: safety.records, queryPlan: queries, catalog, runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA, event_name: "workflow_dispatch" }, summary });
  const metrics = {
    ...audit.result,
    raw_results_returned: request_diagnostics.aggregate.results_returned,
    normalized_records: request_diagnostics.aggregate.normalized_records,
    variants_with_results: candidateSummary.variants_with_results,
    accepted_unique_variant_count: new Set(audit.candidates.filter((candidate) => candidate.assessment?.accepted === true).map((candidate) => candidate.target?.variant_id)).size,
    active_accepted_unique_variant_count: new Set(audit.candidates.filter((candidate) => candidate.assessment?.accepted === true && candidate.listing?.status === "active").map((candidate) => candidate.target?.variant_id)).size,
    rejection_reason_counts: audit.retrieval_effectiveness.rejection_reason_counts,
  };
  const providersQueried = [
    ...(request_diagnostics.providers.rakuten_ichiba ? ["rakuten_ichiba"] : []),
    ...(request_diagnostics.providers.yahoo_shopping ? ["yahoo_shopping"] : []),
  ];
  return { name, provider_root_limits: { rakuten: rakutenLimit, yahoo: yahooLimit }, query_profile: queries[0]?.query_profile ?? "unknown", selected_variant_count: targets.length, root_query_count: queries.length, query_attempt_count: queries.reduce((count, query) => count + 1 + (query.fallback_queries?.length ?? 0), 0), metrics, retrieval_effectiveness: audit.retrieval_effectiveness, request_diagnostics, per_variant: queries.map((query) => variantArm(query, safety.records, audit.candidates, providersQueried)) };
}
async function snapshotCounts() { const values = await Promise.all(TABLES.map((table) => fetchRowCount(table))); return Object.fromEntries(TABLES.map((table, index) => [table, values[index]])); }
function variantArm(query, records, candidates, providersQueried) { const matching = records.filter((record) => record.raw?.query?.variant_id === query.variant_id); const matchedCandidates = candidates.filter((candidate) => candidate.target?.variant_id === query.variant_id); return { variant_id: query.variant_id, series_id: query.series_id, root_query: safeText(query.root_query ?? query.query, 300), fallback_queries: (query.fallback_queries ?? []).map((value) => safeText(value, 300)), providers_queried: providersQueried, rakuten_result_count: matching.filter((record) => record.source === "rakuten_ichiba").length, yahoo_result_count: matching.filter((record) => record.source === "yahoo_shopping").length, candidate_count: matchedCandidates.length, accepted: matchedCandidates.some((candidate) => candidate.assessment?.accepted === true), review: matchedCandidates.some((candidate) => candidate.assessment?.review_required === true), safety_reasons: [...new Set(matchedCandidates.map((candidate) => candidate.assessment?.reason).filter(Boolean))].sort(), executed_query: safeText(matching[0]?.raw?.executed_query ?? matching[0]?.raw?.query?.query ?? "", 300) }; }
function buildComparison(targets, series, arms) { return targets.map((variant, index) => { const id = variant.id; const base = arms.v2_baseline.per_variant[index]; const full = arms.v2_full_provider_coverage.per_variant[index]; const v3 = arms.recall_v3.per_variant[index]; const baseHasResult = base.rakuten_result_count + base.yahoo_result_count > 0; const fullHasResult = full.rakuten_result_count + full.yahoo_result_count > 0; return { variant_id: id, official_series: safeText(series[index]?.name, 300), official_variant: safeText(variant.name, 300), root_query: v3.root_query, fallback_queries: v3.fallback_queries, providers_queried: v3.providers_queried, rakuten_result_count: v3.rakuten_result_count, yahoo_result_count: v3.yahoo_result_count, baseline_has_result: baseHasResult, full_provider_added_result: !baseHasResult && fullHasResult, recall_v3_added_result: !fullHasResult && v3.rakuten_result_count + v3.yahoo_result_count > 0, candidate_count: { baseline: base.candidate_count, full_provider: full.candidate_count, recall_v3: v3.candidate_count }, accepted: v3.accepted, review: v3.review, safety_reasons: v3.safety_reasons, executed_query: v3.executed_query }; }); }
function write(value) { fs.writeFileSync(path.join(output, "market-p3-recall-v3-diagnostic.json"), `${JSON.stringify(value, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-p3-recall-v3-diagnostic.md"), renderDiagnosticMarkdown(value)); }
function renderDiagnosticMarkdown(value) { const lines = ["# P3 Recall V3 Diagnostic", "", `- Run: ${value.workflow?.run_id || "unknown"}`, `- Head SHA: ${value.workflow?.head_sha || "unknown"}`, `- Fixed sample count: ${value.sample_variant_ids?.length || 0}`, `- Database writes: ${value.database_writes}`, `- Zero delta verified: ${value.zero_delta_verified === true}`, "", "## Production counts", "", `- Before: ${JSON.stringify(value.production_counts_before)}`, `- After: ${JSON.stringify(value.production_counts_after)}`, ""]; for (const arm of Object.values(value.arms ?? {})) { const aggregate = arm.request_diagnostics?.aggregate ?? {}; lines.push(`## Arm: ${arm.name}`, "", `- Query profile: ${arm.query_profile}`, `- Candidates / accepted / review: ${arm.metrics?.candidate_count ?? 0} / ${arm.metrics?.accepted_count ?? 0} / ${arm.metrics?.review_count ?? 0}`, `- No-result variants: ${arm.metrics?.no_result_variant_count ?? 0}`, `- Raw results / normalized records: ${arm.metrics?.raw_results_returned ?? 0} / ${arm.metrics?.normalized_records ?? 0}`, `- Requests attempted / retried / rate-limited / timed out: ${aggregate.requests_attempted ?? 0} / ${aggregate.requests_retried ?? 0} / ${aggregate.requests_rate_limited ?? 0} / ${aggregate.requests_timed_out ?? 0}`, `- Provider coverage: Rakuten ${arm.request_diagnostics?.providers?.rakuten_ichiba?.requests_attempted ?? 0}, Yahoo ${arm.request_diagnostics?.providers?.yahoo_shopping?.requests_attempted ?? 0}`, ""); } const rows = value.per_variant_comparison ?? []; lines.push("## Arm deltas", "", `- Full-provider added results: ${rows.filter((row) => row.full_provider_added_result).length}`, `- V3 recall wins: ${rows.filter((row) => row.recall_v3_added_result).length}`, "", "## Per-variant comparison", "", "| Variant | Baseline | Full provider added | V3 added | Executed query |", "| --- | --- | --- | --- | --- |"); for (const row of rows) lines.push(`| ${markdownCell(row.official_variant)} | ${row.baseline_has_result} | ${row.full_provider_added_result} | ${row.recall_v3_added_result} | ${markdownCell(row.executed_query || "none")} |`); return `${lines.join("\n")}\n`; }
function readOption(key) { const prefix = `--${key}=`; return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? ""; }
function safe(value, max) { return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, max); }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
function markdownCell(value) { return safeText(value, 300).replaceAll("|", "\\|"); }
function safeHead(value) { const text = String(value ?? ""); return /^[0-9a-f]{40}$/.test(text) ? text : null; }
