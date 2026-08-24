import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";
import { fetchMarketListingsRaw, assertMarketFetchComplete, MARKET_SOURCE_SCOPES } from "../lib/fetchers/market-fetcher.js";
import { applyMarketCandidateSafety, summarizeFetchedMarketCandidates } from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { buildRecallV5Comparison, buildRecallV5Decision, buildRecallV5VariantArm, runRecallV5ArmsSequentially } from "../lib/domain/market-p3-recall-v5-diagnostic.js";
import { isPublicVariant } from "../lib/domain/variant-publication.js";
import { buildPriorityThreeSeedQueriesForVariant, buildPriorityThreeSeedRecallV4QueriesForVariant, buildPriorityThreeSeedRecallV5QueriesForVariant } from "../lib/fetchers/market-seed-query-planner.js";

const SAMPLE_IDS = ["gashapon-4582769888397000-常陸院光", "gashapon-4570118252456000-大谷-翔平-ロサンゼルス・ドジャース", "gashapon-4582769968419000-アサ", "gashapon-4582769979064000-スヌーピーb", "gashapon-4582769935848000-福岡ソフトバンクホークス", "gashapon-4582770054088000-ミルキィローズ", "gashapon-4582769832307000-ネネちゃんうさぎ", "tarts-y094156-ポッチャマ-ノーマル", "gashapon-4582770026658000-まねき猫", "gashapon-4582770066258000-天の川コズミックワンショルダー-カラー・コズミックブルー-再録"];
const TABLES = ["market_listings", "market_listing_observations", "import_issues", "ingestion_runs", "series", "variants", "stock_reports", "restock_events"];
const output = path.resolve(readOption("output-dir") || "market-p3-recall-v5-diagnostic"); fs.mkdirSync(output, { recursive: true });
let before = null; const results = {};
try {
  const catalog = await loadOfficialCatalog();
  const targets = SAMPLE_IDS.map((id) => catalog.variantById?.get(id) ?? (catalog.variants ?? []).find((entry) => entry.id === id));
  if (targets.some((entry) => !entry || !isPublicVariant(entry))) throw new Error("P3 recall v5 sample is missing or not public.");
  const series = targets.map((entry) => catalog.seriesById?.get(entry.series_id) ?? (catalog.series ?? []).find((parent) => parent.id === entry.series_id));
  if (series.some((entry) => !entry)) throw new Error("P3 recall v5 parent series is missing.");
  before = await snapshotCounts();
  const arms = [["v2", buildPriorityThreeSeedQueriesForVariant], ["v4", buildPriorityThreeSeedRecallV4QueriesForVariant], ["v5", buildPriorityThreeSeedRecallV5QueriesForVariant]];
  Object.assign(results, await runRecallV5ArmsSequentially(arms, (name, planner) => runArm({ name, planner, targets, series, catalog }), results));
  const after = await snapshotCounts(); if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("P3 recall v5 database delta is not zero.");
  const comparison = buildRecallV5Comparison(targets, series, results); const decision = buildRecallV5Decision(results, comparison, true);
  if (decision.provider_errors) throw new Error("P3 recall v5 provider contamination.");
  write({ schema_version: 1, workflow: { run_id: safe(process.env.GITHUB_RUN_ID, 40), head_sha: safeHead(process.env.GITHUB_SHA) }, sample_variant_ids: SAMPLE_IDS, production_counts_before: before, production_counts_after: after, database_writes: 0, zero_delta_verified: true, arms: results, per_variant_comparison: comparison, decision });
} catch (error) {
  let after = null; try { after = before ? await snapshotCounts() : null; } catch { /* artifact retains prior safe state */ }
  write({ schema_version: 1, status: "blocked", workflow: { run_id: safe(process.env.GITHUB_RUN_ID, 40), head_sha: safeHead(process.env.GITHUB_SHA) }, sample_variant_ids: SAMPLE_IDS, production_counts_before: before, production_counts_after: after, database_writes: 0, zero_delta_verified: before && after ? JSON.stringify(before) === JSON.stringify(after) : false, arms: results, failure: { reason: "p3_recall_v5_diagnostic_failed", ...(error.diagnostic_failure ?? {}) } }); throw error;
}
async function runArm({ name, planner, targets, series, catalog }) {
  const queries = targets.flatMap((variant, index) => planner(variant, series[index]));
  if (queries.length !== SAMPLE_IDS.length || queries.some((query) => !query.query || !query.variant_id || !query.series_id || query.fallback_queries.length > 2)) throw new Error("P3 recall v5 query contract is invalid.");
  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({ catalog, queries, sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS, rakuten: { queryLimit: 10 }, yahoo: { queryLimit: 10 } }));
  const safety = applyMarketCandidateSafety({ records: fetched.records, queryPlan: queries, catalog }); const diagnostics = buildSanitizedMarketRequestDiagnostics(fetched.feedResults ?? [], fetched.duplicateQueriesSkipped ?? 0);
  const candidateSummary = summarizeFetchedMarketCandidates({ records: safety.records, rawCount: fetched.count, queryPlan: queries, feedResults: fetched.feedResults, catalog, safetyResult: safety });
  const audit = buildSanitizedMarketCandidateAudit({ records: safety.records, queryPlan: queries, catalog, runContext: { mode: "dry-run", source_scope: "planner-apis", run_id: process.env.GITHUB_RUN_ID, head_sha: process.env.GITHUB_SHA, event_name: "workflow_dispatch" }, summary: { ...candidateSummary, request_diagnostics: diagnostics, no_result_variants: Math.max(0, targets.length - candidateSummary.variants_with_results), listing_upserts: 0, observations_created: 0, ingestion_runs_written: 0 } });
  const metrics = { ...audit.result, raw_results_returned: diagnostics.aggregate.results_returned, normalized_records: diagnostics.aggregate.normalized_records, variants_with_results: candidateSummary.variants_with_results, accepted_unique_variant_count: new Set(audit.candidates.filter((candidate) => candidate.assessment?.accepted).map((candidate) => candidate.target?.variant_id)).size, active_accepted_unique_variant_count: new Set(audit.candidates.filter((candidate) => candidate.assessment?.accepted && candidate.listing?.status === "active").map((candidate) => candidate.target?.variant_id)).size, rejection_reason_counts: audit.retrieval_effectiveness.rejection_reason_counts };
  return { name, provider_root_limits: { rakuten: 10, yahoo: 10 }, query_profile: queries[0].query_profile, selected_variant_count: targets.length, root_query_count: queries.length, query_attempt_count: queries.reduce((sum, query) => sum + 1 + query.fallback_queries.length, 0), metrics, request_diagnostics: diagnostics, per_variant: queries.map((query) => buildRecallV5VariantArm(query, safety.records, audit.candidates, diagnostics)) };
}
async function snapshotCounts() { const values = await Promise.all(TABLES.map((table) => fetchRowCount(table))); return Object.fromEntries(TABLES.map((table, index) => [table, values[index]])); }
function write(value) { fs.writeFileSync(path.join(output, "market-p3-recall-v5-diagnostic.json"), `${JSON.stringify(value, null, 2)}\n`); fs.writeFileSync(path.join(output, "market-p3-recall-v5-diagnostic.md"), markdown(value)); }
function markdown(value) { const lines = ["# P3 Recall V5 Diagnostic", `- Run: ${value.workflow?.run_id || "unknown"}`, `- Head SHA: ${value.workflow?.head_sha || "unknown"}`, `- Sample IDs: ${(value.sample_variant_ids ?? []).join(", ")}`, `- Database writes: ${value.database_writes}`, `- Zero delta verified: ${value.zero_delta_verified === true}`, "", "## Production counts", `- Before: ${JSON.stringify(value.production_counts_before)}`, `- After: ${JSON.stringify(value.production_counts_after)}`, ""]; for (const arm of Object.values(value.arms ?? {})) lines.push(`## Arm: ${arm.name}`, `- Metrics: ${JSON.stringify(arm.metrics)}`, `- Provider diagnostics: ${JSON.stringify(arm.request_diagnostics?.aggregate ?? {})}`, ""); lines.push("## Per-variant comparison", "| Series | Variant | V2 | V4 | V5 | V5 added |", "|---|---|---:|---:|---:|---|"); for (const row of value.per_variant_comparison ?? []) lines.push(`| ${md(row.official_series)} | ${md(row.official_variant)} | ${row.v2_candidate_count ?? 0} | ${row.v4_candidate_count ?? 0} | ${row.v5_candidate_count ?? 0} | ${row.v5_added_result === true} |`); lines.push("", "## V5-only retrievals", "| Provider | Query | Title | Status | Type | Confidence | Accepted | Reason |", "|---|---|---|---|---|---:|---|---|"); for (const record of (value.per_variant_comparison ?? []).flatMap((row) => row.v5_only_records ?? [])) lines.push(`| ${md(record.provider)} | ${md(record.executed_query)} | ${md(record.title)} | ${md(record.status)} | ${md(record.listing_type)} | ${record.confidence} | ${record.accepted} | ${md(record.safety_reason)} |`); lines.push("", "## Decision", `- ${JSON.stringify(value.decision ?? {})}`); return `${lines.join("\n")}\n`; }
function md(value) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069﻿|\r\n]/g, " ").slice(0, 300); }
function readOption(key) { const prefix = `--${key}=`; return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ""; }
function safe(value, max) { return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, max); }
function safeHead(value) { const text = String(value ?? ""); return /^[0-9a-f]{40}$/.test(text) ? text : null; }
