const PROVIDER_NAMES = {
  rakuten_ichiba: "rakuten",
  yahoo_shopping: "yahoo",
};
const CANDIDATE_KEY = /^[0-9a-f]{16}$/;

export function buildMarketRetrievalEffectiveness({ queryPlan = [], requestDiagnostics, candidates = [], summary = {} } = {}) {
  const discovery = (requestDiagnostics?.queries ?? []).filter((entry) => entry.request_kind === "discovery");
  const providers = {};
  for (const provider of Object.keys(PROVIDER_NAMES)) {
    const entries = discovery.filter((entry) => entry.provider === provider);
    providers[PROVIDER_NAMES[provider]] = summarizeProvider(entries);
  }

  const acceptedKeys = candidates
    .filter((candidate) => candidate.assessment?.accepted === true && CANDIDATE_KEY.test(candidate.candidate_key))
    .map((candidate) => candidate.candidate_key)
    .sort();
  const rejectionReasonCounts = mergeCounts(
    discovery.map((entry) => entry.rejection_reason_counts),
    [summary.candidate_rejection_reason_counts],
  );
  const zeroResultQueries = discovery.filter((entry) => entry.ok && entry.results_returned === 0).length;
  if (zeroResultQueries) rejectionReasonCounts.api_zero_results = zeroResultQueries;
  if (Number(summary.duplicate_listings) > 0) rejectionReasonCounts.duplicate = Number(summary.duplicate_listings);

  const result = {
    variants_selected: nonnegativeInteger(summary.selected_variants ?? queryPlan.length),
    queries_generated: queryPlan.reduce((sum, query) => (
      sum + 1 + (Array.isArray(query.fallback_queries) ? query.fallback_queries.length : 0)
    ), 0),
    queries_executed: discovery.length,
    results_returned_by_provider: providers,
    zero_result_queries: zeroResultQueries,
    normalized_records: discovery.reduce((sum, entry) => sum + nonnegativeInteger(entry.normalized_records), 0),
    records_rejected: discovery.reduce((sum, entry) => sum + nonnegativeInteger(entry.records_rejected), 0),
    rejection_reason_counts: sortCounts(rejectionReasonCounts),
    variant_matches: nonnegativeInteger(summary.variant_matches),
    review_required_count: nonnegativeInteger(summary.review_required_count),
    accepted_candidate_count: acceptedKeys.length,
    accepted_candidate_keys: acceptedKeys,
  };
  validateMarketRetrievalEffectiveness(result);
  return result;
}

export function validateMarketRetrievalEffectiveness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Market retrieval effectiveness is missing.");
  for (const field of [
    "variants_selected",
    "queries_generated",
    "queries_executed",
    "zero_result_queries",
    "normalized_records",
    "records_rejected",
    "variant_matches",
    "review_required_count",
    "accepted_candidate_count",
  ]) nonnegativeInteger(value[field], field);
  if (!Array.isArray(value.accepted_candidate_keys) || value.accepted_candidate_keys.some((key) => !CANDIDATE_KEY.test(key))) {
    throw new Error("Market retrieval effectiveness candidate keys are invalid.");
  }
  if (new Set(value.accepted_candidate_keys).size !== value.accepted_candidate_keys.length) {
    throw new Error("Market retrieval effectiveness candidate keys are duplicated.");
  }
  if (value.accepted_candidate_count !== value.accepted_candidate_keys.length) {
    throw new Error("Market retrieval effectiveness accepted count is inconsistent.");
  }
  if (value.zero_result_queries > value.queries_executed) {
    throw new Error("Market retrieval effectiveness query totals are inconsistent.");
  }
  for (const provider of ["rakuten", "yahoo"]) validateProvider(value.results_returned_by_provider?.[provider]);
  if (!value.rejection_reason_counts || typeof value.rejection_reason_counts !== "object" || Array.isArray(value.rejection_reason_counts)) {
    throw new Error("Market retrieval effectiveness rejection reasons are invalid.");
  }
  for (const count of Object.values(value.rejection_reason_counts)) nonnegativeInteger(count, "rejection reason count");
  return true;
}

function summarizeProvider(entries) {
  return {
    queries_executed: entries.length,
    results_returned: entries.reduce((sum, entry) => sum + nonnegativeInteger(entry.results_returned), 0),
    zero_result_queries: entries.filter((entry) => entry.ok && entry.results_returned === 0).length,
    normalized_records: entries.reduce((sum, entry) => sum + nonnegativeInteger(entry.normalized_records), 0),
    records_rejected: entries.reduce((sum, entry) => sum + nonnegativeInteger(entry.records_rejected), 0),
  };
}

function validateProvider(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Market retrieval provider diagnostics are missing.");
  for (const field of ["queries_executed", "results_returned", "zero_result_queries", "normalized_records", "records_rejected"]) {
    nonnegativeInteger(value[field], `provider ${field}`);
  }
  if (value.zero_result_queries > value.queries_executed) throw new Error("Provider zero-result count is inconsistent.");
}

function mergeCounts(...groups) {
  const result = {};
  for (const group of groups.flat()) {
    for (const [key, value] of Object.entries(group ?? {})) {
      const normalized = String(key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!normalized) continue;
      result[normalized] = (result[normalized] ?? 0) + nonnegativeInteger(value);
    }
  }
  return result;
}

function sortCounts(value) {
  return Object.fromEntries(Object.entries(value).filter(([, count]) => count > 0).sort(([left], [right]) => left.localeCompare(right)));
}

function nonnegativeInteger(value, label = "count") {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) throw new Error(`Invalid ${label}.`);
  return number;
}
