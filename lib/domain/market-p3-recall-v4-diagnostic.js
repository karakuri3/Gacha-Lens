import { buildRecallV3VariantArm } from "./market-p3-recall-v3-diagnostic.js";

export async function runRecallV4ArmsSequentially(arms, execute, results = {}) {
  for (const [name, planner] of arms) {
    const arm = await execute(name, planner);
    results[name] = arm;
    const contamination = providerContamination(arm);
    if (contamination) {
      const error = new Error("P3 recall v4 provider requests are contaminated.");
      error.diagnostic_failure = { arm: name, ...contamination };
      throw error;
    }
  }
  return results;
}

export function buildRecallV4VariantArm(query, records, candidates, requestDiagnostics) {
  const arm = buildRecallV3VariantArm(query, records, candidates, requestDiagnostics);
  const matched = candidates.filter((candidate) => candidate.target?.variant_id === query.variant_id);
  return {
    ...arm,
    candidate_evidence: matched.map((candidate) => evidenceForCandidate(candidate, records)),
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
      v4_only_records: difference(v4.candidate_evidence ?? [], v3.candidate_evidence ?? []),
      v4_only_accepted_records: [],
      v4_only_rejected_records: [],
    };
  }).map((entry) => ({
    ...entry,
    v4_only_accepted_records: entry.v4_only_records.filter((record) => record.accepted),
    v4_only_rejected_records: entry.v4_only_records.filter((record) => !record.accepted),
    v4_provider_responsible: [...new Set(entry.v4_only_records.map((record) => record.provider).filter(Boolean))].sort(),
  }));
}

export function buildRecallV4Decision(arms, comparison, zeroDeltaVerified) {
  const v2 = arms.v2.metrics; const v3 = arms.v3.metrics; const v4 = arms.v4.metrics;
  const retrievalV3 = Number(v3.variants_with_results) - Number(v2.variants_with_results);
  const retrievalV4 = Number(v4.variants_with_results) - Number(v3.variants_with_results);
  const acceptedV3 = Number(v3.accepted_unique_variant_count) - Number(v2.accepted_unique_variant_count);
  const acceptedV4 = Number(v4.accepted_unique_variant_count) - Number(v3.accepted_unique_variant_count);
  const rejected = comparison.flatMap((entry) => entry.v4_only_rejected_records);
  const reasons = Object.fromEntries(rejected.reduce((map, entry) => map.set(entry.safety_reason, (map.get(entry.safety_reason) ?? 0) + 1), new Map()).entries());
  const providerErrors = Object.values(arms).some((arm) => providerContamination(arm));
  const label = !providerErrors && zeroDeltaVerified && acceptedV4 > 0
    ? "V4_PROMOTION_CANDIDATE"
    : retrievalV4 > 0 ? "RETRIEVAL_ONLY_IMPROVEMENT" : "NO_MATERIAL_IMPROVEMENT";
  return { retrieval_delta_v3_vs_v2: retrievalV3, retrieval_delta_v4_vs_v3: retrievalV4, accepted_unique_delta_v3_vs_v2: acceptedV3, accepted_unique_delta_v4_vs_v3: acceptedV4, v4_retrieval_win_count: comparison.filter((entry) => entry.v4_added_result).length, v4_accepted_win_count: comparison.filter((entry) => entry.v4_newly_accepted).length, v4_only_record_count: comparison.flatMap((entry) => entry.v4_only_records).length, v4_only_accepted_record_count: comparison.flatMap((entry) => entry.v4_only_accepted_records).length, v4_only_rejected_record_count: rejected.length, v4_retrieval_but_rejected_count: rejected.length, top_v4_rejection_reasons: reasons, provider_errors: providerErrors, decision_label: label };
}

export function providerContamination(arm = {}) {
  const aggregate = arm.request_diagnostics?.aggregate ?? {};
  const failed = [
    ["rate_limited", Number(aggregate.requests_rate_limited ?? 0)],
    ["timeout", Number(aggregate.requests_timed_out ?? 0)],
    ["permanent_failure", Number(aggregate.requests_permanently_failed ?? 0)],
  ].filter(([, count]) => count > 0).map(([category]) => category);
  if (!failed.length) return null;
  const providers = Object.entries(arm.request_diagnostics?.providers ?? {})
    .filter(([, summary]) => Number(summary.requests_rate_limited ?? 0) > 0 || Number(summary.requests_timed_out ?? 0) > 0 || Number(summary.requests_permanently_failed ?? 0) > 0)
    .map(([provider]) => provider).sort();
  return { failure_categories: failed, providers };
}

function difference(v4Records, v3Records) {
  const prior = new Set(v3Records.map((record) => record.candidate_key));
  return v4Records.filter((record) => !prior.has(record.candidate_key));
}

function evidenceForCandidate(candidate, records) {
  const provider = candidate.source?.provider ?? null;
  const listingId = candidate.source?.listing_id ?? null;
  const record = records.find((entry) => (
    normalizeProvider(entry) === provider
    && String(entry.raw?.itemCode ?? entry.raw?.code ?? entry.id ?? "") === String(listingId ?? "")
  ));
  return {
    candidate_key: candidate.candidate_key,
    listing_key: `${provider ?? "unknown"}:${listingId ?? "unknown"}`,
    provider,
    executed_query: safeText(record?.raw?.executed_query ?? record?.raw?.query?.query ?? "", 300),
    title: safeText(candidate.listing?.title, 240),
    status: candidate.listing?.status ?? null,
    listing_type: candidate.listing?.listing_type ?? null,
    confidence: candidate.assessment?.confidence ?? 0,
    accepted: candidate.assessment?.accepted === true,
    safety_reason: candidate.assessment?.reason ?? "review_required",
    target_variant_id: candidate.target?.variant_id ?? null,
  };
}

function normalizeProvider(record) {
  const value = String(record?.source ?? record?.raw?.provider ?? "").trim().toLowerCase();
  return value === "rakuten" ? "rakuten_ichiba" : value === "yahoo" ? "yahoo_shopping" : value;
}

function hasResult(arm) { return Number(arm?.rakuten_result_count ?? 0) + Number(arm?.yahoo_result_count ?? 0) > 0; }
function safeText(value, max) { return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
