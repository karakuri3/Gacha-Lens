import { buildRecallV4VariantArm, providerContamination } from "./market-p3-recall-v4-diagnostic.js";
import {
  normalizeRecallSeriesAlias,
  normalizeRecallVariantAlias,
  normalizeRecallV4SeriesAlias,
  normalizeRecallV4VariantAlias,
  normalizeRecallV5SeriesAnchor,
  normalizeRecallV5VariantAlias,
} from "../fetchers/market-seed-query-planner.js";
import { MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT } from "../fetchers/market-request-budget.js";

const CONFIRMATION = "APPROVE_P3_RECALL_V5_DIAGNOSTIC";
const HEAD_SHA = /^[0-9a-f]{40}$/;
const DIAGNOSTIC_ARMS = new Set(["v2", "v4", "v5"]);

export const P3_RECALL_V5_DIAGNOSTIC_CONFIRMATION = CONFIRMATION;
export const P3_RECALL_V5_DIAGNOSTIC_LIMIT = 10;

export function validateP3RecallV5DiagnosticInvocation({
  event_name,
  ref,
  confirmation,
  expected_main_sha,
  head_sha,
  origin_main_sha,
} = {}) {
  if (event_name !== "workflow_dispatch" || ref !== "refs/heads/main" || confirmation !== CONFIRMATION) {
    throw new Error("P3 recall V5 diagnostic invocation is not authorized.");
  }
  const expected = String(expected_main_sha ?? "").trim();
  const head = String(head_sha ?? "").trim();
  const origin = String(origin_main_sha ?? "").trim();
  if (
    !HEAD_SHA.test(expected)
    || !HEAD_SHA.test(head)
    || !HEAD_SHA.test(origin)
    || expected !== head
    || expected !== origin
  ) {
    throw new Error("P3 recall V5 diagnostic exact-main contract failed.");
  }
  return true;
}

export function sanitizeRecallDiagnosticQueryPlan({
  name,
  queries = [],
  targets = [],
  series = [],
  catalog = {},
} = {}) {
  if (!DIAGNOSTIC_ARMS.has(name)) throw new Error("P3 recall V5 diagnostic arm is unsupported.");
  if (name === "v2") return { queries: structuredClone(queries), rejected_fallbacks: [] };
  const rejected = [];
  const safeQueries = queries.map((query, index) => {
    const variant = targets[index];
    const parent = series[index];
    const fallbacks = (query?.fallback_queries ?? []).filter((fallback, fallbackIndex) => {
      const assessment = assessRecallFallback({
        fallback,
        variant,
        parent,
        catalog,
      });
      if (assessment.safe) return true;
      rejected.push({
        arm: name,
        variant_id: String(variant?.id ?? ""),
        series_id: String(parent?.id ?? ""),
        query_class: `fallback_${fallbackIndex + 1}`,
        reason: assessment.reason,
        collision_variant_ids: assessment.collision_variant_ids,
      });
      return false;
    });
    return { ...query, fallback_queries: fallbacks };
  });
  return { queries: safeQueries, rejected_fallbacks: rejected };
}

export function assertRecallV5DiagnosticQueryPlan({
  name,
  queries = [],
  targets = [],
  series = [],
  v2Queries = [],
} = {}) {
  if (!DIAGNOSTIC_ARMS.has(name)) throw new Error("P3 recall V5 diagnostic arm is unsupported.");
  if (
    queries.length !== P3_RECALL_V5_DIAGNOSTIC_LIMIT
    || targets.length !== P3_RECALL_V5_DIAGNOSTIC_LIMIT
    || series.length !== P3_RECALL_V5_DIAGNOSTIC_LIMIT
    || v2Queries.length !== P3_RECALL_V5_DIAGNOSTIC_LIMIT
  ) {
    throw new Error("P3 recall V5 diagnostic query plan must contain the exact approved 10 targets.");
  }

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const variant = targets[index];
    const parent = series[index];
    const baseline = v2Queries[index];
    if (
      !query
      || !variant
      || !parent
      || String(query.variant_id ?? "") !== String(variant.id ?? "")
      || String(query.series_id ?? "") !== String(parent.id ?? "")
      || String(baseline?.variant_id ?? "") !== String(variant.id ?? "")
      || String(baseline?.series_id ?? "") !== String(parent.id ?? "")
    ) {
      throw new Error("P3 recall V5 diagnostic query plan lost exact target identity.");
    }

    const root = comparable(query.query);
    const baselineRoot = comparable(baseline.query);
    if (!root || root !== baselineRoot) {
      throw new Error("P3 recall V5 diagnostic arm must preserve the V2 exact root.");
    }

    const fallbacks = Array.isArray(query.fallback_queries) ? query.fallback_queries : [];
    const attempts = [query.query, ...fallbacks];
    if (
      attempts.length > MARKET_MAX_QUERY_ATTEMPTS_PER_ROOT
      || new Set(attempts.map(comparable)).size !== attempts.length
    ) {
      throw new Error("P3 recall V5 diagnostic query attempts exceed the reviewed budget.");
    }
    if (!fallbacks.length) continue;

    const safeSeriesAnchor = normalizeRecallV5SeriesAnchor(parent.name);
    const safeVariantAnchor = normalizeRecallV5VariantAlias(variant.name);
    if (!meaningfulAnchor(safeSeriesAnchor, 4) || !meaningfulAnchor(safeVariantAnchor, 2)) {
      throw new Error("P3 recall V5 diagnostic generic-only fallback is not allowed.");
    }

    const seriesAnchors = [
      normalizeRecallSeriesAlias(parent.name),
      normalizeRecallV4SeriesAlias(parent.name),
      safeSeriesAnchor,
    ].filter((value) => meaningfulAnchor(value, 4)).map(comparable);
    const variantAnchors = [
      normalizeRecallVariantAlias(variant.name),
      normalizeRecallV4VariantAlias(variant.name),
      safeVariantAnchor,
    ].filter((value) => meaningfulAnchor(value, 2)).map(comparable);

    for (const fallback of fallbacks) {
      const normalized = comparable(fallback);
      if (
        !normalized
        || !seriesAnchors.some((anchor) => normalized.includes(anchor))
        || !variantAnchors.some((anchor) => normalized.includes(anchor))
      ) {
        throw new Error("P3 recall V5 diagnostic fallback lost a catalog identity anchor.");
      }
    }
  }
  return true;
}

export async function runRecallV5ArmsSequentially(arms, execute, results = {}) {
  for (const [name, planner] of arms) {
    try {
      const arm = await execute(name, planner);
      results[name] = arm;
      const contamination = providerContamination(arm);
      if (contamination) {
        const error = new Error("P3 recall v5 provider requests are contaminated.");
        error.diagnostic_failure = { arm: name, ...contamination };
        throw error;
      }
    } catch (error) {
      if (error.diagnostic_arm) results[name] = error.diagnostic_arm;
      throw error;
    }
  }
  return results;
}

export function buildRecallV5VariantArm(query, records, candidates, diagnostics) {
  return buildRecallV4VariantArm(query, records, candidates, diagnostics);
}

export function buildRecallV5Comparison(targets, series, arms) {
  return targets.map((variant, index) => {
    const v2 = arms.v2.per_variant[index];
    const v4 = arms.v4.per_variant[index];
    const v5 = arms.v5.per_variant[index];
    const v2Result = hasResult(v2);
    const v4Result = hasResult(v4);
    const v5Result = hasResult(v5);
    const v4Only = difference(v4.candidate_evidence ?? [], v2.candidate_evidence ?? []);
    const v5Only = difference(v5.candidate_evidence ?? [], v4.candidate_evidence ?? []);
    const v4Attempts = queryAttemptSet(v4);
    const v5Attempts = queryAttemptSet(v5);
    const v5OnlyFallbacks = new Set(
      (v5.fallback_queries ?? [])
        .map(comparable)
        .filter((query) => query && !v4Attempts.has(query)),
    );
    const v5NewlyAccepted = !v4.accepted && v5.accepted;
    const v5AcceptedEvidence = (v5.candidate_evidence ?? []).filter((record) => record.accepted);
    const v5RecognizedAcceptedEvidence = v5NewlyAccepted
      ? v5AcceptedEvidence.filter((record) => v5Attempts.has(comparable(record.executed_query)))
      : [];
    const v5StrategyAttributedAcceptedRecords = v5RecognizedAcceptedEvidence.filter(
      (record) => v5OnlyFallbacks.has(comparable(record.executed_query)),
    );
    const v5SharedQueryAcceptedRecords = v5RecognizedAcceptedEvidence.filter(
      (record) => v4Attempts.has(comparable(record.executed_query)),
    );
    const v5UnattributedAcceptedRecords = v5NewlyAccepted
      ? v5AcceptedEvidence.filter((record) => !v5Attempts.has(comparable(record.executed_query)))
      : [];
    const v5AttributionComplete = !v5NewlyAccepted || (
      v5AcceptedEvidence.length > 0
      && v5UnattributedAcceptedRecords.length === 0
    );

    return {
      variant_id: variant.id,
      official_series: safeText(series[index]?.name, 300),
      official_variant: safeText(variant.name, 300),
      v2_has_result: v2Result,
      v4_added_result: !v2Result && v4Result,
      v5_added_result: !v4Result && v5Result,
      v2_result_count: resultCount(v2),
      v4_result_count: resultCount(v4),
      v5_result_count: resultCount(v5),
      v2_candidate_count: (v2.candidate_evidence ?? []).length,
      v4_candidate_count: (v4.candidate_evidence ?? []).length,
      v5_candidate_count: (v5.candidate_evidence ?? []).length,
      v2_outcome: outcome(v2),
      v4_outcome: outcome(v4),
      v5_outcome: outcome(v5),
      v2_safety_reasons: [...(v2.safety_reasons ?? [])],
      v4_safety_reasons: [...(v4.safety_reasons ?? [])],
      v5_safety_reasons: [...(v5.safety_reasons ?? [])],
      v2_executed_query_class: executedQueryClass(v2),
      v4_executed_query_class: executedQueryClass(v4),
      v5_executed_query_class: executedQueryClass(v5),
      v2_responsible_providers: responsibleProviders(v2),
      v4_responsible_providers: responsibleProviders(v4),
      v5_responsible_providers: responsibleProviders(v5),
      v2_accepted: v2.accepted,
      v4_newly_accepted: !v2.accepted && v4.accepted,
      v5_newly_accepted: v5NewlyAccepted,
      v4_only_records: v4Only,
      v4_provider_responsible: [...new Set(v4Only.map((record) => record.provider).filter(Boolean))].sort(),
      v5_executed_query: v5.executed_query,
      v5_only_records: v5Only,
      v5_only_accepted_records: v5Only.filter((record) => record.accepted),
      v5_only_rejected_records: v5Only.filter((record) => !record.accepted),
      v5_provider_responsible: [...new Set(v5Only.map((record) => record.provider).filter(Boolean))].sort(),
      v4_attempt_query_count: v4Attempts.size,
      v5_attempt_query_count: v5Attempts.size,
      v5_only_safe_fallback_count: v5OnlyFallbacks.size,
      v5_strategy_attributed_accepted: v5StrategyAttributedAcceptedRecords.length > 0,
      v5_strategy_attributed_accepted_records: v5StrategyAttributedAcceptedRecords,
      v5_shared_query_accepted_records: v5SharedQueryAcceptedRecords,
      v5_unattributed_accepted_records: v5UnattributedAcceptedRecords,
      v5_attribution_complete: v5AttributionComplete,
    };
  });
}

export function buildRecallV5Decision(arms, comparison, zeroDeltaVerified) {
  const v2 = arms.v2.metrics;
  const v4 = arms.v4.metrics;
  const v5 = arms.v5.metrics;
  const retrievalV4 = Number(v4.variants_with_results) - Number(v2.variants_with_results);
  const retrievalV5 = Number(v5.variants_with_results) - Number(v4.variants_with_results);
  const acceptedV4 = Number(v4.accepted_unique_variant_count) - Number(v2.accepted_unique_variant_count);
  const acceptedV5 = Number(v5.accepted_unique_variant_count) - Number(v4.accepted_unique_variant_count);
  const rejected = comparison.flatMap((row) => row.v5_only_rejected_records ?? []);
  const reasons = Object.fromEntries(rejected.reduce((map, entry) => map.set(entry.safety_reason, (map.get(entry.safety_reason) ?? 0) + 1), new Map()).entries());
  const providerErrors = Object.values(arms).some((arm) => providerContamination(arm));
  const evidenceComplete = Object.values(arms).every((arm) => arm?.metrics?.report_complete === true && Number(arm.metrics?.truncated_count) === 0);
  const strategyAttributedTargetIds = uniqueTargetIds(
    comparison.filter((row) => (
      row.v5_newly_accepted === true
      && row.v5_attribution_complete === true
      && row.v5_strategy_attributed_accepted === true
    )),
  );
  const sharedQueryAcceptedTargetIds = uniqueTargetIds(
    comparison.filter((row) => (
      row.v5_newly_accepted === true
      && (row.v5_shared_query_accepted_records ?? []).length > 0
    )),
  );
  const unattributedAcceptedTargetIds = uniqueTargetIds(
    comparison.filter((row) => (
      row.v5_newly_accepted === true
      && row.v5_attribution_complete !== true
    )),
  );
  const attributionComplete = comparison.every((row) => row.v5_attribution_complete !== false);
  const label = (
    !providerErrors
    && evidenceComplete
    && attributionComplete
    && zeroDeltaVerified
    && strategyAttributedTargetIds.length > 0
  )
    ? "V5_PROMOTION_CANDIDATE"
    : retrievalV5 > 0 ? "RETRIEVAL_ONLY_IMPROVEMENT" : "NO_MATERIAL_IMPROVEMENT";
  return {
    retrieval_delta_v4_vs_v2: retrievalV4,
    retrieval_delta_v5_vs_v4: retrievalV5,
    accepted_unique_delta_v4_vs_v2: acceptedV4,
    accepted_unique_delta_v5_vs_v4: acceptedV5,
    v5_retrieval_win_count: comparison.filter((row) => row.v5_added_result).length,
    v5_accepted_win_count: comparison.filter((row) => row.v5_newly_accepted).length,
    v5_only_record_count: comparison.flatMap((row) => row.v5_only_records ?? []).length,
    v5_only_accepted_record_count: comparison.flatMap((row) => row.v5_only_accepted_records ?? []).length,
    v5_only_rejected_record_count: rejected.length,
    top_v5_rejection_reasons: reasons,
    provider_errors: providerErrors,
    candidate_evidence_complete: evidenceComplete,
    zero_delta_verified: zeroDeltaVerified,
    v5_strategy_attributed_accepted_variant_count: strategyAttributedTargetIds.length,
    v5_strategy_attributed_target_ids: strategyAttributedTargetIds,
    v5_shared_query_new_accepted_variant_count: sharedQueryAcceptedTargetIds.length,
    v5_shared_query_new_accepted_target_ids: sharedQueryAcceptedTargetIds,
    v5_unattributed_new_accepted_variant_count: unattributedAcceptedTargetIds.length,
    v5_attribution_complete: attributionComplete,
    decision_label: label,
  };
}

export function buildRecallV5PreAuditMetrics({
  candidateSummary = {},
  requestDiagnostics = {},
  selectedVariantCount = 0,
  candidateLimit = 200,
} = {}) {
  const aggregate = requestDiagnostics.aggregate ?? {};
  const fullCandidateCount = nonnegative(candidateSummary.safety_assessed_records);
  return {
    selected_variant_count: nonnegative(selectedVariantCount),
    full_candidate_count: fullCandidateCount,
    candidate_evidence_limit: nonnegative(candidateLimit),
    candidate_evidence_overflow: Math.max(0, fullCandidateCount - nonnegative(candidateLimit)),
    variants_with_results: nonnegative(candidateSummary.variants_with_results),
    no_result_variant_count: nonnegative(candidateSummary.no_result_variants),
    accepted_count: nonnegative(candidateSummary.accepted_listings),
    review_required_count: nonnegative(candidateSummary.review_required_count),
    requests_attempted: nonnegative(aggregate.requests_attempted),
    requests_succeeded: nonnegative(aggregate.requests_succeeded),
    requests_rate_limited: nonnegative(aggregate.requests_rate_limited),
    requests_timed_out: nonnegative(aggregate.requests_timed_out),
    requests_permanently_failed: nonnegative(aggregate.requests_permanently_failed),
    results_returned: nonnegative(aggregate.results_returned),
    normalized_records: nonnegative(aggregate.normalized_records),
  };
}

function assessRecallFallback({ fallback, variant, parent, catalog }) {
  const safeSeriesAnchor = normalizeRecallV5SeriesAnchor(parent?.name);
  const safeVariantAnchor = normalizeRecallV5VariantAlias(variant?.name);
  if (!meaningfulAnchor(safeSeriesAnchor, 4) || !meaningfulAnchor(safeVariantAnchor, 2)) {
    return { safe: false, reason: "generic_anchor", collision_variant_ids: [] };
  }

  const profiles = [
    {
      series: normalizeRecallSeriesAlias(parent?.name),
      variant: normalizeRecallVariantAlias(variant?.name),
      normalizeSeries: normalizeRecallSeriesAlias,
      normalizeVariant: normalizeRecallVariantAlias,
    },
    {
      series: normalizeRecallV4SeriesAlias(parent?.name),
      variant: normalizeRecallV4VariantAlias(variant?.name),
      normalizeSeries: normalizeRecallV4SeriesAlias,
      normalizeVariant: normalizeRecallV4VariantAlias,
    },
    {
      series: safeSeriesAnchor,
      variant: safeVariantAnchor,
      normalizeSeries: normalizeRecallV5SeriesAnchor,
      normalizeVariant: normalizeRecallV5VariantAlias,
    },
  ];
  const fallbackComparable = comparable(fallback);
  const profile = profiles.find((entry) => (
    meaningfulAnchor(entry.series, 4)
    && meaningfulAnchor(entry.variant, 2)
    && comparable(`${entry.series} ${entry.variant}`) === fallbackComparable
  ));
  if (!profile) {
    return { safe: false, reason: "anchor_profile_unknown", collision_variant_ids: [] };
  }

  const seriesTerms = anchorTerms(profile.series);
  const targetVariant = comparable(profile.variant);
  const collisions = [];
  for (const otherVariant of catalog?.variants ?? []) {
    if (
      String(otherVariant?.id ?? "") === String(variant?.id ?? "")
      || String(otherVariant?.series_id ?? "") === String(parent?.id ?? "")
      || String(otherVariant?.variant_type ?? "").toLowerCase() === "provisional"
    ) continue;
    const otherParent = catalog?.seriesById?.get(otherVariant.series_id)
      ?? (catalog?.series ?? []).find((entry) => entry.id === otherVariant.series_id);
    if (!otherParent) continue;
    const otherVariantAnchor = comparable(profile.normalizeVariant(otherVariant.name));
    if (!targetVariant || otherVariantAnchor !== targetVariant) continue;
    const otherSeries = comparable(profile.normalizeSeries(otherParent.name));
    if (!seriesTerms.every((term) => otherSeries.includes(term))) continue;
    collisions.push(String(otherVariant.id ?? ""));
    if (collisions.length >= 10) break;
  }
  return collisions.length
    ? { safe: false, reason: "catalog_identity_collision", collision_variant_ids: collisions }
    : { safe: true, reason: null, collision_variant_ids: [] };
}

function anchorTerms(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .split(/\s+/)
    .map(comparable)
    .filter((value) => value.length >= 1);
}

function queryAttemptSet(arm = {}) {
  return new Set(
    [arm.root_query, ...(arm.fallback_queries ?? [])]
      .map(comparable)
      .filter(Boolean),
  );
}

function uniqueTargetIds(rows = []) {
  return [...new Set(
    rows.map((row) => String(row.variant_id ?? "").trim()).filter(Boolean),
  )].sort();
}

function difference(current, previous) {
  const prior = new Set(previous.map((record) => record.candidate_key));
  return current.filter((record) => !prior.has(record.candidate_key));
}

function resultCount(arm) {
  return Number(arm?.rakuten_result_count ?? 0) + Number(arm?.yahoo_result_count ?? 0);
}

function hasResult(arm) {
  return resultCount(arm) > 0;
}

function outcome(arm) {
  if (arm?.accepted === true) return "accepted";
  if (arm?.review === true) return "review";
  if (hasResult(arm)) return "rejected";
  return "no_result";
}

function responsibleProviders(arm) {
  return [...new Set(
    (arm?.candidate_evidence ?? []).map((record) => record.provider).filter(Boolean),
  )].sort();
}

function executedQueryClass(arm) {
  const executed = comparable(arm?.executed_query);
  if (!executed) return null;
  if (executed === comparable(arm?.root_query)) return "root";
  const index = (arm?.fallback_queries ?? []).findIndex((query) => comparable(query) === executed);
  return index >= 0 ? `fallback_${index + 1}` : "unknown";
}

function meaningfulAnchor(value, minimum) {
  return comparable(value).length >= minimum;
}

function comparable(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function safeText(value, max) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function nonnegative(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
}
