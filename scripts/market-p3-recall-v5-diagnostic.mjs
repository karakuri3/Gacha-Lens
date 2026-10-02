import fs from "node:fs";
import path from "node:path";
import { loadOfficialCatalog } from "./load-official-catalog.mjs";
import { loadMarketCoverageData } from "./market-coverage-data.mjs";
import { fetchRowCount } from "./supabase-rest.mjs";
import {
  fetchMarketListingsRaw,
  assertMarketFetchComplete,
  MARKET_SOURCE_SCOPES,
} from "../lib/fetchers/market-fetcher.js";
import {
  buildPriorityThreeSeedQueriesForVariant,
  buildPriorityThreeSeedRecallV4QueriesForVariant,
  buildPriorityThreeSeedRecallV5QueriesForVariant,
  planPriorityThreeSeedSearchQueries,
} from "../lib/fetchers/market-seed-query-planner.js";
import {
  MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT,
  MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST,
} from "../lib/fetchers/market-request-budget.js";
import {
  bindApprovedP3TargetPlan,
  parseApprovedP3TargetVariantIds,
} from "../lib/domain/market-p3-phase0-targets.js";
import {
  loadMarketManualCanarySelectionProfile,
  manualCanarySelectionOptions,
} from "../lib/domain/market-manual-canary-selection.js";
import {
  applyMarketCandidateSafety,
  summarizeFetchedMarketCandidates,
} from "../lib/domain/market-match-safety.js";
import { buildSanitizedMarketRequestDiagnostics } from "../lib/domain/market-request-diagnostics.js";
import { buildSanitizedMarketCandidateAudit } from "../lib/domain/market-candidate-audit.js";
import { providerContamination } from "../lib/domain/market-p3-recall-v4-diagnostic.js";
import {
  P3_RECALL_V5_DIAGNOSTIC_LIMIT,
  assertRecallV5DiagnosticQueryPlan,
  buildRecallV5Comparison,
  buildRecallV5Decision,
  buildRecallV5PreAuditMetrics,
  buildRecallV5VariantArm,
  runRecallV5ArmsSequentially,
  sanitizeRecallDiagnosticQueryPlan,
  validateP3RecallV5DiagnosticInvocation,
} from "../lib/domain/market-p3-recall-v5-diagnostic.js";

const TABLES = [
  "market_listings",
  "market_listing_observations",
  "import_issues",
  "ingestion_runs",
  "series",
  "variants",
  "stock_reports",
  "restock_events",
];
const output = path.resolve(readOption("output-dir") || "market-p3-recall-v5-diagnostic");
fs.mkdirSync(output, { recursive: true });

let approvedTargetVariantIds = [];
let exactTargetBinding = false;
let before = null;
const results = {};
const fallbackSafetyRejections = [];

try {
  validateP3RecallV5DiagnosticInvocation({
    event_name: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    confirmation: process.env.P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION,
    expected_main_sha: readOption("expected-main-sha"),
    head_sha: process.env.GITHUB_SHA,
    origin_main_sha: readOption("origin-main-sha"),
  });
  approvedTargetVariantIds = parseApprovedP3TargetVariantIds(
    process.env.P3_RECALL_V5_DIAGNOSTIC_APPROVED_TARGET_VARIANT_IDS_JSON,
    { limit: P3_RECALL_V5_DIAGNOSTIC_LIMIT },
  );

  const catalog = await loadOfficialCatalog();
  const coverage = await loadMarketCoverageData({ catalog });
  const profile = loadMarketManualCanarySelectionProfile(
    path.resolve("config/market-manual-canary-selection.json"),
  );
  const excludedVariantIds = manualCanarySelectionOptions(profile).excludedVariantIds;
  const approvedSet = new Set(approvedTargetVariantIds);
  const approvedCoverageRows = coverage.coverageRows.filter((row) => approvedSet.has(String(row.variantId ?? "")));

  let exactPlan = planPriorityThreeSeedSearchQueries(catalog, approvedCoverageRows, {
    excludedVariantIds,
    maxVariantsPerSeries: 1,
    limit: P3_RECALL_V5_DIAGNOSTIC_LIMIT,
    rotationKey: "p3-recall-v5-diagnostic-exact-targets",
  });
  exactPlan = bindApprovedP3TargetPlan({
    approvedTargetVariantIds,
    limit: P3_RECALL_V5_DIAGNOSTIC_LIMIT,
    plan: exactPlan,
    catalog,
  });
  exactTargetBinding = true;

  const targets = exactPlan.queries.map((query) => catalog.variantById?.get(query.variant_id));
  const series = exactPlan.queries.map((query) => catalog.seriesById?.get(query.series_id));
  if (targets.some((entry) => !entry) || series.some((entry) => !entry)) {
    throw new Error("P3 recall V5 approved catalog target is missing after exact binding.");
  }

  const v2Queries = buildArmQueries(buildPriorityThreeSeedQueriesForVariant, targets, series);
  if (v2Queries.some((query, index) => comparable(query.query) !== comparable(exactPlan.queries[index]?.query))) {
    throw new Error("P3 recall V5 diagnostic V2 root drifted from the approved strict plan.");
  }
  const rawArmPlans = [
    ["v2", v2Queries],
    ["v4", buildArmQueries(buildPriorityThreeSeedRecallV4QueriesForVariant, targets, series)],
    ["v5", buildArmQueries(buildPriorityThreeSeedRecallV5QueriesForVariant, targets, series)],
  ];
  const armPlans = rawArmPlans.map(([name, queries]) => {
    const sanitized = sanitizeRecallDiagnosticQueryPlan({
      name,
      queries,
      targets,
      series,
      catalog,
    });
    fallbackSafetyRejections.push(...sanitized.rejected_fallbacks);
    return [name, sanitized.queries];
  });
  for (const [name, queries] of armPlans) {
    assertRecallV5DiagnosticQueryPlan({ name, queries, targets, series, v2Queries });
  }

  before = await snapshotCounts();
  Object.assign(
    results,
    await runRecallV5ArmsSequentially(
      armPlans,
      (name, queries) => runArm({ name, queries, targets, catalog }),
      results,
    ),
  );
  const after = await snapshotCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("P3 recall V5 database delta is not zero.");
  }

  const comparison = buildRecallV5Comparison(targets, series, results);
  const decision = buildRecallV5Decision(results, comparison, true);
  if (decision.provider_errors) throw new Error("P3 recall V5 provider contamination.");

  write({
    schema_version: 2,
    status: "complete",
    workflow: {
      run_id: safe(process.env.GITHUB_RUN_ID, 40),
      head_sha: safeHead(process.env.GITHUB_SHA),
    },
    approved_target_variant_ids: approvedTargetVariantIds,
    exact_target_binding: exactTargetBinding,
    production_counts_before: before,
    production_counts_after: after,
    database_writes: 0,
    zero_delta_verified: true,
    fallback_safety_rejections: fallbackSafetyRejections,
    request_safety_contract: {
      source_scope: "planner-apis",
      allowed_providers: ["rakuten_ichiba", "yahoo_shopping"],
      provider_root_limits: { rakuten: 10, yahoo: 10 },
      max_query_attempts_per_root: MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT,
      max_retry_attempts_per_request: MARKET_MAX_RETRY_ATTEMPTS_PER_REQUEST,
      sequential_arm_execution: true,
      shared_market_concurrency: "gacha-market-bounded-v2",
      yahoo_request_delay_ms: 5000,
    },
    arms: results,
    per_variant_comparison: comparison,
    decision,
  });
} catch (error) {
  let after = null;
  try {
    after = before ? await snapshotCounts() : null;
  } catch {
    // Artifact retains the last safe read-only state.
  }
  write({
    schema_version: 2,
    status: "blocked",
    workflow: {
      run_id: safe(process.env.GITHUB_RUN_ID, 40),
      head_sha: safeHead(process.env.GITHUB_SHA),
    },
    approved_target_variant_ids: approvedTargetVariantIds,
    exact_target_binding: exactTargetBinding,
    fallback_safety_rejections: fallbackSafetyRejections,
    production_counts_before: before,
    production_counts_after: after,
    database_writes: 0,
    zero_delta_verified: before && after ? JSON.stringify(before) === JSON.stringify(after) : false,
    arms: results,
    failure: {
      reason: "p3_recall_v5_diagnostic_failed",
      ...(error.diagnostic_failure ?? {}),
    },
  });
  throw error;
}

function buildArmQueries(planner, targets, series) {
  return targets.flatMap((variant, index) => planner(variant, series[index]));
}

async function runArm({ name, queries, targets, catalog }) {
  if (
    queries.length !== P3_RECALL_V5_DIAGNOSTIC_LIMIT
    || queries.some((query) => (
      !query.query
      || !query.variant_id
      || !query.series_id
      || query.fallback_queries.length >= MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
    ))
  ) {
    throw new Error("P3 recall V5 query contract is invalid.");
  }

  const fetched = assertMarketFetchComplete(await fetchMarketListingsRaw({
    catalog,
    queries,
    sourceScope: MARKET_SOURCE_SCOPES.PLANNER_APIS,
    rakuten: { queryLimit: 10 },
    yahoo: { queryLimit: 10 },
  }));
  const safety = applyMarketCandidateSafety({
    records: fetched.records,
    queryPlan: queries,
    catalog,
  });
  const diagnostics = buildSanitizedMarketRequestDiagnostics(
    fetched.feedResults ?? [],
    fetched.duplicateQueriesSkipped ?? 0,
  );
  const candidateSummary = summarizeFetchedMarketCandidates({
    records: safety.records,
    rawCount: fetched.count,
    queryPlan: queries,
    feedResults: fetched.feedResults,
    catalog,
    safetyResult: safety,
  });
  const summary = {
    ...candidateSummary,
    request_diagnostics: diagnostics,
    no_result_variants: Math.max(0, targets.length - candidateSummary.variants_with_results),
    listing_upserts: 0,
    observations_created: 0,
    ingestion_runs_written: 0,
  };
  const preAuditMetrics = buildRecallV5PreAuditMetrics({
    candidateSummary: summary,
    requestDiagnostics: diagnostics,
    selectedVariantCount: targets.length,
  });

  let audit;
  try {
    audit = buildSanitizedMarketCandidateAudit({
      records: safety.records,
      queryPlan: queries,
      catalog,
      runContext: {
        mode: "dry-run",
        source_scope: "planner-apis",
        run_id: process.env.GITHUB_RUN_ID,
        head_sha: process.env.GITHUB_SHA,
        event_name: "workflow_dispatch",
        bounded_candidate_evidence: true,
      },
      summary,
    });
  } catch (error) {
    error.diagnostic_arm = {
      name,
      status: "blocked",
      selected_exact_variant_ids: queries.map((query) => query.variant_id),
      pre_audit_metrics: preAuditMetrics,
      request_diagnostics: diagnostics,
      failure: { reason: "candidate_audit_validation_failed" },
    };
    throw error;
  }

  const acceptedVariantIds = new Set(
    audit.candidates
      .filter((candidate) => candidate.assessment?.accepted)
      .map((candidate) => candidate.target?.variant_id),
  );
  const activeAcceptedVariantIds = new Set(
    audit.candidates
      .filter((candidate) => candidate.assessment?.accepted && candidate.listing?.status === "active")
      .map((candidate) => candidate.target?.variant_id),
  );
  const providerErrors = providerContamination({ request_diagnostics: diagnostics });
  const candidateKeys = audit.candidates
    .map((candidate) => candidate.candidate_key)
    .filter(Boolean)
    .sort();
  const metrics = {
    ...audit.result,
    raw_results_returned: diagnostics.aggregate.results_returned,
    normalized_records: diagnostics.aggregate.normalized_records,
    variants_with_results: candidateSummary.variants_with_results,
    accepted_unique_variant_count: acceptedVariantIds.size,
    active_accepted_unique_variant_count: activeAcceptedVariantIds.size,
    rejection_reason_counts: audit.retrieval_effectiveness.rejection_reason_counts,
  };

  return {
    name,
    provider_root_limits: { rakuten: 10, yahoo: 10 },
    query_profile: queries[0].query_profile,
    selected_exact_variant_ids: queries.map((query) => query.variant_id),
    selected_variant_count: targets.length,
    query_count: queries.length,
    root_query_count: queries.length,
    query_attempt_count: queries.reduce(
      (sum, query) => sum + 1 + query.fallback_queries.length,
      0,
    ),
    provider_request_count: diagnostics.aggregate.requests_attempted,
    raw_result_count: diagnostics.aggregate.results_returned,
    normalized_record_count: diagnostics.aggregate.normalized_records,
    zero_result_query_count: audit.retrieval_effectiveness.zero_result_queries,
    variants_with_results: candidateSummary.variants_with_results,
    accepted_unique_variants: acceptedVariantIds.size,
    review_count: audit.result.review_count,
    rejection_reasons: audit.retrieval_effectiveness.rejection_reason_counts,
    provider_errors: providerErrors,
    candidate_keys: candidateKeys,
    metrics,
    candidate_evidence: audit.candidate_evidence,
    request_diagnostics: diagnostics,
    per_variant: queries.map((query) => (
      buildRecallV5VariantArm(query, safety.records, audit.candidates, diagnostics)
    )),
  };
}

async function snapshotCounts() {
  const values = await Promise.all(TABLES.map((table) => fetchRowCount(table)));
  return Object.fromEntries(TABLES.map((table, index) => [table, values[index]]));
}

function write(value) {
  fs.writeFileSync(
    path.join(output, "market-p3-recall-v5-diagnostic.json"),
    `${JSON.stringify(value, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(output, "market-p3-recall-v5-diagnostic.md"),
    markdown(value),
  );
}

function markdown(value) {
  const lines = [
    "# P3 Recall V5 Diagnostic",
    `- Run: ${value.workflow?.run_id || "unknown"}`,
    `- Head SHA: ${value.workflow?.head_sha || "unknown"}`,
    `- Exact approved IDs: ${(value.approved_target_variant_ids ?? []).join(", ")}`,
    `- Exact target binding: ${value.exact_target_binding === true}`,
    `- Database writes: ${value.database_writes}`,
    `- Zero delta verified: ${value.zero_delta_verified === true}`,
    "",
    "## Production counts",
    `- Before: ${JSON.stringify(value.production_counts_before)}`,
    `- After: ${JSON.stringify(value.production_counts_after)}`,
    "",
  ];
  for (const arm of Object.values(value.arms ?? {})) {
    lines.push(
      `## Arm: ${arm.name}`,
      `- Selected exact variant IDs: ${JSON.stringify(arm.selected_exact_variant_ids ?? [])}`,
      `- Query count: ${arm.query_count ?? 0}`,
      `- Query attempts: ${arm.query_attempt_count ?? 0}`,
      `- Provider requests: ${arm.provider_request_count ?? 0}`,
      `- Raw results: ${arm.raw_result_count ?? 0}`,
      `- Normalized records: ${arm.normalized_record_count ?? 0}`,
      `- Zero-result queries: ${arm.zero_result_query_count ?? 0}`,
      `- Variants with results: ${arm.variants_with_results ?? 0}`,
      `- Accepted unique variants: ${arm.accepted_unique_variants ?? 0}`,
      `- Review count: ${arm.review_count ?? 0}`,
      `- Rejection reasons: ${JSON.stringify(arm.rejection_reasons ?? {})}`,
      `- Provider errors: ${JSON.stringify(arm.provider_errors ?? null)}`,
      `- Candidate keys: ${JSON.stringify(arm.candidate_keys ?? [])}`,
      "",
    );
  }
  lines.push(
    "## Per-variant comparison",
    "| Series | Variant | V2 results | V4 results | V5 results | V4 added | V5 added | V2 outcome | V4 outcome | V5 outcome | V4 query class | V5 query class |",
    "|---|---|---:|---:|---:|---|---|---|---|---|---|---|",
  );
  for (const row of value.per_variant_comparison ?? []) {
    lines.push(
      `| ${md(row.official_series)} | ${md(row.official_variant)} | ${row.v2_result_count ?? 0} | ${row.v4_result_count ?? 0} | ${row.v5_result_count ?? 0} | ${row.v4_added_result === true} | ${row.v5_added_result === true} | ${md(row.v2_outcome)} | ${md(row.v4_outcome)} | ${md(row.v5_outcome)} | ${md(row.v4_executed_query_class)} | ${md(row.v5_executed_query_class)} |`,
    );
  }
  lines.push(
    "",
    "## V5-only retrievals",
    "| Provider | Query | Title | Status | Type | Confidence | Accepted | Reason |",
    "|---|---|---|---|---|---:|---|---|",
  );
  for (const record of (value.per_variant_comparison ?? []).flatMap((row) => row.v5_only_records ?? [])) {
    lines.push(
      `| ${md(record.provider)} | ${md(record.executed_query)} | ${md(record.title)} | ${md(record.status)} | ${md(record.listing_type)} | ${record.confidence} | ${record.accepted} | ${md(record.safety_reason)} |`,
    );
  }
  lines.push("", "## Decision", `- ${JSON.stringify(value.decision ?? {})}`);
  return `${lines.join("\n")}\n`;
}

function md(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069﻿|\r\n]/g, " ")
    .slice(0, 300);
}

function comparable(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readOption(key) {
  const prefix = `--${key}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function safe(value, max) {
  return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, max);
}

function safeHead(value) {
  const text = String(value ?? "");
  return /^[0-9a-f]{40}$/.test(text) ? text : null;
}
