import { buildRecallV3VariantArm } from "./market-p3-recall-v3-diagnostic.js";

export function buildRecallV4VariantArm(query, records, candidates, requestDiagnostics) {
  const arm = buildRecallV3VariantArm(query, records, candidates, requestDiagnostics);
  const matched = candidates.filter((candidate) => candidate.target?.variant_id === query.variant_id);
  return {
    ...arm,
    rejected_records: matched.filter((candidate) => candidate.assessment?.accepted !== true).map((candidate) => ({
      reason: candidate.assessment?.reason ?? "review_required",
      provider: candidate.source?.provider ?? null,
      title: safeText(candidate.source?.title, 240),
      status: candidate.listing?.status ?? null,
      listing_type: candidate.assessment?.listing_type ?? null,
      confidence: candidate.assessment?.confidence ?? 0,
      executed_query: arm.executed_query,
    })),
  };
}

export function buildRecallV4Comparison(targets, series, arms) {
  return targets.map((variant, index) => {
    const v2 = arms.v2.per_variant[index];
    const v3 = arms.v3.per_variant[index];
    const v4 = arms.v4.per_variant[index];
    const v2Result = hasResult(v2); const v3Result = hasResult(v3); const v4Result = hasResult(v4);
    return {
      variant_id: variant.id,
      official_series: safeText(series[index]?.name, 300),
      official_variant: safeText(variant.name, 300),
      v2_has_result: v2Result,
      v3_added_result: !v2Result && v3Result,
      v4_added_result: !v3Result && v4Result,
      v2_accepted: v2.accepted,
      v3_newly_accepted: !v2.accepted && v3.accepted,
      v4_newly_accepted: !v3.accepted && v4.accepted,
      v4_executed_query: v4.executed_query,
      v4_provider_responsible: v4.providers_queried,
      v4_rejected_records: !v3Result && v4Result && !v4.accepted ? v4.rejected_records : [],
    };
  });
}

export function buildRecallV4Decision(arms, comparison, zeroDeltaVerified) {
  const v2 = arms.v2.metrics; const v3 = arms.v3.metrics; const v4 = arms.v4.metrics;
  const retrievalV3 = Number(v3.variants_with_results) - Number(v2.variants_with_results);
  const retrievalV4 = Number(v4.variants_with_results) - Number(v3.variants_with_results);
  const acceptedV3 = Number(v3.accepted_unique_variant_count) - Number(v2.accepted_unique_variant_count);
  const acceptedV4 = Number(v4.accepted_unique_variant_count) - Number(v3.accepted_unique_variant_count);
  const rejected = comparison.flatMap((entry) => entry.v4_rejected_records);
  const reasons = Object.fromEntries(rejected.reduce((map, entry) => map.set(entry.reason, (map.get(entry.reason) ?? 0) + 1), new Map()).entries());
  const providerErrors = Object.values(arms).some((arm) => {
    const aggregate = arm.request_diagnostics?.aggregate ?? {};
    return aggregate.requests_rate_limited > 0 || aggregate.requests_timed_out > 0 || aggregate.requests_permanently_failed > 0;
  });
  const label = !providerErrors && zeroDeltaVerified && acceptedV4 > 0
    ? "V4_PROMOTION_CANDIDATE"
    : retrievalV4 > 0 ? "RETRIEVAL_ONLY_IMPROVEMENT" : "NO_MATERIAL_IMPROVEMENT";
  return { retrieval_delta_v3_vs_v2: retrievalV3, retrieval_delta_v4_vs_v3: retrievalV4, accepted_unique_delta_v3_vs_v2: acceptedV3, accepted_unique_delta_v4_vs_v3: acceptedV4, v4_retrieval_win_count: comparison.filter((entry) => entry.v4_added_result).length, v4_accepted_win_count: comparison.filter((entry) => entry.v4_newly_accepted).length, v4_retrieval_but_rejected_count: rejected.length, top_v4_rejection_reasons: reasons, provider_errors: providerErrors, decision_label: label };
}

function hasResult(arm) { return Number(arm?.rakuten_result_count ?? 0) + Number(arm?.yahoo_result_count ?? 0) > 0; }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
