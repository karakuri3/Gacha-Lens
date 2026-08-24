import { buildRecallV4VariantArm, providerContamination, runRecallV4ArmsSequentially } from "./market-p3-recall-v4-diagnostic.js";

export const runRecallV5ArmsSequentially = runRecallV4ArmsSequentially;

export function buildRecallV5VariantArm(query, records, candidates, diagnostics) {
  return buildRecallV4VariantArm(query, records, candidates, diagnostics);
}

export function buildRecallV5Comparison(targets, series, arms) {
  return targets.map((variant, index) => {
    const v2 = arms.v2.per_variant[index]; const v4 = arms.v4.per_variant[index]; const v5 = arms.v5.per_variant[index];
    const v2Result = hasResult(v2); const v4Result = hasResult(v4); const v5Result = hasResult(v5);
    const v5Only = difference(v5.candidate_evidence ?? [], v4.candidate_evidence ?? []);
    return {
      variant_id: variant.id, official_series: safeText(series[index]?.name, 300), official_variant: safeText(variant.name, 300),
      v2_has_result: v2Result, v4_added_result: !v2Result && v4Result, v5_added_result: !v4Result && v5Result,
      v2_candidate_count: (v2.candidate_evidence ?? []).length, v4_candidate_count: (v4.candidate_evidence ?? []).length, v5_candidate_count: (v5.candidate_evidence ?? []).length,
      v2_accepted: v2.accepted, v4_newly_accepted: !v2.accepted && v4.accepted, v5_newly_accepted: !v4.accepted && v5.accepted,
      v5_executed_query: v5.executed_query, v5_only_records: v5Only,
      v5_only_accepted_records: v5Only.filter((record) => record.accepted), v5_only_rejected_records: v5Only.filter((record) => !record.accepted),
      v5_provider_responsible: [...new Set(v5Only.map((record) => record.provider).filter(Boolean))].sort(),
    };
  });
}

export function buildRecallV5Decision(arms, comparison, zeroDeltaVerified) {
  const v2 = arms.v2.metrics; const v4 = arms.v4.metrics; const v5 = arms.v5.metrics;
  const retrievalV4 = Number(v4.variants_with_results) - Number(v2.variants_with_results);
  const retrievalV5 = Number(v5.variants_with_results) - Number(v4.variants_with_results);
  const acceptedV4 = Number(v4.accepted_unique_variant_count) - Number(v2.accepted_unique_variant_count);
  const acceptedV5 = Number(v5.accepted_unique_variant_count) - Number(v4.accepted_unique_variant_count);
  const rejected = comparison.flatMap((row) => row.v5_only_rejected_records);
  const reasons = Object.fromEntries(rejected.reduce((map, entry) => map.set(entry.safety_reason, (map.get(entry.safety_reason) ?? 0) + 1), new Map()).entries());
  const providerErrors = Object.values(arms).some((arm) => providerContamination(arm));
  const label = !providerErrors && zeroDeltaVerified && acceptedV5 > 0 ? "V5_PROMOTION_CANDIDATE" : retrievalV5 > 0 ? "RETRIEVAL_ONLY_IMPROVEMENT" : "NO_MATERIAL_IMPROVEMENT";
  return { retrieval_delta_v4_vs_v2: retrievalV4, retrieval_delta_v5_vs_v4: retrievalV5, accepted_unique_delta_v4_vs_v2: acceptedV4, accepted_unique_delta_v5_vs_v4: acceptedV5, v5_retrieval_win_count: comparison.filter((row) => row.v5_added_result).length, v5_accepted_win_count: comparison.filter((row) => row.v5_newly_accepted).length, v5_only_record_count: comparison.flatMap((row) => row.v5_only_records).length, v5_only_accepted_record_count: comparison.flatMap((row) => row.v5_only_accepted_records).length, v5_only_rejected_record_count: rejected.length, top_v5_rejection_reasons: reasons, provider_errors: providerErrors, zero_delta_verified: zeroDeltaVerified, decision_label: label };
}

function difference(current, previous) { const prior = new Set(previous.map((record) => record.candidate_key)); return current.filter((record) => !prior.has(record.candidate_key)); }
function hasResult(arm) { return Number(arm?.rakuten_result_count ?? 0) + Number(arm?.yahoo_result_count ?? 0) > 0; }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069﻿]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
